import asyncio

import pytest
from fastapi import HTTPException

from models.order import CashfreeCheckoutPreview
from routes import payments
from services import order_service


def _item(product_id, quantity=1, variant_id=None):
    return {
        "product_id": product_id,
        "variant_id": variant_id,
        "quantity": quantity,
        "effective_quantity": quantity,
    }


def _product(product_id, free_shipping):
    return {
        "id": product_id,
        "show_free_shipping": free_shipping,
    }


def _preview_payload(product_id="prod-1", quantity=1):
    return CashfreeCheckoutPreview(
        items=[{
            "product_id": product_id,
            "quantity": quantity,
        }],
        billing_postal_code="400706",
    )


def _calculate(items, subtotal, product_map, monkeypatch, rate_fn=None):
    calls = []

    def fake_serviceability(**kwargs):
        calls.append(kwargs)
        if rate_fn:
            return rate_fn(**kwargs)
        return {
            "enabled": True,
            "available": True,
            "shipping_charge": 80,
        }

    monkeypatch.setattr(order_service, "check_shiprocket_serviceability", fake_serviceability)
    result = asyncio.run(order_service.calculate_order_shipping(
        items_with_details=items,
        destination_pincode="400706",
        discounted_product_subtotal=subtotal,
        product_map=product_map,
    ))
    return result, calls


def test_cart_threshold_makes_entire_order_shipping_free(monkeypatch):
    result, calls = _calculate(
        [_item("prod-1"), _item("prod-2")],
        3000,
        {
            "prod-1": _product("prod-1", False),
            "prod-2": _product("prod-2", False),
        },
        monkeypatch,
    )

    assert result["shipping_charge"] == 0
    assert result["shipping_free_reason"] == "cart_threshold"
    assert calls == []


def test_all_free_shipping_items_below_threshold_are_free(monkeypatch):
    result, calls = _calculate(
        [_item("prod-1"), _item("prod-2")],
        1200,
        {
            "prod-1": _product("prod-1", True),
            "prod-2": _product("prod-2", True),
        },
        monkeypatch,
    )

    assert result["shipping_charge"] == 0
    assert result["shipping_free_reason"] == "product"
    assert calls == []


def test_mixed_cart_below_threshold_charges_only_non_free_item(monkeypatch):
    result, calls = _calculate(
        [_item("free-prod"), _item("paid-prod")],
        1800,
        {
            "free-prod": _product("free-prod", True),
            "paid-prod": _product("paid-prod", False),
        },
        monkeypatch,
    )

    assert result["shipping_charge"] == 80
    assert len(calls) == 1
    assert calls[0]["product_id"] == "paid-prod"
    assert result["shipping_breakdown"] == [
        {
            "product_id": "free-prod",
            "variant_id": None,
            "quantity": 1,
            "free_shipping": True,
            "shipping_charge": 0,
        },
        {
            "product_id": "paid-prod",
            "variant_id": None,
            "quantity": 1,
            "free_shipping": False,
            "shipping_charge": 80,
        },
    ]


def test_quantity_two_non_free_item_uses_quantity_for_shipping(monkeypatch):
    result, calls = _calculate(
        [_item("paid-prod", quantity=2)],
        1000,
        {"paid-prod": _product("paid-prod", False)},
        monkeypatch,
        rate_fn=lambda **kwargs: {
            "enabled": True,
            "available": True,
            "shipping_charge": 80 * kwargs["quantity"],
        },
    )

    assert calls[0]["quantity"] == 2
    assert result["shipping_charge"] == 160


def test_shiprocket_unavailable_blocks_non_free_shipping(monkeypatch):
    with pytest.raises(HTTPException) as error:
        _calculate(
            [_item("paid-prod")],
            1000,
            {"paid-prod": _product("paid-prod", False)},
            monkeypatch,
            rate_fn=lambda **kwargs: {
                "enabled": False,
                "available": None,
            },
        )

    assert error.value.status_code == 400
    assert error.value.detail == order_service.SHIPPING_UNAVAILABLE_MESSAGE


def test_checkout_preview_free_shipping_product_returns_zero(monkeypatch):
    async def fake_build_order_items(payload):
        items = [{**_item("free-prod"), "line_total": 899, "price": 899}]
        return items, {"free-prod": _product("free-prod", True)}

    monkeypatch.setattr(order_service, "_build_order_items", fake_build_order_items)
    result = asyncio.run(order_service.preview_checkout_shipping(
        _preview_payload("free-prod"),
        {"id": "user-1"},
    ))

    assert result["subtotal"] == 899
    assert result["shipping_charge"] == 0
    assert result["shipping_label"] == "Free"
    assert result["shipping_free_reason"] == "product"
    assert result["total_payable"] == 899


def test_checkout_preview_subtotal_threshold_returns_zero(monkeypatch):
    async def fake_build_order_items(payload):
        items = [{**_item("paid-prod"), "line_total": 3000, "price": 3000}]
        return items, {"paid-prod": _product("paid-prod", False)}

    monkeypatch.setattr(order_service, "_build_order_items", fake_build_order_items)
    result = asyncio.run(order_service.preview_checkout_shipping(
        _preview_payload("paid-prod"),
        {"id": "user-1"},
    ))

    assert result["discounted_subtotal"] == 3000
    assert result["shipping_charge"] == 0
    assert result["shipping_free_reason"] == "cart_threshold"
    assert result["total_payable"] == 3000


def test_checkout_preview_non_free_item_below_threshold_returns_shipping(monkeypatch):
    async def fake_build_order_items(payload):
        items = [{**_item("paid-prod"), "line_total": 899, "price": 899}]
        return items, {"paid-prod": _product("paid-prod", False)}

    monkeypatch.setattr(order_service, "_build_order_items", fake_build_order_items)
    monkeypatch.setattr(order_service, "check_shiprocket_serviceability", lambda **kwargs: {
        "enabled": True,
        "available": True,
        "shipping_charge": 80,
    })

    result = asyncio.run(order_service.preview_checkout_shipping(
        _preview_payload("paid-prod"),
        {"id": "user-1"},
    ))

    assert result["subtotal"] == 899
    assert result["discounted_subtotal"] == 899
    assert result["shipping_charge"] == 80
    assert result["total_payable"] == 979


def test_checkout_preview_shiprocket_unavailable_returns_clear_error(monkeypatch):
    async def fake_build_order_items(payload):
        items = [{**_item("paid-prod"), "line_total": 899, "price": 899}]
        return items, {"paid-prod": _product("paid-prod", False)}

    monkeypatch.setattr(order_service, "_build_order_items", fake_build_order_items)
    monkeypatch.setattr(order_service, "check_shiprocket_serviceability", lambda **kwargs: {
        "enabled": False,
        "available": None,
    })

    with pytest.raises(HTTPException) as error:
        asyncio.run(order_service.preview_checkout_shipping(
            _preview_payload("paid-prod"),
            {"id": "user-1"},
        ))

    assert error.value.status_code == 400
    assert error.value.detail == order_service.SHIPPING_UNAVAILABLE_MESSAGE


def test_cashfree_order_amount_includes_shipping_charge(monkeypatch):
    captured = {}

    async def fake_pending_order(payload, user):
        return {
            "id": "order-1",
            "total_price": 1160,
            "total_after_discount": 1000,
            "shipping_charge": 160,
            "billing_name": "Customer",
            "billing_email": "customer@example.com",
            "billing_phone": "9876543210",
            "stock_reserved_until": "2026-05-27T10:05:00+00:00",
        }

    def fake_cashfree_session(**kwargs):
        captured.update(kwargs)
        return {"payment_session_id": "session-1"}

    async def fake_attach_session(order_id, cashfree_data):
        return {
            "id": order_id,
            "total_price": 1160,
            "shipping_charge": 160,
            "cashfree_payment_session_id": cashfree_data["payment_session_id"],
        }

    monkeypatch.setattr(payments, "create_pending_cashfree_order", fake_pending_order)
    monkeypatch.setattr(payments, "_cashfree_order_expiry_time", lambda: "2026-05-27T10:30:00+00:00")
    monkeypatch.setattr(payments, "create_cashfree_order_session", fake_cashfree_session)
    monkeypatch.setattr(payments, "attach_cashfree_session", fake_attach_session)

    asyncio.run(payments.create_cashfree_session_route(object(), {"id": "user-1"}))

    assert captured["order_amount"] == 1160
