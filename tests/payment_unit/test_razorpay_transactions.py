import asyncio
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import HTTPException
import pytest

from core import config
from services import razorpay_inventory_service as stock
from services import razorpay_recovery_service as recovery


def run(coro): return asyncio.run(coro)


class Collection:
    def __init__(self, rows=()): self.rows = deepcopy(list(rows))

    def match(self, row, query):
        for key, value in query.items():
            if isinstance(value, dict):
                if '$gte' in value:
                    if row.get(key, 0) < value['$gte']: return False
                else: raise AssertionError(value)
            elif row.get(key) != value: return False
        return True

    async def find_one(self, query, session=None):
        return next((deepcopy(r) for r in self.rows if self.match(r, query)), None)

    async def update_one(self, query, update, session=None, upsert=False):
        row = next((r for r in self.rows if self.match(r, query)), None)
        if row is None:
            if not upsert: return SimpleNamespace(matched_count=0, modified_count=0)
            row = deepcopy(query); row.update(deepcopy(update.get('$setOnInsert', {})))
            self.rows.append(row)
        row.update(deepcopy(update.get('$set', {})))
        for key in update.get('$unset', {}): row.pop(key, None)
        for key, value in update.get('$inc', {}).items(): row[key] = row.get(key, 0) + value
        return SimpleNamespace(matched_count=1, modified_count=1)


@pytest.fixture
def database(monkeypatch):
    monkeypatch.setattr(config, 'RAZORPAY_ENV', 'test')
    monkeypatch.setattr(config, 'RAZORPAY_KEY_ID', 'rzp_test_dummy')
    order = {'id': 'o', 'user_id': 'u', 'payment_provider': 'razorpay',
             'payment_environment': 'test', 'payment_attempt_id': 'a', 'inventory_version': 1,
             'razorpay_order_id': 'order_Test', 'amount_paise': 100, 'currency': 'INR',
             'payment_status': 'pending', 'status': 'pending_payment', 'stock_reserved': False,
             'stock_deducted': False, 'coupon_id': 'c', 'coupon_usage_recorded': False,
             'stock_reserved_until': (datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat(),
             'items': [{'product_id': 'p', 'quantity': 2}]}
    attempt = {'_id': 'a', 'order_id': 'o', 'payment_provider': 'razorpay', 'environment': 'test',
               'key_id': 'rzp_test_dummy', 'razorpay_order_id': 'order_Test', 'amount_paise': 100,
               'receipt': 'receipt', 'active': True}
    db = SimpleNamespace(orders=Collection([order]), payment_attempts=Collection([attempt]),
                         products=Collection([{'id': 'p', 'stock': 5, 'reserved_stock': 0}]),
                         coupons=Collection([{'id': 'c', 'used_count': 0}]),
                         razorpay_notification_outbox=Collection(), razorpay_webhook_inbox=Collection())
    monkeypatch.setattr(stock, 'db', db); monkeypatch.setattr(recovery, 'db', db)
    lock = asyncio.Lock()
    async def transaction(callback):
        async with lock:
            snapshots = {key: deepcopy(value.rows) for key, value in vars(db).items()}
            try: return await callback(object())
            except BaseException:
                for key, rows in snapshots.items(): getattr(db, key).rows = rows
                raise
    monkeypatch.setattr(stock, 'transaction', transaction)
    return db


def payment(**changes):
    return {'id': 'pay_Test', 'order_id': 'order_Test', 'amount': 100, 'currency': 'INR',
            'status': 'captured', 'captured': True, **changes}


def test_reserve_replay_and_confirm_replay(database):
    async def scenario():
        await stock.reserve('o'); await stock.reserve('o')
        assert database.products.rows[0]['stock'] == 3
        assert database.products.rows[0]['reserved_stock'] == 2
        await stock.finalize('o', payment()); await stock.finalize('o', payment())
    run(scenario())
    assert database.products.rows[0] == {'id': 'p', 'stock': 3, 'reserved_stock': 0}
    assert database.orders.rows[0]['status'] == 'confirmed'
    assert database.coupons.rows[0]['used_count'] == 1
    assert len(database.razorpay_notification_outbox.rows) == 3
    assert not database.payment_attempts.rows[0]['active']


def test_partial_reservation_rolls_back(database):
    database.orders.rows[0]['items'].append({'product_id': 'missing', 'quantity': 1})
    with pytest.raises(HTTPException): run(stock.reserve('o'))
    assert database.products.rows[0]['stock'] == 5
    assert not database.orders.rows[0]['stock_reserved']


def test_coupon_failure_rolls_back_finalization(database):
    run(stock.reserve('o')); database.coupons.rows.clear()
    with pytest.raises(HTTPException): run(stock.finalize('o', payment()))
    assert database.products.rows[0]['reserved_stock'] == 2
    assert database.orders.rows[0]['payment_status'] == 'pending'
    assert not database.razorpay_notification_outbox.rows


def test_expiry_releases_once_then_late_capture_requires_review(database):
    run(stock.reserve('o'))
    database.orders.rows[0]['stock_reserved_until'] = '2000-01-01T00:00:00+00:00'
    run(stock.expire_reservation('o')); run(stock.expire_reservation('o'))
    assert database.products.rows[0]['stock'] == 5
    result = run(stock.finalize('o', payment()))
    assert result['status'] == 'paid_stock_issue'
    assert result['payment_status'] == 'paid'
    assert not database.razorpay_notification_outbox.rows


def test_expiry_never_releases_paid_stock(database):
    run(stock.reserve('o')); run(stock.finalize('o', payment()))
    database.orders.rows[0]['stock_reserved_until'] = '2000-01-01T00:00:00+00:00'
    run(stock.expire_reservation('o'))
    assert database.products.rows[0]['stock'] == 3


def test_old_ambiguous_reservation_is_not_replayed(database):
    database.orders.rows[0].pop('inventory_version')
    with pytest.raises(HTTPException): run(stock.reserve('o'))
    result = run(stock.finalize('o', payment()))
    assert result['status'] == 'paid_stock_issue'
    assert database.products.rows[0]['stock'] == 5


@pytest.mark.parametrize('changes', [{'amount': True}, {'amount': 101}, {'currency': 'USD'},
                                    {'status': 'authorized'}, {'captured': False},
                                    {'order_id': 'order_Other'}])
def test_invalid_payment_no_mutation(database, changes):
    run(stock.reserve('o'))
    with pytest.raises(HTTPException): run(stock.finalize('o', payment(**changes)))
    assert database.orders.rows[0]['payment_status'] == 'pending'
    assert database.coupons.rows[0]['used_count'] == 0


def test_concurrent_finalization(database):
    async def scenario():
        await stock.reserve('o')
        await asyncio.gather(stock.finalize('o', payment()), stock.finalize('o', payment()))
    run(scenario())
    assert database.coupons.rows[0]['used_count'] == 1
    assert database.products.rows[0]['reserved_stock'] == 0


def test_second_payment_does_not_overwrite_first(database):
    run(stock.reserve('o')); run(stock.finalize('o', payment()))
    with pytest.raises(HTTPException): run(stock.finalize('o', payment(id='pay_Other')))
    assert database.orders.rows[0]['razorpay_payment_id'] == 'pay_Test'


def test_standalone_fails_closed(monkeypatch):
    async def command(name): return {'ok': 1}
    monkeypatch.setattr(stock, 'db', SimpleNamespace(command=command))
    with pytest.raises(HTTPException) as exc: run(stock.require_transactions())
    assert exc.value.status_code == 503


def test_receipt_recovery_attaches_and_finalizes(database, monkeypatch):
    run(stock.reserve('o'))
    database.payment_attempts.rows[0].pop('razorpay_order_id')
    database.orders.rows[0].pop('razorpay_order_id')
    monkeypatch.setattr(recovery, 'require_processing', lambda: None)
    paths = []
    async def get(path, params=None):
        paths.append(path)
        if path == 'orders':
            assert params['receipt'] == 'receipt'
            return {'items': [{'id': 'order_Test', 'amount': 100, 'currency': 'INR',
                              'receipt': 'receipt', 'notes': {'internal_order_id': 'o'}}]}
        return {'items': [payment()]}
    async def fetch(_): return payment()
    monkeypatch.setattr(recovery, 'provider_get', get)
    monkeypatch.setattr(recovery, 'fetch_payment', fetch)
    run(recovery.reconcile_attempt(database.payment_attempts.rows[0]))
    assert paths == ['orders', 'orders/order_Test/payments']
    assert database.orders.rows[0]['status'] == 'confirmed'


def test_missing_receipt_preserves_uncertainty(database, monkeypatch):
    database.payment_attempts.rows[0].pop('razorpay_order_id')
    monkeypatch.setattr(recovery, 'require_processing', lambda: None)
    async def get(*args): return {'items': []}
    monkeypatch.setattr(recovery, 'provider_get', get)
    run(recovery.reconcile_attempt(database.payment_attempts.rows[0]))
    assert database.payment_attempts.rows[0]['active']


def test_old_failure_event_refetches_current_capture(database, monkeypatch):
    run(stock.reserve('o'))
    event = {'_id': 'event', 'event': 'payment.failed', 'key_id': 'rzp_test_dummy',
             'razorpay_order_id': 'order_Test', 'razorpay_payment_id': 'pay_Test', 'state': 'pending'}
    database.razorpay_webhook_inbox.rows.append(event)
    async def fetch(_): return payment()
    monkeypatch.setattr(recovery, 'fetch_payment', fetch)
    run(recovery.process_inbox(event))
    assert database.orders.rows[0]['status'] == 'confirmed'
    assert event['state'] == 'processed'


def test_verified_failure_keeps_hold_and_does_not_downgrade_paid(database):
    run(stock.reserve('o'))
    failed = {**payment(), 'status': 'failed', 'captured': False}
    run(recovery.record_failed_attempt('o', failed))
    order = database.orders.rows[0]
    assert order['has_failed_payment_attempt'] is True
    assert order['payment_status'] == 'pending'
    assert order['stock_reserved'] is True
    assert order['stock_deducted'] is False
    run(stock.finalize('o', payment()))
    run(recovery.record_failed_attempt('o', failed))
    assert order['payment_status'] == 'paid'
    assert order['status'] == 'confirmed'


def test_wrong_amount_failure_is_not_recorded(database):
    with pytest.raises(HTTPException):
        run(recovery.record_failed_attempt('o', {**payment(), 'status': 'failed', 'amount': 999}))
    assert not database.orders.rows[0].get('has_failed_payment_attempt')
