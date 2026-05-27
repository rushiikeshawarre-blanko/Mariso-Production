import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from models.order import OrderCancellationDecision, OrderCancellationRequest
from services import order_service


MISSING = object()


def matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(document, candidate) for candidate in expected):
                return False
            continue
        actual = document.get(key, MISSING)
        if isinstance(expected, dict):
            if "$nin" in expected and actual in expected["$nin"]:
                return False
            if "$in" in expected and actual not in expected["$in"] and not (
                actual is MISSING and None in expected["$in"]
            ):
                return False
            if "$exists" in expected and (actual is not MISSING) != expected["$exists"]:
                return False
            if "$ne" in expected and actual == expected["$ne"]:
                return False
        elif actual is MISSING or actual != expected:
            return False
    return True


class FakeOrders:
    def __init__(self, order):
        self.order = dict(order)

    async def find_one(self, query, projection=None):
        return dict(self.order) if matches(self.order, query) else None

    async def update_one(self, query, update):
        if not matches(self.order, query):
            return SimpleNamespace(modified_count=0)
        self.order.update(update.get("$set", {}))
        for key in update.get("$unset", {}):
            self.order.pop(key, None)
        return SimpleNamespace(modified_count=1)


class FakeProducts:
    def __init__(self, product):
        self.product = dict(product)

    async def update_one(self, query, update):
        if self.product.get("id") != query.get("id"):
            return SimpleNamespace(modified_count=0)
        for key, amount in update.get("$inc", {}).items():
            self.product[key] = self.product.get(key, 0) + amount
        return SimpleNamespace(modified_count=1)


def make_order(**overrides):
    order = {
        "id": "order-1",
        "user_id": "user-1",
        "status": "confirmed",
        "payment_status": "paid",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "cancellation_status": "none",
        "stock_deducted": True,
        "items": [{"product_id": "product-1", "quantity": 2}],
        "total_price": 400,
    }
    order.update(overrides)
    return order


def setup_database(monkeypatch, order):
    orders = FakeOrders(order)
    products = FakeProducts({"id": "product-1", "stock": 3})
    monkeypatch.setattr(order_service, "db", SimpleNamespace(orders=orders, products=products))
    return orders, products


def test_customer_requests_cancellation_within_one_hour(monkeypatch):
    orders, products = setup_database(monkeypatch, make_order())

    result = asyncio.run(order_service.request_order_cancellation(
        "order-1",
        OrderCancellationRequest(reason="Ordered by mistake"),
        "user-1",
    ))

    assert result["cancellation_status"] == "requested"
    assert result["cancellation_reason"] == "Ordered by mistake"
    assert result["cancellation_requested_at"]
    assert products.product["stock"] == 3

    with pytest.raises(HTTPException) as duplicate:
        asyncio.run(order_service.request_order_cancellation(
            "order-1",
            OrderCancellationRequest(reason="Second try"),
            "user-1",
        ))
    assert duplicate.value.status_code == 400
    assert orders.order["cancellation_reason"] == "Ordered by mistake"


def test_legacy_confirmed_order_uses_inferred_paid_and_stock_fields(monkeypatch):
    legacy_order = make_order()
    legacy_order.pop("payment_status")
    legacy_order.pop("stock_deducted")
    _, products = setup_database(monkeypatch, legacy_order)

    requested = asyncio.run(order_service.request_order_cancellation(
        "order-1",
        OrderCancellationRequest(reason="Legacy order"),
        "user-1",
    ))
    assert requested["cancellation_status"] == "requested"

    result = asyncio.run(order_service.approve_order_cancellation(
        "order-1",
        OrderCancellationDecision(),
        "admin-1",
    ))

    assert result["status"] == "cancelled"
    assert result["stock_restored_at"]
    assert products.product["stock"] == 5


def test_customer_cannot_cancel_another_users_or_expired_order(monkeypatch):
    setup_database(monkeypatch, make_order())
    with pytest.raises(HTTPException) as unauthorized:
        asyncio.run(order_service.request_order_cancellation(
            "order-1",
            OrderCancellationRequest(reason="Not mine"),
            "user-2",
        ))
    assert unauthorized.value.status_code == 403

    setup_database(
        monkeypatch,
        make_order(created_at=(datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()),
    )
    with pytest.raises(HTTPException) as expired:
        asyncio.run(order_service.request_order_cancellation(
            "order-1",
            OrderCancellationRequest(reason="Too late"),
            "user-1",
        ))
    assert expired.value.status_code == 400
    assert "window expired" in expired.value.detail


@pytest.mark.parametrize("status", ["packed", "shipped", "delivered", "cancelled"])
def test_customer_cannot_cancel_ineligible_fulfillment_status(monkeypatch, status):
    setup_database(monkeypatch, make_order(status=status))

    with pytest.raises(HTTPException) as error:
        asyncio.run(order_service.request_order_cancellation(
            "order-1",
            OrderCancellationRequest(reason="Too far along"),
            "user-1",
        ))

    assert error.value.status_code == 400


def test_admin_approval_cancels_and_restores_stock_once(monkeypatch):
    orders, products = setup_database(monkeypatch, make_order(
        cancellation_status="requested",
        cancellation_reason="Ordered by mistake",
    ))

    result = asyncio.run(order_service.approve_order_cancellation(
        "order-1",
        OrderCancellationDecision(note="Approved"),
        "admin-1",
    ))

    assert result["status"] == "cancelled"
    assert result["cancellation_status"] == "approved"
    assert result["refund_status"] == "pending"
    assert result["refund_amount"] == 400
    assert result["stock_restored_at"]
    assert products.product["stock"] == 5

    with pytest.raises(HTTPException):
        asyncio.run(order_service.approve_order_cancellation(
            "order-1",
            OrderCancellationDecision(),
            "admin-1",
        ))
    assert products.product["stock"] == 5
    assert orders.order["refund_status"] == "pending"


def test_admin_rejection_keeps_order_confirmed(monkeypatch):
    setup_database(monkeypatch, make_order(cancellation_status="requested"))

    result = asyncio.run(order_service.reject_order_cancellation(
        "order-1",
        OrderCancellationDecision(note="Already packed for dispatch"),
        "admin-1",
    ))

    assert result["status"] == "confirmed"
    assert result["cancellation_status"] == "rejected"
    assert result["cancellation_admin_note"] == "Already packed for dispatch"
    assert result["refund_status"] == "none"
