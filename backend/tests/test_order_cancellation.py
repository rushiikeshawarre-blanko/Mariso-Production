import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from models.order import OrderCancellationDecision, OrderCancellationRequest
import email_service
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
        "items": [{"product_id": "product-1", "product_name": "Rose Candle", "quantity": 2}],
        "total_price": 400,
    }
    order.update(overrides)
    return order


def cancellation_request(reasons=None, other=None):
    return OrderCancellationRequest(
        cancellation_reasons=reasons or ["Delivery timeline does not meet my requirement"],
        cancellation_reason_other=other,
    )


def setup_database(monkeypatch, order):
    orders = FakeOrders(order)
    products = FakeProducts({"id": "product-1", "stock": 3})
    monkeypatch.setattr(order_service, "db", SimpleNamespace(orders=orders, products=products))
    return orders, products


def test_cancellation_request_rejects_missing_reasons():
    with pytest.raises(ValidationError):
        OrderCancellationRequest(cancellation_reasons=[])


def test_cancellation_request_accepts_standard_reason_without_other_text(monkeypatch):
    orders, _ = setup_database(monkeypatch, make_order())

    result = asyncio.run(order_service.request_order_cancellation(
        "order-1",
        cancellation_request(["Ordered the wrong fragrance/design/variant"]),
        "user-1",
    ))

    assert result["cancellation_status"] == "requested"
    assert result["cancellation_reasons"] == ["Ordered the wrong fragrance/design/variant"]
    assert result["cancellation_reason_other"] is None
    assert orders.order["cancellation_reason"] == "Ordered the wrong fragrance/design/variant"


def test_cancellation_request_with_others_rejects_missing_or_blank_other_text():
    with pytest.raises(ValidationError):
        cancellation_request(["Others"])

    with pytest.raises(ValidationError):
        cancellation_request(["Others"], "   ")


def test_cancellation_request_with_others_stores_other_text(monkeypatch):
    orders, _ = setup_database(monkeypatch, make_order())

    result = asyncio.run(order_service.request_order_cancellation(
        "order-1",
        cancellation_request([
            "Found a more suitable product",
            "Others",
        ], "Need it for a different date"),
        "user-1",
    ))

    assert result["cancellation_reasons"] == ["Found a more suitable product", "Others"]
    assert result["cancellation_reason_other"] == "Need it for a different date"
    assert orders.order["cancellation_reason"] == "Found a more suitable product; Other: Need it for a different date"


def test_customer_requests_cancellation_within_one_hour(monkeypatch):
    orders, products = setup_database(monkeypatch, make_order())

    result = asyncio.run(order_service.request_order_cancellation(
        "order-1",
        cancellation_request(),
        "user-1",
    ))

    assert result["cancellation_status"] == "requested"
    assert result["cancellation_reason"] == "Delivery timeline does not meet my requirement"
    assert result["cancellation_reasons"] == ["Delivery timeline does not meet my requirement"]
    assert result["cancellation_requested_at"]
    assert products.product["stock"] == 3

    with pytest.raises(HTTPException) as duplicate:
        asyncio.run(order_service.request_order_cancellation(
            "order-1",
            cancellation_request(["Found a more suitable product"]),
            "user-1",
        ))
    assert duplicate.value.status_code == 400
    assert orders.order["cancellation_reason"] == "Delivery timeline does not meet my requirement"


def test_legacy_confirmed_order_uses_inferred_paid_and_stock_fields(monkeypatch):
    legacy_order = make_order()
    legacy_order.pop("payment_status")
    legacy_order.pop("stock_deducted")
    _, products = setup_database(monkeypatch, legacy_order)

    requested = asyncio.run(order_service.request_order_cancellation(
        "order-1",
        cancellation_request(),
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
            cancellation_request(),
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
            cancellation_request(),
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
            cancellation_request(),
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


def test_admin_approval_email_includes_cancellation_reasons(monkeypatch):
    sent = []
    monkeypatch.setattr(email_service, "send_email", lambda subject, to_email, html: sent.append({
        "subject": subject,
        "to_email": to_email,
        "html": html,
    }))
    setup_database(monkeypatch, make_order(
        billing_email="customer@example.com",
        billing_name="Aarav",
        cancellation_status="requested",
        cancellation_reason="Delivery timeline does not meet my requirement; Other: Need it before Friday",
        cancellation_reasons=["Delivery timeline does not meet my requirement", "Others"],
        cancellation_reason_other="Need it before Friday",
    ))

    asyncio.run(order_service.approve_order_cancellation(
        "order-1",
        OrderCancellationDecision(note="Approved"),
        "admin-1",
    ))

    assert sent
    assert sent[0]["subject"] == "Mariso Order Cancellation Confirmation"
    assert sent[0]["to_email"] == "customer@example.com"
    assert "Rose Candle" in sent[0]["html"]
    assert "Delivery timeline does not meet my requirement" in sent[0]["html"]
    assert "Other: Need it before Friday" in sent[0]["html"]
    assert "Team Mariso" in sent[0]["html"]


def test_admin_approval_restores_pack_effective_quantity(monkeypatch):
    _, products = setup_database(monkeypatch, make_order(
        cancellation_status="requested",
        cancellation_reason="Ordered by mistake",
        items=[{
            "product_id": "product-1",
            "quantity": 2,
            "sell_as_pack": True,
            "pack_size": 4,
            "effective_quantity": 8,
            "total_units": 8,
        }],
    ))

    result = asyncio.run(order_service.approve_order_cancellation(
        "order-1",
        OrderCancellationDecision(note="Approved"),
        "admin-1",
    ))

    assert result["status"] == "cancelled"
    assert result["stock_restored_at"]
    assert products.product["stock"] == 11


def test_admin_approval_restores_pack_option_quantity(monkeypatch):
    _, products = setup_database(monkeypatch, make_order(
        cancellation_status="requested",
        cancellation_reason="Ordered by mistake",
        items=[{
            "product_id": "product-1",
            "quantity": 2,
            "selected_pack_id": "pack-4",
            "selected_pack_label": "Pack of 4",
            "pack_multiplier": 4,
            "pieces_per_pack": 100,
            "total_pieces": 200,
        }],
    ))

    result = asyncio.run(order_service.approve_order_cancellation(
        "order-1",
        OrderCancellationDecision(note="Approved"),
        "admin-1",
    ))

    assert result["status"] == "cancelled"
    assert result["stock_restored_at"]
    assert products.product["stock"] == 5


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
