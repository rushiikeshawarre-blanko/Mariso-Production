from copy import deepcopy
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import HTTPException
from core import config
from services import razorpay_retry_service as retry
from test_razorpay_transactions import database, run, payment, stock


@pytest.fixture
def ready(database, monkeypatch):
    database.payment_attempts.rows[0]['user_id'] = 'u'
    monkeypatch.setattr(retry, 'db', database)
    monkeypatch.setattr(retry, 'require_order_creation_enabled', lambda: None)
    monkeypatch.setattr(config, 'STOCK_RESERVATION_MINUTES', 15)
    async def supported(): pass
    monkeypatch.setattr(stock, 'require_transactions', supported)
    provider = {'id': 'order_Test', 'amount': 100, 'currency': 'INR', 'receipt': 'receipt',
                'notes': {'internal_order_id': 'o'}, 'status': 'attempted', 'amount_paid': 0,
                'partial_payment': False, 'attempts': 1}
    history = {'count': 1, 'items': [payment(status='failed', captured=False)]}
    async def get(path):
        return deepcopy(history if path.endswith('/payments') else provider)
    monkeypatch.setattr(retry, 'provider_get', get)
    run(stock.reserve('o'))
    return database, provider, history


def expire(database):
    database.orders.rows[0]['stock_reserved_until'] = (datetime.now(timezone.utc)-timedelta(minutes=1)).isoformat()
    run(stock.expire_reservation('o'))


def test_valid_retry_reuses_order_and_reserves_once(ready):
    db, _, _ = ready
    assert db.products.rows[0]['stock'] == 3
    first = run(retry.retry_checkout('o', {'id': 'u'}))
    second = run(retry.retry_checkout('o', {'id': 'u'}))
    assert first == second
    assert first['razorpay_order_id'] == 'order_Test'
    assert db.products.rows[0]['stock'] == 3
    assert db.products.rows[0]['reserved_stock'] == 2
    assert len(db.orders.rows) == len(db.payment_attempts.rows) == 1


@pytest.mark.parametrize('state', ['created', 'authorized', 'captured', 'refunded'])
def test_unresolved_or_paid_payment_blocks_retry(ready, state):
    db, _, history = ready
    expire(db)
    before = deepcopy(db.products.rows)
    history['items'][0]['status'] = state
    with pytest.raises(HTTPException): run(retry.retry_checkout('o', {'id': 'u'}))
    assert db.products.rows == before


def test_foreign_user_cannot_retry(ready):
    with pytest.raises(HTTPException) as error:
        run(retry.retry_checkout('o', {'id': 'someone_else'}))
    assert error.value.status_code == 404


def test_out_of_stock_retry_rolls_back(ready):
    db, _, _ = ready
    expire(db)
    db.products.rows[0]['stock'] = 0
    with pytest.raises(HTTPException): run(retry.retry_checkout('o', {'id': 'u'}))
    assert db.orders.rows[0]['payment_status'] == 'expired'
    assert db.products.rows[0]['reserved_stock'] == 0


def test_truncated_history_blocks_retry(ready):
    _, provider, _ = ready
    provider['attempts'] = 2
    with pytest.raises(HTTPException): run(retry.retry_checkout('o', {'id': 'u'}))


def test_paid_order_racing_provider_read_blocks_retry(ready, monkeypatch):
    db, _, _ = ready
    original = retry.provider_get
    async def get(path):
        result = await original(path)
        if path.endswith('/payments'):
            await stock.finalize('o', payment())
        return result
    monkeypatch.setattr(retry, 'provider_get', get)
    with pytest.raises(HTTPException): run(retry.retry_checkout('o', {'id': 'u'}))
    assert db.orders.rows[0]['status'] == 'confirmed'


def test_old_payment_after_renewal_goes_to_review(ready):
    db, _, _ = ready
    db.orders.rows[0]['payment_window_started_at'] = 100
    result = run(stock.finalize('o', payment(created_at=1)))
    assert result['status'] == 'paid_stock_issue'
    assert not result['stock_deducted']


def test_new_payment_after_renewal_confirms_once(ready):
    db, _, _ = ready
    db.orders.rows[0]['payment_window_started_at'] = 100
    captured = payment(created_at=db.orders.rows[0]['payment_window_started_at']+1)
    run(stock.finalize('o', captured))
    run(stock.finalize('o', captured))
    assert db.orders.rows[0]['status'] == 'confirmed'
    assert db.products.rows[0]['stock'] == 3
    assert db.products.rows[0]['reserved_stock'] == 0


def test_provider_omits_optional_partial_payment_field(ready):
    db, provider, _ = ready
    provider.pop('partial_payment')
    result = run(retry.retry_checkout('o', {'id': 'u'}))
    assert result['razorpay_order_id'] == 'order_Test'
    assert db.products.rows[0]['reserved_stock'] == 2


@pytest.mark.parametrize('value', [True, None, 0, 'false'])
def test_explicit_partial_or_invalid_flag_blocks_retry(ready, value):
    _, provider, _ = ready
    provider['partial_payment'] = value
    with pytest.raises(HTTPException):
        run(retry.retry_checkout('o', {'id': 'u'}))


def test_expired_resume_is_rejected_without_rereserving(ready):
    db, _, _ = ready
    expire(db)
    with pytest.raises(HTTPException): run(retry.retry_checkout('o', {'id': 'u'}))
    assert db.orders.rows[0]['payment_status'] == 'expired'
    assert db.products.rows[0]['stock'] == 5


def test_buy_again_retires_claim_and_returns_fresh_cart(ready, monkeypatch):
    db, _, _ = ready
    expire(db)
    async def rebuild(_): return [{'id': 'p', 'price': 123, 'quantity': 2}]
    monkeypatch.setattr(retry, 'rebuild_cart', rebuild)
    for _ in range(2):
        result = run(retry.retry_checkout('o', {'id': 'u'}, buy_again=True))
        assert result['items'][0]['price'] == 123
    assert db.orders.rows[0]['payment_status'] == 'expired'
    assert db.products.rows[0]['stock'] == 5
    assert not db.payment_attempts.rows[0]['active']
    assert db.payment_attempts.rows[0]['monitor_late_payment']
    run(stock.finalize('o', payment()))
    assert db.orders.rows[0]['status'] == 'paid_stock_issue'
    assert not db.payment_attempts.rows[0]['active']
    assert not db.payment_attempts.rows[0]['monitor_late_payment']


def test_buy_again_blocks_unresolved_payment(ready):
    db, _, history = ready
    expire(db)
    history['items'][0]['status'] = 'authorized'
    with pytest.raises(HTTPException): run(retry.retry_checkout('o', {'id': 'u'}, buy_again=True))
    assert db.payment_attempts.rows[0]['active']


def test_buy_again_unavailable_catalog_keeps_claim(ready, monkeypatch):
    db, _, _ = ready
    expire(db)
    async def unavailable(_): raise HTTPException(400, 'Out of stock')
    monkeypatch.setattr(retry, 'rebuild_cart', unavailable)
    with pytest.raises(HTTPException): run(retry.retry_checkout('o', {'id': 'u'}, buy_again=True))
    assert db.payment_attempts.rows[0]['active']


def test_rebuild_uses_current_catalog_not_old_prices(monkeypatch):
    from types import SimpleNamespace
    from services import order_service
    class Products:
        async def find_one(self, *args):
            return {'id': 'p', 'name': 'Current candle', 'price': 200, 'discount_price': 150,
                    'is_on_sale': True, 'stock': 4, 'images': [], 'variants': []}
    monkeypatch.setattr(order_service, 'db', SimpleNamespace(products=Products()))
    cart = run(retry.rebuild_cart({'items': [{'product_id': 'p', 'quantity': 2, 'price': 1}]}))
    assert cart[0]['price'] == 150
    assert cart[0]['availableQuantity'] == 4
    assert cart[0]['quantity'] == 2
    assert 'coupon_code' not in cart[0]


def test_repeat_expiry_preserves_release_timestamp(ready):
    db, _, _ = ready
    expire(db)
    released = db.orders.rows[0]['stock_released_at']
    run(stock.expire_reservation('o'))
    assert db.orders.rows[0]['stock_released_at'] == released
    assert db.products.rows[0]['stock'] == 5
