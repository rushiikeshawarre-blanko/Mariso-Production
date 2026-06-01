import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from core.auth import get_admin_user
from routes.orders import router as orders_router
from routes.shiprocket import router as shiprocket_router
from services import order_service, shiprocket_service


MISSING = object()


def matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(document, option) for option in expected):
                return False
            continue

        actual = document
        for part in key.split("."):
            if isinstance(actual, dict):
                actual = actual.get(part, MISSING)
            else:
                actual = MISSING
                break

        if isinstance(expected, dict):
            if "$exists" in expected:
                exists = actual is not MISSING
                if exists != expected["$exists"]:
                    return False
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
                if actual is not MISSING and actual == disallowed:
                    return False
        elif actual is MISSING or actual != expected:
            return False
    return True


class FakeOrders:
    def __init__(self, order):
        self.order = dict(order)
        self.update_calls = []

    async def find_one(self, query, projection=None):
        return dict(self.order) if matches(self.order, query) else None

    async def update_one(self, query, update):
        self.update_calls.append((query, update))
        if not matches(self.order, query):
            return SimpleNamespace(modified_count=0)
        self.order.update(update.get("$set", {}))
        return SimpleNamespace(modified_count=1)


def paid_order(**overrides):
    order = {
        "id": "order-123",
        "status": "confirmed",
        "payment_status": "paid",
        "payment_provider": "cashfree",
        "billing_name": "Aisha Sharma",
        "billing_email": "aisha@example.com",
        "billing_phone": "+919876543210",
        "billing_address": "Palm Beach Road",
        "billing_address_2": "Apt 11",
        "billing_city": "Navi Mumbai",
        "billing_state": "Maharashtra",
        "billing_country": "India",
        "billing_postal_code": "400706",
        "items": [
            {
                "product_id": "prod-1",
                "name": "Lavender Candle",
                "quantity": 2,
                "price": 499,
                "line_total": 998,
            }
        ],
        "total_price": 998,
        "cancellation_status": "none",
        "refund_status": "none",
        "created_at": "2026-05-31T10:00:00+00:00",
    }
    order.update(overrides)
    return order


def setup_orders(monkeypatch, order):
    orders = FakeOrders(order)
    monkeypatch.setattr(order_service, "db", SimpleNamespace(orders=orders))
    return orders


def enable_shiprocket(monkeypatch):
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_ENABLED", True)
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_EMAIL", "shiprocket@example.com")
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_PASSWORD", "secret")
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_PICKUP_PINCODE", "400706")


class FakeShiprocketResponse:
    def __init__(self, data, status_code=200):
        self._data = data
        self.status_code = status_code
        self.text = str(data)

    def json(self):
        return self._data


def test_disabled_config_returns_disabled_response_and_does_not_call_shiprocket(monkeypatch):
    setup_orders(monkeypatch, paid_order())
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_ENABLED", False)

    def fail_post(*args, **kwargs):
        raise AssertionError("Shiprocket HTTP should not be called when disabled")

    monkeypatch.setattr(shiprocket_service.requests, "post", fail_post)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(order_service.create_shiprocket_shipment_for_order("order-123", "admin-1"))

    assert exc.value.status_code == 503
    assert exc.value.detail == "Shiprocket integration is disabled"


def test_serviceability_invalid_pincode_returns_400():
    app = FastAPI()
    app.include_router(shiprocket_router)

    response = TestClient(app).post("/api/shiprocket/serviceability", json={"pincode": "40070A"})

    assert response.status_code == 400
    assert response.json()["detail"] == "Enter a valid 6-digit India pincode"


def test_serviceability_disabled_returns_safe_response_and_does_not_call_shiprocket(monkeypatch):
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_ENABLED", False)

    def fail_post(*args, **kwargs):
        raise AssertionError("Shiprocket HTTP should not be called when disabled")

    def fail_get(*args, **kwargs):
        raise AssertionError("Shiprocket HTTP should not be called when disabled")

    monkeypatch.setattr(shiprocket_service.requests, "post", fail_post)
    monkeypatch.setattr(shiprocket_service.requests, "get", fail_get)

    result = shiprocket_service.check_shiprocket_serviceability(pincode="400706")

    assert result == {
        "available": None,
        "enabled": False,
        "message": "Delivery estimate will be available soon.",
    }


def test_serviceability_enabled_success_maps_response(monkeypatch):
    enable_shiprocket(monkeypatch)
    captured = {}
    monkeypatch.setattr(shiprocket_service, "authenticate_shiprocket", lambda: "token-123")

    def fake_get(url, params, headers, timeout):
        captured.update({"url": url, "params": params, "headers": headers, "timeout": timeout})
        return FakeShiprocketResponse(
            {
                "data": {
                    "available_courier_companies": [
                        {
                            "courier_name": "Delhivery",
                            "estimated_delivery_days": "3-6",
                        }
                    ]
                }
            }
        )

    monkeypatch.setattr(shiprocket_service.requests, "get", fake_get)

    result = shiprocket_service.check_shiprocket_serviceability(
        pincode="560001",
        product_id="prod-1",
        quantity=2,
    )

    assert captured["url"].endswith("/courier/serviceability/")
    assert captured["params"]["pickup_postcode"] == "400706"
    assert captured["params"]["delivery_postcode"] == "560001"
    assert captured["params"]["cod"] == 0
    assert captured["params"]["weight"] == 1.0
    assert captured["params"]["length"] == 20
    assert captured["params"]["breadth"] == 20
    assert captured["params"]["height"] == 15
    assert captured["headers"]["Authorization"] == "Bearer token-123"
    assert result == {
        "available": True,
        "enabled": True,
        "estimated_delivery_days": "3-6 days",
        "courier_name": "Delhivery",
        "shipping_charge": None,
        "message": "Delivery available in 3-6 days",
    }


def test_serviceability_uses_product_package_fields_with_quantity(monkeypatch):
    enable_shiprocket(monkeypatch)
    captured = {}
    monkeypatch.setattr(shiprocket_service, "authenticate_shiprocket", lambda: "token-123")

    def fake_get(url, params, headers, timeout):
        captured.update({"params": params})
        return FakeShiprocketResponse(
            {
                "data": {
                    "available_courier_companies": [
                        {
                            "courier_name": "Delhivery",
                            "freight_charge": 120,
                        }
                    ]
                }
            }
        )

    monkeypatch.setattr(shiprocket_service.requests, "get", fake_get)

    result = shiprocket_service.check_shiprocket_serviceability(
        pincode="560001",
        product_id="prod-1",
        quantity=3,
        weight_kg=0.7,
        length_cm=13.5,
        breadth_cm=9.25,
        height_cm=7,
    )

    assert captured["params"]["weight"] == 2.1
    assert captured["params"]["length"] == 13.5
    assert captured["params"]["breadth"] == 9.25
    assert captured["params"]["height"] == 7
    assert result["shipping_charge"] == 120


def test_serviceability_invalid_package_fields_fallback_to_env_defaults(monkeypatch):
    enable_shiprocket(monkeypatch)
    captured = {}
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_DEFAULT_WEIGHT_KG", "0.8")
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_DEFAULT_LENGTH_CM", "18")
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_DEFAULT_BREADTH_CM", "14")
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_DEFAULT_HEIGHT_CM", "9")
    monkeypatch.setattr(shiprocket_service, "authenticate_shiprocket", lambda: "token-123")

    def fake_get(url, params, headers, timeout):
        captured.update({"params": params})
        return FakeShiprocketResponse(
            {
                "data": {
                    "available_courier_companies": [
                        {
                            "courier_name": "Delhivery",
                            "freight_charge": 80,
                        }
                    ]
                }
            }
        )

    monkeypatch.setattr(shiprocket_service.requests, "get", fake_get)

    shiprocket_service.check_shiprocket_serviceability(
        pincode="560001",
        product_id="prod-1",
        quantity=2,
        weight_kg=0,
        length_cm=None,
        breadth_cm="bad",
        height_cm=-1,
    )

    assert captured["params"]["weight"] == 1.6
    assert captured["params"]["length"] == 18
    assert captured["params"]["breadth"] == 14
    assert captured["params"]["height"] == 9


def test_serviceability_enabled_unavailable_maps_response(monkeypatch):
    enable_shiprocket(monkeypatch)
    monkeypatch.setattr(shiprocket_service, "authenticate_shiprocket", lambda: "token-123")

    def fake_get(*args, **kwargs):
        return FakeShiprocketResponse(
            {
                "message": "No courier serviceable for this pickup and delivery pincode",
                "data": {"available_courier_companies": []},
            }
        )

    monkeypatch.setattr(shiprocket_service.requests, "get", fake_get)

    result = shiprocket_service.check_shiprocket_serviceability(pincode="999999")

    assert result == {
        "available": False,
        "enabled": True,
        "estimated_delivery_days": None,
        "courier_name": None,
        "shipping_charge": None,
        "message": "No courier serviceable for this pickup and delivery pincode",
    }


def test_non_admin_rejected():
    app = FastAPI()
    app.include_router(orders_router)

    async def reject_non_admin():
        raise HTTPException(status_code=403, detail="Admin access required")

    app.dependency_overrides[get_admin_user] = reject_non_admin

    response = TestClient(app).post("/api/orders/admin/order-123/shiprocket/create-shipment")

    assert response.status_code == 403
    assert response.json()["detail"] == "Admin access required"


def test_unpaid_order_rejected(monkeypatch):
    setup_orders(monkeypatch, paid_order(status="pending_payment", payment_status="pending"))
    enable_shiprocket(monkeypatch)
    monkeypatch.setattr(order_service, "create_shiprocket_order", lambda payload: pytest.fail("should not call Shiprocket"))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(order_service.create_shiprocket_shipment_for_order("order-123", "admin-1"))

    assert exc.value.status_code == 400
    assert "eligible" in exc.value.detail


def test_cancelled_refunded_order_rejected(monkeypatch):
    setup_orders(
        monkeypatch,
        paid_order(status="cancelled", cancellation_status="approved", refund_status="initiated"),
    )
    enable_shiprocket(monkeypatch)
    monkeypatch.setattr(order_service, "create_shiprocket_order", lambda payload: pytest.fail("should not call Shiprocket"))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(order_service.create_shiprocket_shipment_for_order("order-123", "admin-1"))

    assert exc.value.status_code == 400


def test_duplicate_shipment_rejected(monkeypatch):
    setup_orders(monkeypatch, paid_order(shiprocket_order_id="sr-order-1"))
    enable_shiprocket(monkeypatch)
    monkeypatch.setattr(order_service, "create_shiprocket_order", lambda payload: pytest.fail("should not call Shiprocket"))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(order_service.create_shiprocket_shipment_for_order("order-123", "admin-1"))

    assert exc.value.status_code == 409
    assert "already exists" in exc.value.detail


def test_mocked_successful_shiprocket_response_stores_shipment_fields(monkeypatch):
    orders = setup_orders(monkeypatch, paid_order())
    captured_payload = {}
    enable_shiprocket(monkeypatch)

    def fake_create_shiprocket_order(payload):
        captured_payload.update(payload)
        return {
            "order_id": "sr-order-1",
            "shipment_id": "sr-ship-1",
            "awb_code": "AWB123",
            "courier_name": "Delhivery",
            "tracking_url": "https://track.example/AWB123",
            "status": "NEW",
        }

    monkeypatch.setattr(order_service, "create_shiprocket_order", fake_create_shiprocket_order)

    result = asyncio.run(order_service.create_shiprocket_shipment_for_order("order-123", "admin-1"))

    assert captured_payload["order_id"] == "order-123"
    assert captured_payload["pickup_location"] == shiprocket_service.config.SHIPROCKET_PICKUP_LOCATION
    assert captured_payload["payment_method"] == "Prepaid"
    assert captured_payload["order_items"][0]["sku"] == "prod-1"
    assert result["shipping_provider"] == "shiprocket"
    assert result["shiprocket_order_id"] == "sr-order-1"
    assert result["shiprocket_shipment_id"] == "sr-ship-1"
    assert result["shiprocket_awb_code"] == "AWB123"
    assert result["shiprocket_courier_name"] == "Delhivery"
    assert result["shiprocket_tracking_url"] == "https://track.example/AWB123"
    assert result["shipment_status"] == "NEW"
    assert result["shipment_created_at"]
    assert orders.order["updated_by"] == "admin-1"


def test_missing_credentials_enabled_gives_clear_error(monkeypatch):
    setup_orders(monkeypatch, paid_order())
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_ENABLED", True)
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_EMAIL", "")
    monkeypatch.setattr(shiprocket_service.config, "SHIPROCKET_PASSWORD", "")

    def fail_post(*args, **kwargs):
        raise AssertionError("Shiprocket HTTP should not be called without credentials")

    monkeypatch.setattr(shiprocket_service.requests, "post", fail_post)

    with pytest.raises(HTTPException) as exc:
        asyncio.run(order_service.create_shiprocket_shipment_for_order("order-123", "admin-1"))

    assert exc.value.status_code == 500
    assert exc.value.detail == "Shiprocket credentials are not configured"
