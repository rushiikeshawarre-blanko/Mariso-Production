import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import uuid

from fastapi import HTTPException
import requests
from pydantic import ValidationError
from pymongo.errors import DuplicateKeyError
import pytest

from core import config
from core.db_indexes import create_payment_attempt_indexes
from models.order import RazorpayCheckoutCreate
from services import order_service, coupon_service, razorpay_order_service as checkout
from services import razorpay_service as gateway
from services.payment_money import paise


def run(coroutine):
    return asyncio.run(coroutine)


def payload(**overrides):
    return RazorpayCheckoutCreate(**{
        'request_id': str(uuid.uuid4()), 'items': [{'product_id': 'p1', 'quantity': 2}],
        'billing_name': 'Test', 'billing_phone': '9000000000',
        'billing_email': 'test@example.com', 'billing_address': 'Test address',
        'billing_city': 'Test city', 'billing_state': 'Test state', 'billing_postal_code': '400001',
        **overrides,
    })


def matches(doc, query):
    for key, value in query.items():
        current = doc.get(key)
        if isinstance(value, dict):
            for op, expected in value.items():
                if op == '$gte' and not (current is not None and current >= expected): return False
                if op == '$exists' and (key in doc) != expected: return False
                if op not in {'$gte', '$exists'}: raise AssertionError('Unsupported fake filter: ' + op)
        elif current != value:
            return False
    return True


class Collection:
    def __init__(self, documents=(), attempts=False):
        self.docs = deepcopy(list(documents))
        self.attempts = attempts
        self.indexes = []
        self.fail_update = None

    async def find_one(self, query, projection=None):
        return next((deepcopy(d) for d in self.docs if matches(d, query)), None)

    async def count_documents(self, query):
        return 0

    async def insert_one(self, document):
        if self.attempts:
            for row in self.docs:
                same_owner = all(row[k] == document[k] for k in ('payment_provider', 'environment', 'user_id'))
                if row['_id'] == document['_id'] or (same_owner and row['active'] and document['active']):
                    raise DuplicateKeyError('fake duplicate')
        elif any(row.get('id') == document.get('id') for row in self.docs):
            raise DuplicateKeyError('fake duplicate')
        self.docs.append(deepcopy(document))
        return SimpleNamespace(inserted_id=document.get('_id'))

    async def update_one(self, query, update):
        if self.fail_update and self.fail_update(update):
            raise RuntimeError('simulated database failure')
        for row in self.docs:
            if matches(row, query):
                row.update(deepcopy(update.get('$set', {})))
                for key, value in update.get('$inc', {}).items(): row[key] = row.get(key, 0) + value
                for key in update.get('$unset', {}): row.pop(key, None)
                return SimpleNamespace(matched_count=1, modified_count=1)
        return SimpleNamespace(matched_count=0, modified_count=0)

    async def create_index(self, fields, **options):
        self.indexes.append((fields, options))


@pytest.fixture
def enabled(monkeypatch):
    for key, value in {
        'RAZORPAY_ENABLED': True, 'RAZORPAY_CREATE_ORDERS_ENABLED': True,
        'RAZORPAY_PROCESSING_ENABLED': True, 'RAZORPAY_WORKER_ENABLED': True,
        'RAZORPAY_ENV': 'test', 'RAZORPAY_KEY_ID': 'rzp_test_dummy',
        'RAZORPAY_KEY_SECRET': 'dummy-secret', 'RAZORPAY_WEBHOOK_SECRET': 'dummy-hook',
    }.items(): monkeypatch.setattr(config, key, value)


@pytest.fixture
def database(monkeypatch, enabled):
    database = SimpleNamespace(
        products=Collection([{'id': 'p1', 'name': 'Test product', 'price': 100.005,
                              'stock': 20, 'is_active': True, 'free_shipping': True}]),
        categories=Collection(), coupons=Collection(), orders=Collection(),
        payment_attempts=Collection(attempts=True),
        razorpay_webhook_inbox=Collection(), razorpay_notification_outbox=Collection(),
    )
    for module in (checkout, order_service, coupon_service): monkeypatch.setattr(module, 'db', database)
    async def capable(): pass
    async def reserve(order_id):
        order = await database.orders.find_one({'id': order_id})
        await order_service.reserve_stock_for_order_items(order['items'], {'p1': database.products.docs[0]})
        await database.orders.update_one({'id': order_id}, {'$set': {'stock_reserved': True},
            '$unset': {'stock_reservation_transition': ''}})
    monkeypatch.setattr(checkout.inventory, 'require_transactions', capable)
    monkeypatch.setattr(checkout.inventory, 'reserve', reserve)
    return database


@pytest.fixture
def provider(monkeypatch):
    calls = []
    async def create(**kwargs):
        calls.append(kwargs)
        return {'id': 'order_Test123', 'status': 'created'}
    monkeypatch.setattr(checkout, 'create_razorpay_order', create)
    return calls


USER = {'id': 'customer-1', 'email': 'test@example.com', 'name': 'Test'}


@pytest.mark.parametrize('value,expected', [('1.005', 101), ('100.005', 10001), ('0.995', 100), ('123.45', 12345)])
def test_half_up_paise(value, expected):
    assert paise(value, payable=True) == expected


@pytest.mark.parametrize('value', ['NaN', 'Infinity', '-Infinity', '-0.01', '0.99', None, True, '1e100'])
def test_invalid_amounts_fail_before_provider(value):
    with pytest.raises(HTTPException): paise(value, payable=True)


def test_browser_cannot_submit_total_or_item_price():
    with pytest.raises(ValidationError): payload(amount_paise=100)
    with pytest.raises(ValidationError): payload(items=[{'product_id': 'p1', 'quantity': 1, 'price': 1}])


def test_disabled_or_live_gate_precedes_all_io(monkeypatch):
    monkeypatch.setattr(config, 'RAZORPAY_CREATE_ORDERS_ENABLED', False)
    with pytest.raises(HTTPException) as exc: run(checkout.create_checkout_order(payload(), USER))
    assert exc.value.status_code == 503
    monkeypatch.setattr(config, 'RAZORPAY_CREATE_ORDERS_ENABLED', True)
    monkeypatch.setattr(config, 'RAZORPAY_ENABLED', True)
    monkeypatch.setattr(config, 'RAZORPAY_ENV', 'live')
    with pytest.raises(HTTPException) as exc: run(checkout.create_checkout_order(payload(), USER))
    assert exc.value.status_code == 503


def test_creation_and_repeat_reserve_once(database, provider):
    request = payload(gift_packaging=True)
    first = run(checkout.create_checkout_order(request, USER))
    second = run(checkout.create_checkout_order(request, USER))
    assert first == second
    assert len(provider) == len(database.orders.docs) == len(database.payment_attempts.docs) == 1
    assert first['amount'] == 34902  # 100.01 * 2 + 149 packaging
    assert first['order_id'] != first['razorpay_order_id']
    assert 'payment_session_id' not in first and 'key_secret' not in first
    assert database.products.docs[0]['stock'] == 18
    order = database.orders.docs[0]
    assert order['stock_reserved'] and not order['stock_deducted']
    assert order['payment_status'] == 'pending'
    assert order['payment_provider'] == 'razorpay'
    assert not any(key.startswith('cashfree') for key in order)


def test_changed_payload_and_new_request_id_cannot_bypass_claim(database, provider):
    request = payload()
    run(checkout.create_checkout_order(request, USER))
    changed = payload(request_id=request.request_id, gift_packaging=True)
    for retry in (changed, payload()):
        with pytest.raises(HTTPException) as exc: run(checkout.create_checkout_order(retry, USER))
        assert exc.value.status_code == 409
    assert len(provider) == 1


def test_claim_is_scoped_to_authenticated_user(database, provider):
    request = payload()
    first = run(checkout.create_checkout_order(request, USER))
    second = run(checkout.create_checkout_order(request, {**USER, 'id': 'customer-2'}))
    assert first['order_id'] != second['order_id']
    assert len(provider) == 2


def test_overlapping_same_request_cannot_create_twice(database, provider, monkeypatch):
    original = checkout.build_quote
    async def yielding_quote(*args):
        await asyncio.sleep(0)
        return await original(*args)
    monkeypatch.setattr(checkout, 'build_quote', yielding_quote)
    request = payload()
    async def concurrent():
        return await asyncio.gather(checkout.create_checkout_order(request, USER),
                                    checkout.create_checkout_order(request, USER), return_exceptions=True)
    results = run(concurrent())
    assert sum(isinstance(result, dict) for result in results) == 1
    assert any(isinstance(result, HTTPException) and result.status_code == 409 for result in results)
    assert len(provider) == 1 and database.products.docs[0]['stock'] == 18


def test_provider_timeout_is_not_reposted_or_released(database, monkeypatch):
    calls = []
    async def uncertain(**kwargs):
        calls.append(kwargs)
        raise gateway.OrderCreationUncertain()
    monkeypatch.setattr(checkout, 'create_razorpay_order', uncertain)
    request = payload()
    with pytest.raises(HTTPException) as exc: run(checkout.create_checkout_order(request, USER))
    assert exc.value.status_code == 503
    assert database.payment_attempts.docs[0]['state'] == 'creation_unknown'
    assert database.orders.docs[0]['stock_reserved']
    with pytest.raises(HTTPException) as exc: run(checkout.create_checkout_order(request, USER))
    assert exc.value.status_code == 409
    assert len(calls) == 1


def test_attachment_failure_preserves_provider_id_for_recovery(database, provider):
    database.orders.fail_update = lambda update: 'razorpay_order_id' in update.get('$set', {})
    request = payload()
    with pytest.raises(HTTPException): run(checkout.create_checkout_order(request, USER))
    attempt = database.payment_attempts.docs[0]
    assert attempt['state'] == 'reconciliation_required'
    assert attempt['razorpay_order_id'] == 'order_Test123'
    with pytest.raises(HTTPException): run(checkout.create_checkout_order(request, USER))
    assert len(provider) == 1


def test_reservation_error_does_not_contact_provider(database, provider, monkeypatch):
    async def broken(*args): raise RuntimeError('uncertain inventory write')
    monkeypatch.setattr(order_service, 'reserve_stock_for_order_items', broken)
    with pytest.raises(HTTPException): run(checkout.create_checkout_order(payload(), USER))
    assert not provider
    assert database.orders.docs[0]['stock_reservation_transition'] == 'reserving'
    assert database.payment_attempts.docs[0]['active']


def test_expired_attempt_is_not_returned_for_checkout(database, provider):
    request = payload()
    run(checkout.create_checkout_order(request, USER))
    database.orders.docs[0]['stock_reserved_until'] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
    with pytest.raises(HTTPException) as exc: run(checkout.create_checkout_order(request, USER))
    assert exc.value.status_code == 409 and len(provider) == 1


def test_invalid_product_rejects_before_stock_or_provider(database, provider):
    database.products.docs[0]['price'] = float('nan')
    with pytest.raises(HTTPException) as exc: run(checkout.create_checkout_order(payload(), USER))
    assert exc.value.status_code == 400
    assert database.products.docs[0]['stock'] == 20
    assert not provider and not database.orders.docs
    assert not database.payment_attempts.docs[0]['active']


def test_coupon_shipping_and_packaging_are_server_calculated(database, provider, monkeypatch):
    database.products.docs[0].update(price=100, free_shipping=False, gift_packaging_price=10.005)
    database.coupons.docs.append({'id': 'c1', 'code': 'TEN', 'discount_type': 'percentage',
                                 'discount_value': 10, 'is_active': True, 'applies_to': 'all'})
    monkeypatch.setattr(order_service, 'check_shiprocket_serviceability', lambda **kwargs: {
        'available': True, 'enabled': True, 'shipping_charge': '25.005'})
    request = payload(coupon_code='TEN', items=[{'product_id': 'p1', 'quantity': 2,
                       'gift_packaging': {'selected': True, 'quantity': 1}}])
    result = run(checkout.create_checkout_order(request, USER))
    assert result['amount'] == 21502  # 200 - 20 + 10.01 + 25.01
    assert database.orders.docs[0]['amount_breakdown_paise'] == {
        'products': 20000, 'discount': 2000, 'packaging': 1001, 'shipping': 2501}


def test_coupon_assignment_still_enforced(database, provider):
    database.coupons.docs.append({'id': 'c1', 'code': 'PRIVATE', 'discount_type': 'fixed',
                                 'discount_value': 10, 'assigned_user_id': 'someone-else'})
    with pytest.raises(HTTPException) as exc: run(checkout.create_checkout_order(payload(coupon_code='PRIVATE'), USER))
    assert exc.value.status_code == 400 and not provider


def test_required_indexes_are_unique_and_partial():
    collection = Collection()
    run(create_payment_attempt_indexes(SimpleNamespace(payment_attempts=collection, razorpay_webhook_inbox=Collection(), razorpay_notification_outbox=Collection())))
    indexes = {options.get('name'): (fields, options) for fields, options in collection.indexes}
    assert indexes['one_active_payment_attempt_per_user'][1]['partialFilterExpression'] == {'active': True}
    assert indexes['one_active_payment_attempt_per_user'][1]['unique']
    assert indexes['unique_razorpay_order'][1]['unique']


class Response:
    def __init__(self, status, body=None, invalid=False):
        self.status_code, self.body, self.invalid = status, body, invalid

    def json(self):
        if self.invalid: raise ValueError('do-not-leak-sensitive-data')
        return self.body


def mock_gateway(monkeypatch, handler):
    class Session:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, **kwargs):
            assert self.auth == ('rzp_test_dummy', 'dummy-secret')
            assert not self.trust_env
            assert kwargs['timeout'] == (5, 15)
            assert kwargs['allow_redirects'] is False
            assert 'headers' not in kwargs
            return handler(url, kwargs['json'])
    monkeypatch.setattr(gateway.requests, 'Session', Session)


def test_provider_wire_contract(enabled, monkeypatch):
    def handler(url, body):
        assert url == 'https://api.razorpay.com/v1/orders'
        assert body == {'amount': 12345, 'currency': 'INR', 'receipt': 'mr_test',
                        'partial_payment': False, 'notes': {'internal_order_id': 'internal-test'}}
        return Response(200, {**body, 'id': 'order_Test123', 'status': 'created'})
    mock_gateway(monkeypatch, handler)
    result = run(gateway.create_razorpay_order(amount_paise=12345, receipt='mr_test', internal_order_id='internal-test'))
    assert result['id'] == 'order_Test123'


@pytest.mark.parametrize('mode', ['timeout', 'rejection', 'json', 'amount', 'currency', 'receipt', 'status', 'redirect'])
def test_provider_ambiguous_and_invalid_responses_fail_closed(enabled, monkeypatch, mode):
    def handler(url, request_body):
        if mode == 'timeout': raise requests.Timeout('do-not-leak-sensitive-data')
        if mode == 'rejection': return Response(400, {'error': 'do-not-leak-sensitive-data'})
        if mode == 'redirect': return Response(302)
        if mode == 'json': return Response(200, invalid=True)
        body = {'id': 'order_Test123', 'amount': 100, 'currency': 'INR', 'receipt': 'mr_test', 'status': 'created'}
        body[mode] = {'amount': 200, 'currency': 'USD', 'receipt': 'other', 'status': 'paid'}[mode]
        return Response(200, body)
    mock_gateway(monkeypatch, handler)
    with pytest.raises(gateway.OrderCreationUncertain) as exc:
        run(gateway.create_razorpay_order(amount_paise=100, receipt='mr_test', internal_order_id='internal-test'))
    assert 'sensitive' not in str(exc.value)


def test_route_requires_authentication_and_remains_disabled(monkeypatch):
    # Rate limiting is a separate integration concern; slowapi is absent locally.
    import sys
    import types
    limiter_module = types.ModuleType('core.limiter')
    limiter_module.limiter = SimpleNamespace(limit=lambda _: lambda endpoint: endpoint)
    monkeypatch.setitem(sys.modules, 'core.limiter', limiter_module)
    from routes.payments import router, create_razorpay_order_route
    from core.auth import get_current_user
    from starlette.requests import Request
    route = next(route for route in router.routes if route.path == '/api/payments/razorpay/create-order')
    assert get_current_user in [dep.call for dep in route.dependant.dependencies]
    monkeypatch.setattr(config, 'RAZORPAY_CREATE_ORDERS_ENABLED', False)
    request = Request({'type': 'http', 'headers': [], 'method': 'POST', 'path': route.path})
    with pytest.raises(HTTPException) as exc:
        run(create_razorpay_order_route(request, payload(), USER))
    assert exc.value.status_code == 503


def test_historical_cashfree_record_is_not_relabelled(database, provider):
    historical = {'id': 'legacy-order', 'user_id': USER['id'], 'payment_provider': 'cashfree',
                  'cashfree_order_id': 'legacy-provider-id', 'cf_refund_id': 'legacy-refund',
                  'payment_status': 'paid', 'status': 'cancelled', 'stock_deducted': True}
    database.orders.docs.append(deepcopy(historical))
    run(checkout.create_checkout_order(payload(), USER))
    assert database.orders.docs[0] == historical


def test_razorpay_preview_exposes_checkout_total_including_shipping(monkeypatch, enabled):
    import sys
    import types
    limiter_module = types.ModuleType('core.limiter')
    limiter_module.limiter = SimpleNamespace(limit=lambda _: lambda endpoint: endpoint)
    monkeypatch.setitem(sys.modules, 'core.limiter', limiter_module)
    from routes.payments import razorpay_preview_route
    from models.order import RazorpayCheckoutPreview
    from starlette.requests import Request
    async def quote(*args):
        return {'shipping_charge': 199.22, 'shipping_free_reason': None,
                'shipping_rate_source': 'test', 'shipping_breakdown': [],
                'total_price': 698.22, 'amount_paise': 69822, 'currency': 'INR'}, {}
    monkeypatch.setattr(checkout, 'build_quote', quote)
    request = Request({'type': 'http', 'headers': [], 'method': 'POST',
                       'path': '/api/payments/razorpay/preview'})
    result = run(razorpay_preview_route(request, RazorpayCheckoutPreview(
        items=[{'product_id': 'p1', 'quantity': 1}], billing_postal_code='400001'), USER))
    assert result['total_payable'] == 698.22
    assert result['total_payable'] == result['total_price']
    assert round(result['total_payable'] * 100) == result['amount_paise']


def test_below_minimum_total_has_no_stock_or_provider_effect(database, provider):
    database.products.docs[0]['price'] = 0.10
    with pytest.raises(HTTPException) as exc: run(checkout.create_checkout_order(payload(), USER))
    assert exc.value.status_code == 400
    assert not provider and not database.orders.docs
    assert database.products.docs[0]['stock'] == 20


def test_missing_authenticated_identity_rejected(database, provider):
    with pytest.raises(HTTPException) as exc: run(checkout.create_checkout_order(payload(), {}))
    assert exc.value.status_code == 401
    assert not database.payment_attempts.docs and not provider


def test_provider_amount_cannot_be_float_or_bool(enabled):
    for amount in (100.0, True, 99):
        with pytest.raises(HTTPException):
            run(gateway.create_razorpay_order(amount_paise=amount, receipt='mr_test', internal_order_id='local'))


def test_decimal_coupon_rounding_and_cap():
    items = [{'line_total': 100.05, 'product_id': 'p1', 'category_id': 'c1'}]
    snapshot = {'applies_to': 'products', 'applicable_product_ids': ['p1'],
                'discount_type': 'percentage', 'discount_value': 10}
    discount, _ = checkout.coupon_discount(snapshot, items)
    assert paise(discount) == 1001
    discount, _ = checkout.coupon_discount({**snapshot, 'max_discount_amount': 5}, items)
    assert paise(discount) == 500


def test_legacy_rounding_default_is_preserved():
    assert order_service._extract_shipping_charge({'shipping_charge': 100.005}) == round(100.005, 2)
    assert order_service._extract_shipping_charge({'shipping_charge': '100.005'}, money_round=checkout.rupees) == 100.01


def test_provider_id_persistence_failure_cannot_trigger_new_post(database, provider):
    database.payment_attempts.fail_update = lambda update: update.get('$set', {}).get('state') == 'attaching'
    request = payload()
    with pytest.raises(HTTPException): run(checkout.create_checkout_order(request, USER))
    assert database.payment_attempts.docs[0]['receipt'].startswith('mr_')
    with pytest.raises(HTTPException): run(checkout.create_checkout_order(request, USER))
    assert len(provider) == 1
