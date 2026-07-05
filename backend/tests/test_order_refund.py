import asyncio
import base64
import hashlib
import hmac
import json
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from routes import payments
from services import cashfree_service, order_service


MISSING = object()


def matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(document, option) for option in expected):
                return False
            continue
        actual = document
        for part in key.split("."):
            if isinstance(actual, list):
                actual = [
                    item.get(part, MISSING)
                    for item in actual
                    if isinstance(item, dict)
                ]
            elif isinstance(actual, dict):
                actual = actual.get(part, MISSING)
            else:
                actual = MISSING
                break
        if isinstance(expected, dict):
            if "$in" in expected and actual not in expected["$in"] and not (
                actual is MISSING and None in expected["$in"]
            ):
                return False
            if "$nin" in expected and (
                actual in expected["$nin"] or (actual is MISSING and None in expected["$nin"])
            ):
                return False
            if "$ne" in expected:
                disallowed = expected["$ne"]
                if isinstance(actual, list):
                    if disallowed in actual:
                        return False
                elif actual is not MISSING and actual == disallowed:
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
        for key, value in update.get("$push", {}).items():
            self.order.setdefault(key, []).append(value)
        self.order.update(update.get("$set", {}))
        return SimpleNamespace(modified_count=1)


class FakeRequest:
    def __init__(self, payload, headers=None):
        self._body = json.dumps(payload).encode("utf-8")
        self.headers = headers or {}

    async def body(self):
        return self._body


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


def test_refund_success_webhook_updates_refund_status(monkeypatch):
    setup_orders(monkeypatch, cancelled_cashfree_order(
        refund_status="initiated",
        refund_id="refund-order-1",
        cf_refund_id="cf-refund-1",
    ))

    result = asyncio.run(order_service.update_cashfree_refund_from_webhook({
        "order_id": "order-1234567890",
        "refund_id": "refund-order-1",
        "cf_refund_id": "cf-refund-1",
        "refund_status": "SUCCESS",
    }, event_type="REFUND_STATUS_WEBHOOK"))

    assert result["refund_status"] == "success"
    assert result["cashfree_refund_status"] == "SUCCESS"
    assert result["cf_refund_id"] == "cf-refund-1"
    assert result["refund_completed_at"]
    assert result["refund_last_synced_at"]
    assert result["refund_webhook_received_at"]


def test_refund_failed_webhook_updates_status_and_reason(monkeypatch):
    setup_orders(monkeypatch, cancelled_cashfree_order(
        refund_status="processing",
        refund_id="refund-order-1",
        cf_refund_id="cf-refund-1",
    ))

    result = asyncio.run(order_service.update_cashfree_refund_from_webhook({
        "order_id": "order-1234567890",
        "refund_id": "refund-order-1",
        "cf_refund_id": "cf-refund-1",
        "refund_status": "FAILED",
        "status_description": "Bank rejected refund",
    }, event_type="REFUND_STATUS_WEBHOOK"))

    assert result["refund_status"] == "failed"
    assert result["cashfree_refund_status"] == "FAILED"
    assert result["refund_failed_reason"] == "Bank rejected refund"


def test_duplicate_refund_success_webhook_is_idempotent(monkeypatch):
    orders = setup_orders(monkeypatch, cancelled_cashfree_order(
        refund_status="success",
        refund_id="refund-order-1",
        cf_refund_id="cf-refund-1",
        cashfree_refund_status="SUCCESS",
        refund_completed_at="2026-01-01T00:00:00+00:00",
    ))

    first = asyncio.run(order_service.update_cashfree_refund_from_webhook({
        "order_id": "order-1234567890",
        "refund_id": "refund-order-1",
        "cf_refund_id": "cf-refund-1",
        "refund_status": "SUCCESS",
    }, event_type="REFUND_STATUS_WEBHOOK"))
    second = asyncio.run(order_service.update_cashfree_refund_from_webhook({
        "order_id": "order-1234567890",
        "refund_id": "refund-order-1",
        "cf_refund_id": "cf-refund-1",
        "refund_status": "SUCCESS",
    }, event_type="REFUND_STATUS_WEBHOOK"))

    assert first["refund_status"] == "success"
    assert second["refund_status"] == "success"
    assert orders.order["refund_completed_at"] == "2026-01-01T00:00:00+00:00"


def test_refund_webhook_unknown_refund_does_not_crash(monkeypatch):
    setup_orders(monkeypatch, cancelled_cashfree_order(
        refund_status="initiated",
        refund_id="refund-order-1",
        cf_refund_id="cf-refund-1",
    ))

    result = asyncio.run(order_service.update_cashfree_refund_from_webhook({
        "order_id": "missing-order",
        "refund_id": "missing-refund",
        "cf_refund_id": "missing-cf-refund",
        "refund_status": "SUCCESS",
    }, event_type="REFUND_STATUS_WEBHOOK"))

    assert result is None


def test_cashfree_refund_webhook_route_uses_verified_flow(monkeypatch):
    calls = []
    monkeypatch.setattr(payments, "verify_cashfree_webhook_signature", lambda raw_body, headers: True)

    async def update_refund(cashfree_data, event_type=None):
        calls.append((cashfree_data, event_type))
        return {"id": "order-1234567890"}

    monkeypatch.setattr(payments, "update_cashfree_refund_from_webhook", update_refund)
    payload = {
        "type": "REFUND_STATUS_WEBHOOK",
        "data": {
            "order_id": "order-1234567890",
            "refund": {
                "refund_id": "refund-order-1",
                "cf_refund_id": "cf-refund-1",
                "refund_status": "SUCCESS",
            },
        },
    }

    result = asyncio.run(payments.cashfree_webhook_route(FakeRequest(payload)))

    assert result == {"ok": True, "received": True}
    assert calls == [({
        "order_id": "order-1234567890",
        "refund_id": "refund-order-1",
        "cf_refund_id": "cf-refund-1",
        "refund_status": "SUCCESS",
        "status_description": None,
    }, "REFUND_STATUS_WEBHOOK")]


def test_cashfree_refund_event_extracts_refunds_list_payload(monkeypatch):
    setup_orders(monkeypatch, cancelled_cashfree_order(
        refund_status="processing",
        refund_id="refund-order-1",
        cf_refund_id="cf-refund-1",
    ))
    monkeypatch.setattr(payments, "verify_cashfree_webhook_signature", lambda raw_body, headers: True)
    payload = {
        "type": "refund",
        "data": {
            "refunds": [{
                "order_id": "order-1234567890",
                "refund_id": "refund-order-1",
                "cf_refund_id": "cf-refund-1",
                "refund_status": "REFUNDED",
            }],
        },
    }

    result = asyncio.run(payments.cashfree_webhook_route(FakeRequest(payload)))
    order = asyncio.run(order_service.db.orders.find_one({"id": "order-1234567890"}))

    assert result == {"ok": True, "received": True}
    assert order["refund_status"] == "success"
    assert order["cashfree_refund_status"] == "REFUNDED"


def test_cashfree_auto_refund_event_extracts_direct_data_payload(monkeypatch):
    calls = []
    monkeypatch.setattr(payments, "verify_cashfree_webhook_signature", lambda raw_body, headers: True)

    async def update_refund(cashfree_data, event_type=None):
        calls.append((cashfree_data, event_type))
        return {"id": "order-1234567890"}

    monkeypatch.setattr(payments, "update_cashfree_refund_from_webhook", update_refund)
    payload = {
        "event": "auto refund",
        "data": {
            "order_id": "order-1234567890",
            "refund_id": "refund-order-1",
            "cf_refund_id": "cf-refund-1",
            "refund_status": "PENDING",
        },
    }

    result = asyncio.run(payments.cashfree_webhook_route(FakeRequest(payload)))

    assert result == {"ok": True, "received": True}
    assert calls == [({
        "order_id": "order-1234567890",
        "refund_id": "refund-order-1",
        "cf_refund_id": "cf-refund-1",
        "refund_status": "PENDING",
        "status_description": None,
    }, "auto refund")]


def test_cashfree_refund_success_webhook_payload_updates_refund_status(monkeypatch):
    setup_orders(monkeypatch, cancelled_cashfree_order(
        refund_status="initiated",
        refund_id="refund-order-1",
        cf_refund_id="cf-refund-1",
    ))
    monkeypatch.setattr(payments, "verify_cashfree_webhook_signature", lambda raw_body, headers: True)
    payload = {
        "type": "REFUND_STATUS_WEBHOOK",
        "data": {
            "order_id": "order-1234567890",
            "refund": {
                "refund_id": "refund-order-1",
                "cf_refund_id": "cf-refund-1",
                "refund_status": "SUCCESS",
            },
        },
    }

    result = asyncio.run(payments.cashfree_webhook_route(FakeRequest(payload)))
    order = asyncio.run(order_service.db.orders.find_one({"id": "order-1234567890"}))

    assert result == {"ok": True, "received": True}
    assert order["refund_status"] == "success"
    assert order["cashfree_refund_status"] == "SUCCESS"


def test_cashfree_refund_failed_webhook_payload_updates_refund_status(monkeypatch):
    setup_orders(monkeypatch, cancelled_cashfree_order(
        refund_status="processing",
        refund_id="refund-order-1",
        cf_refund_id="cf-refund-1",
    ))
    monkeypatch.setattr(payments, "verify_cashfree_webhook_signature", lambda raw_body, headers: True)
    payload = {
        "type": "REFUND_STATUS_WEBHOOK",
        "data": {
            "order_id": "order-1234567890",
            "refund": {
                "refund_id": "refund-order-1",
                "cf_refund_id": "cf-refund-1",
                "refund_status": "FAILED",
                "status_description": "Bank rejected refund",
            },
        },
    }

    result = asyncio.run(payments.cashfree_webhook_route(FakeRequest(payload)))
    order = asyncio.run(order_service.db.orders.find_one({"id": "order-1234567890"}))

    assert result == {"ok": True, "received": True}
    assert order["refund_status"] == "failed"
    assert order["cashfree_refund_status"] == "FAILED"
    assert order["refund_failed_reason"] == "Bank rejected refund"


def test_cashfree_payment_success_webhook_route_unchanged(monkeypatch):
    calls = []
    monkeypatch.setattr(payments, "verify_cashfree_webhook_signature", lambda raw_body, headers: True)
    monkeypatch.setattr(payments, "update_cashfree_refund_from_webhook", lambda *args, **kwargs: calls.append("refund"))

    async def record_webhook(**kwargs):
        calls.append(("record", kwargs))
        return {"id": kwargs["order_id"], "cashfree_webhook_duplicate": False}

    async def finalize_paid(order_id, cashfree_data, source="status"):
        calls.append(("finalize", order_id, cashfree_data, source))
        return {"id": order_id}

    monkeypatch.setattr(payments, "record_cashfree_webhook_event", record_webhook)
    monkeypatch.setattr(
        payments,
        "get_cashfree_order",
        lambda order_id: {
            "cashfree_order_id": order_id,
            "cashfree_order_status": "PAID",
            "cashfree_payment_status": "SUCCESS",
        },
    )
    monkeypatch.setattr(payments, "finalize_paid_cashfree_order", finalize_paid)

    payload = {
        "type": "PAYMENT_SUCCESS_WEBHOOK",
        "data": {
            "order": {"order_id": "order-1234567890"},
            "payment": {"cf_payment_id": "cf-pay-1", "payment_status": "SUCCESS"},
        },
    }

    result = asyncio.run(payments.cashfree_webhook_route(FakeRequest(payload)))

    assert result == {"ok": True, "received": True}
    assert calls[0][0] == "record"
    assert calls[0][1]["order_id"] == "order-1234567890"
    assert calls[0][1]["event_type"] == "PAYMENT_SUCCESS_WEBHOOK"
    assert calls[0][1]["payment_status"] == "SUCCESS"
    assert calls[1] == (
        "finalize",
        "order-1234567890",
        {
            "cashfree_order_id": "order-1234567890",
            "cashfree_order_status": "PAID",
            "cashfree_payment_status": "SUCCESS",
        },
        "webhook",
    )


def test_cashfree_webhook_signature_accepts_valid_hmac_and_rejects_bad_or_missing(monkeypatch):
    raw_body = b'{"type":"PAYMENT_SUCCESS_WEBHOOK"}'
    timestamp = "1767225600"
    secret = "cashfree-webhook-secret"
    signature = base64.b64encode(
        hmac.new(secret.encode("utf-8"), timestamp.encode("utf-8") + raw_body, hashlib.sha256).digest()
    ).decode("utf-8")
    monkeypatch.setattr(cashfree_service, "CASHFREE_WEBHOOK_SECRET", secret)
    monkeypatch.setattr(cashfree_service, "CASHFREE_CLIENT_SECRET", "client-secret")

    assert cashfree_service.verify_cashfree_webhook_signature(
        raw_body,
        {
            "x-webhook-timestamp": timestamp,
            "x-webhook-signature": signature,
        },
    )
    assert not cashfree_service.verify_cashfree_webhook_signature(
        raw_body,
        {
            "x-webhook-timestamp": timestamp,
            "x-webhook-signature": "bad-signature",
        },
    )
    assert not cashfree_service.verify_cashfree_webhook_signature(
        raw_body,
        {"x-webhook-timestamp": timestamp},
    )


def test_cashfree_webhook_signature_is_optional_without_webhook_secret(monkeypatch):
    monkeypatch.setattr(cashfree_service, "CASHFREE_WEBHOOK_SECRET", "")
    monkeypatch.setattr(cashfree_service, "CASHFREE_CLIENT_SECRET", "client-secret")

    assert cashfree_service.verify_cashfree_webhook_signature(b"{}", {})


def test_duplicate_paid_cashfree_notifications_are_sent_once(monkeypatch):
    order = cancelled_cashfree_order(
        status="confirmed",
        refund_status="none",
        stock_deducted=True,
        payment_events=[],
        tracking_token="track-1",
    )
    setup_orders(monkeypatch, order)
    calls = []

    async def ensure_tracking_token(order):
        return "track-1"

    monkeypatch.setattr(order_service, "ensure_order_tracking_token", ensure_tracking_token)
    monkeypatch.setattr(order_service, "send_order_placed_email", lambda order: calls.append("customer_email"))
    monkeypatch.setattr(order_service, "send_admin_new_order_alert", lambda order: calls.append("admin_email"))
    monkeypatch.setattr(order_service, "send_order_status_whatsapp", lambda order: calls.append("whatsapp") or {"success": True})

    asyncio.run(order_service._send_paid_cashfree_notifications_once("order-1234567890", "webhook"))
    asyncio.run(order_service._send_paid_cashfree_notifications_once("order-1234567890", "webhook"))

    assert calls == ["customer_email", "admin_email", "whatsapp"]
    assert [
        event["type"]
        for event in order_service.db.orders.order["payment_events"]
        if event["type"] == "paid_notifications_attempted"
    ] == ["paid_notifications_attempted"]


def test_cashfree_unknown_non_refund_webhook_returns_200_and_logs(monkeypatch, caplog):
    calls = []
    monkeypatch.setattr(payments, "verify_cashfree_webhook_signature", lambda raw_body, headers: True)

    async def record_webhook(**kwargs):
        calls.append(kwargs)
        return None

    monkeypatch.setattr(payments, "record_cashfree_webhook_event", record_webhook)
    payload = {
        "type": "SOME_OTHER_WEBHOOK",
        "data": {
            "order": {"order_id": "order-1234567890"},
            "payment": {"payment_status": "PENDING"},
        },
    }

    with caplog.at_level("INFO", logger=payments.logger.name):
        result = asyncio.run(payments.cashfree_webhook_route(FakeRequest(payload)))

    assert result == {"ok": True, "received": True}
    assert calls[0]["event_type"] == "SOME_OTHER_WEBHOOK"
    assert "Cashfree webhook received non-refund event" in caplog.text


def test_invalid_cashfree_webhook_signature_is_rejected(monkeypatch):
    monkeypatch.setattr(payments, "verify_cashfree_webhook_signature", lambda raw_body, headers: False)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(payments.cashfree_webhook_route(FakeRequest({
            "type": "REFUND_STATUS_WEBHOOK",
            "data": {"refund_id": "refund-order-1", "refund_status": "SUCCESS"},
        })))

    assert exc.value.status_code == 401


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
        ("SUCCESS", "success"),
        ("REFUNDED", "success"),
        ("PENDING", "initiated"),
        ("ACCEPTED", "initiated"),
        ("PROCESSING", "processing"),
        ("CANCELLED", "failed"),
        ("FAILED", "failed"),
    ],
)
def test_cashfree_refund_status_mapping(provider_status, stored_status):
    assert order_service._map_cashfree_refund_status({"refund_status": provider_status}) == stored_status
