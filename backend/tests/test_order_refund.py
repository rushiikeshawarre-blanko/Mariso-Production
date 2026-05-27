import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from services import cashfree_service, order_service


MISSING = object()


def matches(document, query):
    for key, expected in query.items():
        actual = document.get(key, MISSING)
        if isinstance(expected, dict):
            if "$in" in expected and actual not in expected["$in"] and not (
                actual is MISSING and None in expected["$in"]
            ):
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
        return SimpleNamespace(modified_count=1)


def cancelled_cashfree_order(**overrides):
    order = {
        "id": "order-1234567890",
        "status": "cancelled",
        "cancellation_status": "approved",
        "payment_provider": "cashfree",
        "payment_status": "paid",
        "cashfree_order_id": "order-1234567890",
        "refund_status": "pending",
        "refund_amount": 499.25,
    }
    order.update(overrides)
    return order


def setup_orders(monkeypatch, order):
    orders = FakeOrders(order)
    monkeypatch.setattr(order_service, "db", SimpleNamespace(orders=orders))
    return orders


def test_cashfree_create_and_get_refund_use_refund_endpoints(monkeypatch):
    calls = []

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {"refund_id": "refund-1", "cf_refund_id": "cf-1", "refund_status": "PENDING"}

    monkeypatch.setattr(cashfree_service, "_build_cashfree_headers", lambda key: {"idempotency": key})
    monkeypatch.setattr(
        cashfree_service.requests,
        "post",
        lambda url, json, headers, timeout: calls.append(("post", url, json)) or Response(),
    )
    monkeypatch.setattr(
        cashfree_service.requests,
        "get",
        lambda url, headers, timeout: calls.append(("get", url, None)) or Response(),
    )

    created = cashfree_service.create_cashfree_refund("order-1", "refund-1", 101.257, "Cancellation")
    fetched = cashfree_service.get_cashfree_refund("order-1", "refund-1")

    assert calls[0][1].endswith("/orders/order-1/refunds")
    assert calls[0][2] == {
        "refund_amount": 101.26,
        "refund_id": "refund-1",
        "refund_note": "Cancellation",
        "refund_speed": "STANDARD",
    }
    assert calls[1][1].endswith("/orders/order-1/refunds/refund-1")
    assert created["cf_refund_id"] == "cf-1"
    assert fetched["refund_status"] == "PENDING"


def test_admin_initiates_stored_full_refund_only_once(monkeypatch):
    orders = setup_orders(monkeypatch, cancelled_cashfree_order())
    provider_calls = []

    def create_refund(order_id, refund_id, amount, note):
        provider_calls.append((order_id, refund_id, amount, note))
        return {"refund_id": refund_id, "cf_refund_id": "cf-refund-1", "refund_status": "PENDING"}

    monkeypatch.setattr(order_service, "create_cashfree_refund", create_refund)

    result = asyncio.run(order_service.initiate_order_refund("order-1234567890", "admin-1"))

    assert provider_calls[0][0] == "order-1234567890"
    assert provider_calls[0][2] == 499.25
    assert result["refund_id"].startswith("refund_order1234567_")
    assert result["cf_refund_id"] == "cf-refund-1"
    assert result["refund_status"] == "initiated"
    assert result["refund_initiated_at"]

    with pytest.raises(HTTPException) as duplicate:
        asyncio.run(order_service.initiate_order_refund("order-1234567890", "admin-1"))
    assert duplicate.value.status_code == 409
    assert len(provider_calls) == 1
    assert orders.order["refund_id"] == result["refund_id"]


def test_admin_sync_maps_success_and_records_completion(monkeypatch):
    setup_orders(monkeypatch, cancelled_cashfree_order(
        refund_status="processing",
        refund_id="refund-order-1",
        cf_refund_id="cf-refund-1",
    ))
    monkeypatch.setattr(
        order_service,
        "get_cashfree_refund",
        lambda order_id, refund_id: {
            "refund_id": refund_id,
            "cf_refund_id": "cf-refund-1",
            "refund_status": "SUCCESS",
        },
    )

    result = asyncio.run(order_service.sync_order_refund("order-1234567890", "admin-1"))

    assert result["refund_status"] == "success"
    assert result["cashfree_refund_status"] == "SUCCESS"
    assert result["refund_completed_at"]
    assert result["refund_last_synced_at"]


def test_admin_sync_preserves_existing_cashfree_refund_id_when_omitted(monkeypatch):
    setup_orders(monkeypatch, cancelled_cashfree_order(
        refund_status="initiated",
        refund_id="refund-order-1",
        cf_refund_id="cf-refund-existing",
    ))
    monkeypatch.setattr(
        order_service,
        "get_cashfree_refund",
        lambda order_id, refund_id: {"refund_id": refund_id, "refund_status": "PENDING"},
    )

    result = asyncio.run(order_service.sync_order_refund("order-1234567890", "admin-1"))

    assert result["cf_refund_id"] == "cf-refund-existing"


@pytest.mark.parametrize(
    ("provider_status", "stored_status"),
    [
        ("ACCEPTED", "initiated"),
        ("PROCESSING", "processing"),
        ("CANCELLED", "failed"),
        ("FAILED", "failed"),
    ],
)
def test_cashfree_refund_status_mapping(provider_status, stored_status):
    assert order_service._map_cashfree_refund_status({"refund_status": provider_status}) == stored_status
