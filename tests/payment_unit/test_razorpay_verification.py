import asyncio
from copy import deepcopy
import hashlib
import hmac
import json
from types import SimpleNamespace

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError
import pytest

from core import config
from services import razorpay_verification_service as service


def run(coro):
    return asyncio.run(coro)


def sign(raw, secret='hook'):
    return hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()


class Collection:
    def __init__(self, rows=()):
        self.rows = deepcopy(list(rows))
        self.fail = False

    async def find_one(self, query):
        return next((deepcopy(x) for x in self.rows if all(x.get(k) == v for k, v in query.items())), None)

    async def insert_one(self, row):
        if self.fail:
            raise RuntimeError('storage unavailable')
        if any(x['_id'] == row['_id'] for x in self.rows):
            raise DuplicateKeyError('duplicate')
        self.rows.append(deepcopy(row))


@pytest.fixture
def setup(monkeypatch):
    for key, value in {'RAZORPAY_ENABLED': True, 'RAZORPAY_PROCESSING_ENABLED': True,
                       'RAZORPAY_ENV': 'test', 'RAZORPAY_KEY_ID': 'rzp_test_dummy',
                       'RAZORPAY_KEY_SECRET': 'api', 'RAZORPAY_WEBHOOK_SECRET': 'hook',
                       'RAZORPAY_CREATE_ORDERS_ENABLED': False}.items():
        monkeypatch.setattr(config, key, value)
    database = SimpleNamespace(
        orders=Collection([{'id': 'local', 'user_id': 'u', 'payment_provider': 'razorpay',
                            'payment_environment': 'test', 'payment_attempt_id': 'a',
                            'razorpay_order_id': 'order_Test', 'amount_paise': 100, 'currency': 'INR'}]),
        payment_attempts=Collection([{'_id': 'a', 'order_id': 'local', 'user_id': 'u',
                                     'payment_provider': 'razorpay', 'environment': 'test',
                                     'key_id': 'rzp_test_dummy', 'razorpay_order_id': 'order_Test',
                                     'amount_paise': 100}]),
        razorpay_payment_evidence=Collection(), razorpay_webhook_inbox=Collection())
    monkeypatch.setattr(service, 'db', database)
    payment = {'id': 'pay_Test', 'order_id': 'order_Test', 'amount': 100, 'currency': 'INR',
               'status': 'captured', 'captured': True}
    calls = []
    async def fetch(payment_id):
        calls.append(payment_id)
        return deepcopy(payment)
    monkeypatch.setattr(service, 'fetch_payment', fetch)
    from services import razorpay_inventory_service as inventory
    async def finalize(order_id, data):
        return {'status': 'confirmed', 'payment_status': 'paid'}
    monkeypatch.setattr(inventory, 'finalize', finalize)
    return database, payment, calls


def payload(**changes):
    return SimpleNamespace(**{'order_id': 'local', 'razorpay_order_id': 'order_Test',
                              'razorpay_payment_id': 'pay_Test',
                              'razorpay_signature': sign(b'order_Test|pay_Test', 'api'), **changes})


def webhook(event='payment.captured'):
    return json.dumps({'event': event, 'payload': {'payment': {'entity': {
        'id': 'pay_Test', 'order_id': 'order_Test', 'email': 'private@example.com'}}}}).encode()


def test_capture_records_evidence_and_calls_finalizer(setup):
    db, _, _ = setup
    original = deepcopy(db.orders.rows)
    for _ in range(2):
        result = run(service.verify_checkout(payload(), {'id': 'u'}))
        assert result['verification_status'] == 'confirmed'
        assert result['fulfillment_ready'] is True
    assert len(db.razorpay_payment_evidence.rows) == 1
    assert db.orders.rows == original


@pytest.mark.parametrize('changes', [{'amount': 101}, {'amount': True}, {'currency': 'USD'},
                                    {'order_id': 'order_Other'}])
def test_mismatched_payment_rejected(setup, changes):
    db, payment, _ = setup
    payment.update(changes)
    with pytest.raises(HTTPException) as exc:
        run(service.verify_checkout(payload(), {'id': 'u'}))
    assert exc.value.status_code == 409
    assert not db.razorpay_payment_evidence.rows


@pytest.mark.parametrize('changes', [{'status': 'authorized'}, {'captured': False}, {'status': 'failed'},
                                    {'status': 'refunded'}])
def test_non_capture_never_creates_evidence(setup, changes):
    db, payment, _ = setup
    payment.update(changes)
    assert run(service.verify_checkout(payload(), {'id': 'u'}))['verification_status'] == 'capture_not_confirmed'
    assert not db.razorpay_payment_evidence.rows


@pytest.mark.parametrize('user,changes,status', [({'id': 'other'}, {}, 404), ({}, {}, 401),
    ({'id': 'u'}, {'razorpay_signature': '0'*64}, 401),
    ({'id': 'u'}, {'razorpay_order_id': 'order_Other'}, 409)])
def test_auth_and_signature_before_provider(setup, user, changes, status):
    _, _, calls = setup
    with pytest.raises(HTTPException) as exc:
        run(service.verify_checkout(payload(**changes), user))
    assert exc.value.status_code == status
    assert calls == []


def test_webhook_durable_duplicate_and_no_pii(setup):
    db, _, _ = setup
    raw = webhook()
    for _ in range(2):
        assert run(service.receive_webhook(raw, sign(raw), 'evt_1')) == {'received': True}
    assert len(db.razorpay_webhook_inbox.rows) == 1
    assert 'private@example.com' not in repr(db.razorpay_webhook_inbox.rows)
    assert db.razorpay_webhook_inbox.rows[0]['state'] == 'pending'


def test_event_id_conflict(setup):
    raw = webhook()
    run(service.receive_webhook(raw, sign(raw), 'evt_1'))
    other = webhook('payment.failed')
    with pytest.raises(HTTPException) as exc:
        run(service.receive_webhook(other, sign(other), 'evt_1'))
    assert exc.value.status_code == 409


@pytest.mark.parametrize('raw,signature,event_id,status', [
    (b'{}', '0'*64, 'evt_1', 401), (b'{', sign(b'{'), 'evt_1', 400),
    (webhook(), sign(webhook()), None, 400),
    (webhook()+b' ', sign(webhook()), 'evt_1', 401),
    (webhook('refund.processed'), sign(webhook('refund.processed')), 'evt_1', 400),
    (b'x'*262145, '', 'evt_1', 413)])
def test_webhook_rejections(setup, raw, signature, event_id, status):
    with pytest.raises(HTTPException) as exc:
        run(service.receive_webhook(raw, signature, event_id))
    assert exc.value.status_code == status
    assert not setup[0].razorpay_webhook_inbox.rows


def test_storage_failure_never_acknowledged(setup):
    setup[0].razorpay_webhook_inbox.fail = True
    raw = webhook()
    with pytest.raises(RuntimeError): run(service.receive_webhook(raw, sign(raw), 'evt_1'))


@pytest.mark.parametrize('key,value', [('RAZORPAY_PROCESSING_ENABLED', False), ('RAZORPAY_ENV', 'live'),
                                     ('RAZORPAY_WEBHOOK_SECRET', '')])
def test_processing_gate(setup, monkeypatch, key, value):
    monkeypatch.setattr(config, key, value)
    with pytest.raises(HTTPException) as exc:
        run(service.verify_checkout(payload(), {'id': 'u'}))
    assert exc.value.status_code == 503
    assert setup[2] == []


def test_signature_fails_closed():
    assert not service.valid_signature(b'body', sign(b'body'), '')
    assert not service.valid_signature(b'body', None, 'hook')
    assert service.valid_signature(b'body', sign(b'body'), 'hook')


def test_status_requires_owned_order_even_when_processing_disabled(setup, monkeypatch):
    monkeypatch.setattr(config, 'RAZORPAY_PROCESSING_ENABLED', False)
    setup[0].orders.rows[0].update(payment_status='paid', status='confirmed', stock_deducted=True)
    result = run(service.get_owned_payment_status('local', {'id': 'u'}))
    assert result['fulfillment_ready'] is True
    assert 'billing_email' not in result
    with pytest.raises(HTTPException) as exc:
        run(service.get_owned_payment_status('local', {'id': 'other'}))
    assert exc.value.status_code == 404
    assert not setup[2]


@pytest.mark.parametrize('status,paid,deducted', [('pending_payment', 'pending', False),
    ('paid_stock_issue', 'paid', False), ('confirmed', 'pending', True), ('confirmed', 'paid', False)])
def test_status_never_claims_unverified_fulfillment(setup, status, paid, deducted):
    setup[0].orders.rows[0].update(payment_status=paid, status=status, stock_deducted=deducted)
    assert run(service.get_owned_payment_status('local', {'id': 'u'}))['fulfillment_ready'] is False


def test_key_rotation_requires_reconciliation(setup):
    setup[0].payment_attempts.rows[0]['key_id'] = 'rzp_test_old'
    with pytest.raises(HTTPException) as exc:
        run(service.verify_checkout(payload(), {'id': 'u'}))
    assert exc.value.status_code == 409
    assert setup[2] == []


def test_payment_evidence_conflict(setup):
    run(service.verify_checkout(payload(), {'id': 'u'}))
    setup[0].razorpay_payment_evidence.rows[0]['order_id'] = 'other'
    with pytest.raises(HTTPException) as exc:
        run(service.verify_checkout(payload(), {'id': 'u'}))
    assert exc.value.status_code == 409


@pytest.mark.parametrize('status,data,expected', [(200, {'id': 'pay_Test'}, None),
    (302, {}, 503), (500, {}, 503), (200, {'id': 'pay_Other'}, 503), (200, [], 503)])
def test_actual_fetch_adapter(monkeypatch, status, data, expected):
    for key, value in {'RAZORPAY_ENABLED': True, 'RAZORPAY_PROCESSING_ENABLED': True,
                       'RAZORPAY_ENV': 'test', 'RAZORPAY_KEY_ID': 'rzp_test_dummy',
                       'RAZORPAY_KEY_SECRET': 'api', 'RAZORPAY_WEBHOOK_SECRET': 'hook'}.items():
        monkeypatch.setattr(config, key, value)
    calls = []
    class Session:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def get(self, url, **kwargs):
            assert self.trust_env is False
            assert self.auth == ('rzp_test_dummy', 'api')
            assert kwargs['allow_redirects'] is False
            assert kwargs['timeout'] == (config.RAZORPAY_CONNECT_TIMEOUT_SECONDS,
                                          config.RAZORPAY_READ_TIMEOUT_SECONDS)
            calls.append(url)
            return SimpleNamespace(status_code=status, json=lambda: data)
    monkeypatch.setattr(service.requests, 'Session', Session)
    if expected:
        with pytest.raises(HTTPException) as exc: run(service.fetch_payment('pay_Test'))
        assert exc.value.status_code == expected
    else:
        assert run(service.fetch_payment('pay_Test')) == data
    assert calls == ['https://api.razorpay.com/v1/payments/pay_Test']

@pytest.mark.parametrize('event', ['refund.created', 'refund.processed', 'refund.failed'])
def test_refund_webhook_durable_receipt_without_payment_entity(setup, event):
    raw = json.dumps({'event': event, 'payload': {'refund': {'entity': {
        'id': 'rfnd_Test', 'payment_id': 'pay_Test', 'notes': {'email': 'private@example.com'}}}}}).encode()
    run(service.receive_webhook(raw, sign(raw), 'evt_refund'))
    run(service.receive_webhook(raw, sign(raw), 'evt_refund'))
    rows = setup[0].razorpay_webhook_inbox.rows
    assert len(rows) == 1
    assert rows[0]['razorpay_refund_id'] == 'rfnd_Test'
    assert rows[0]['state'] == 'pending'
    assert 'private@example.com' not in repr(rows)
