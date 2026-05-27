import asyncio
from datetime import datetime, timedelta, timezone

from core.config import CASHFREE_ORDER_EXPIRY_MINUTES
from routes import payments


def test_configured_cashfree_order_expiry_has_safe_minimum():
    assert CASHFREE_ORDER_EXPIRY_MINUTES >= 30


def test_cashfree_order_expiry_is_independent_from_short_stock_reservation(monkeypatch):
    created_at = datetime(2026, 5, 27, 10, 0, tzinfo=timezone.utc)
    stock_reserved_until = created_at + timedelta(minutes=5)
    monkeypatch.setattr(payments, "CASHFREE_ORDER_EXPIRY_MINUTES", 30)

    cashfree_expiry = datetime.fromisoformat(payments._cashfree_order_expiry_time(created_at))

    assert cashfree_expiry == created_at + timedelta(minutes=30)
    assert cashfree_expiry > stock_reserved_until


def test_create_session_sends_gateway_expiry_instead_of_stock_expiry(monkeypatch):
    stock_reserved_until = "2026-05-27T10:05:00+00:00"
    gateway_expiry = "2026-05-27T10:30:00+00:00"
    captured = {}

    async def fake_pending_order(payload, user):
        return {
            "id": "order-1",
            "total_price": 500,
            "billing_name": "Customer",
            "billing_email": "customer@example.com",
            "billing_phone": "9876543210",
            "stock_reserved_until": stock_reserved_until,
        }

    def fake_cashfree_session(**kwargs):
        captured.update(kwargs)
        return {"payment_session_id": "session-1"}

    async def fake_attach_session(order_id, cashfree_data):
        return {
            "id": order_id,
            "cashfree_payment_session_id": cashfree_data["payment_session_id"],
            "stock_reserved_until": stock_reserved_until,
        }

    monkeypatch.setattr(payments, "create_pending_cashfree_order", fake_pending_order)
    monkeypatch.setattr(payments, "_cashfree_order_expiry_time", lambda: gateway_expiry)
    monkeypatch.setattr(payments, "create_cashfree_order_session", fake_cashfree_session)
    monkeypatch.setattr(payments, "attach_cashfree_session", fake_attach_session)

    asyncio.run(payments.create_cashfree_session_route(object(), {"id": "user-1"}))

    assert captured["order_expiry_time"] == gateway_expiry
    assert captured["order_expiry_time"] != stock_reserved_until
