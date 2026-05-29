import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import email_service
import whatsapp_service
from models.order import CashfreeCheckoutCreate, OrderStatusUpdate
from services import feedback_service, order_service


class FakeOrders:
    def __init__(self, order):
        self.order = dict(order)
        self.update_count = 0

    async def find_one(self, query, projection=None):
        if query.get("id") == self.order.get("id"):
            return dict(self.order)
        if query.get("feedback_token") == self.order.get("feedback_token"):
            return dict(self.order)
        return None

    async def update_one(self, query, update):
        if query.get("id") == self.order.get("id") and not self.order.get("feedback_token"):
            self.order.update(update["$set"])
            self.update_count += 1
        return SimpleNamespace(modified_count=1)


class FakeFeedbackSubmissions:
    def __init__(self, submission=None):
        self.submission = submission

    async def find_one(self, query, projection=None):
        return dict(self.submission) if self.submission else None


class EmptyQuestions:
    def find(self, query, projection=None):
        return self

    def sort(self, *args):
        return self

    async def to_list(self, limit):
        return []


class EmptyCoupons:
    async def find_one(self, query, projection=None):
        return None


MISSING = object()


def matches(document, query):
    for key, expected in query.items():
        if key == "$or":
            if not any(matches(document, candidate) for candidate in expected):
                return False
            continue
        actual = document.get(key, MISSING)
        if isinstance(expected, dict):
            if "$in" in expected and actual not in expected["$in"] and not (
                actual is MISSING and None in expected["$in"]
            ):
                return False
            if "$exists" in expected and (actual is not MISSING) != expected["$exists"]:
                return False
            if "$nin" in expected and actual in expected["$nin"]:
                return False
        elif actual is MISSING or actual != expected:
            return False
    return True


class StatusUpdateOrders:
    def __init__(self, order):
        self.order = dict(order)

    async def find_one(self, query, projection=None):
        return dict(self.order) if matches(self.order, query) else None

    async def update_one(self, query, update):
        if not matches(self.order, query):
            return SimpleNamespace(modified_count=0)
        self.order.update(update.get("$set", {}))
        return SimpleNamespace(modified_count=1)


class StatusUpdateUsers:
    async def find_one(self, query, projection=None):
        return {"id": query.get("id"), "name": "Customer", "email": "customer@example.com"}


def setup_status_update_database(monkeypatch, order):
    orders = StatusUpdateOrders(order)
    database = SimpleNamespace(orders=orders, users=StatusUpdateUsers())
    monkeypatch.setattr(order_service, "db", database)
    return orders


class CheckoutCollection:
    def __init__(self, document=None):
        self.document = dict(document) if document else None

    async def find_one(self, query, projection=None):
        if self.document and all(self.document.get(key) == value for key, value in query.items()):
            return dict(self.document)
        return None


class StockUpdateProducts:
    def __init__(self, product):
        self.product = dict(product)

    async def update_one(self, query, update):
        if self.product.get("id") != query.get("id"):
            return SimpleNamespace(modified_count=0)

        if "stock" in query:
            minimum = query["stock"].get("$gte", 0)
            if self.product.get("stock", 0) < minimum:
                return SimpleNamespace(modified_count=0)

        for key, amount in update.get("$inc", {}).items():
            self.product[key] = self.product.get(key, 0) + amount

        return SimpleNamespace(modified_count=1)


def checkout_payload(**item_fields):
    return CashfreeCheckoutCreate(
        items=[{"product_id": "product-1", "quantity": 1, **item_fields}],
        billing_name="Customer",
        billing_phone="9876543210",
        billing_email="customer@example.com",
        billing_address="Address",
        billing_city="Mumbai",
        billing_state="Maharashtra",
        billing_postal_code="400001",
    )


def test_customer_cannot_invoke_manual_paid_order_creation():
    with pytest.raises(HTTPException) as error:
        asyncio.run(order_service.create_order(None, {"role": "user"}))

    assert error.value.status_code == 403
    assert "Cashfree checkout" in error.value.detail


def test_checkout_rejects_inactive_product(monkeypatch):
    database = SimpleNamespace(
        products=CheckoutCollection({"id": "product-1", "name": "Hidden Candle", "is_active": False}),
        categories=CheckoutCollection(),
    )
    monkeypatch.setattr(order_service, "db", database)

    with pytest.raises(HTTPException) as error:
        asyncio.run(order_service._build_order_items(checkout_payload()))

    assert error.value.status_code == 400
    assert "inactive" in error.value.detail


def test_checkout_rejects_product_in_inactive_category(monkeypatch):
    database = SimpleNamespace(
        products=CheckoutCollection({
            "id": "product-1",
            "name": "Hidden Category Candle",
            "is_active": True,
            "category_id": "category-1",
        }),
        categories=CheckoutCollection({"id": "category-1", "is_active": False}),
    )
    monkeypatch.setattr(order_service, "db", database)

    with pytest.raises(HTTPException) as error:
        asyncio.run(order_service._build_order_items(checkout_payload()))

    assert error.value.status_code == 400
    assert "inactive category" in error.value.detail


def test_checkout_rejects_inactive_variant(monkeypatch):
    database = SimpleNamespace(
        products=CheckoutCollection({
            "id": "product-1",
            "name": "Variant Candle",
            "is_active": True,
            "price": 100,
            "variants": [{"id": "variant-1", "stock": 5, "is_active": False}],
        }),
        categories=CheckoutCollection(),
    )
    monkeypatch.setattr(order_service, "db", database)

    with pytest.raises(HTTPException) as error:
        asyncio.run(order_service._build_order_items(checkout_payload(variant_id="variant-1")))

    assert error.value.status_code == 400
    assert "Selected variant is inactive" in error.value.detail


def test_pack_only_product_checkout_uses_pack_quantity_and_piece_metadata(monkeypatch):
    database = SimpleNamespace(
        products=CheckoutCollection({
            "id": "product-1",
            "name": "Tealight Set",
            "is_active": True,
            "price": 499,
            "stock": 10,
            "base_pieces_per_unit": 25,
            "pack_options": [
                {"id": "pack-1", "label": "Single", "multiplier": 1, "pieces_per_pack": 25, "is_active": True},
                {"id": "pack-4", "label": "Pack of 4", "multiplier": 4, "pieces_per_pack": 100, "is_active": True},
            ],
            "variants": [
                {"id": "variant-pack-1", "pack_option_id": "pack-1", "stock": 10, "price_override": 499, "is_active": True},
                {"id": "variant-pack-4", "pack_option_id": "pack-4", "stock": 3, "price_override": 1699, "sale_price": 1499, "is_active": True},
            ],
        }),
        categories=CheckoutCollection(),
    )
    monkeypatch.setattr(order_service, "db", database)

    items, _ = asyncio.run(order_service._build_order_items(
        checkout_payload(quantity=2, variant_id="variant-pack-4", selected_pack_id="pack-4")
    ))

    assert items[0]["quantity"] == 2
    assert items[0]["selected_pack_id"] == "pack-4"
    assert items[0]["selected_pack_label"] == "Pack of 4"
    assert items[0]["pack_multiplier"] == 4
    assert items[0]["pieces_per_pack"] == 100
    assert items[0]["total_pieces"] == 200
    assert items[0]["effective_quantity"] == 2
    assert items[0]["price"] == 1499
    assert items[0]["line_total"] == 2998


def test_pack_product_checkout_rejects_insufficient_pack_stock(monkeypatch):
    database = SimpleNamespace(
        products=CheckoutCollection({
            "id": "product-1",
            "name": "Tealight Set",
            "is_active": True,
            "price": 499,
            "base_pieces_per_unit": 25,
            "pack_options": [
                {"id": "pack-4", "label": "Pack of 4", "multiplier": 4, "pieces_per_pack": 100, "is_active": True},
            ],
            "variants": [
                {"id": "variant-pack-4", "pack_option_id": "pack-4", "stock": 1, "price_override": 1699, "is_active": True},
            ],
        }),
        categories=CheckoutCollection(),
    )
    monkeypatch.setattr(order_service, "db", database)

    with pytest.raises(HTTPException) as error:
        asyncio.run(order_service._build_order_items(
            checkout_payload(quantity=2, variant_id="variant-pack-4", selected_pack_id="pack-4")
        ))

    assert error.value.status_code == 400
    assert "Insufficient stock" in error.value.detail


def test_color_pack_product_variant_stock_uses_selected_combination(monkeypatch):
    database = SimpleNamespace(
        products=CheckoutCollection({
            "id": "product-1",
            "name": "Blush Tealights",
            "is_active": True,
            "price": 499,
            "base_pieces_per_unit": 25,
            "pack_options": [
                {"id": "pack-2", "label": "Pack of 2", "multiplier": 2, "pieces_per_pack": 50, "is_active": True},
            ],
            "variants": [
                {"id": "variant-1", "color_id": "blush", "flavor_id": None, "pack_option_id": "pack-2", "stock": 10, "is_active": True},
                {"id": "variant-2", "color_id": "ivory", "flavor_id": None, "pack_option_id": "pack-2", "stock": 0, "is_active": True},
            ],
        }),
        categories=CheckoutCollection(),
    )
    monkeypatch.setattr(order_service, "db", database)

    items, _ = asyncio.run(order_service._build_order_items(
        checkout_payload(quantity=2, variant_id="variant-1", color_id="blush", selected_pack_id="pack-2")
    ))
    assert items[0]["effective_quantity"] == 2
    assert items[0]["total_pieces"] == 100

    with pytest.raises(HTTPException) as error:
        asyncio.run(order_service._build_order_items(
            checkout_payload(quantity=1, variant_id="variant-2", color_id="ivory", selected_pack_id="pack-2")
        ))

    assert error.value.status_code == 400
    assert "Insufficient stock" in error.value.detail


def test_normal_product_stock_deduction_uses_quantity(monkeypatch):
    products = StockUpdateProducts({"id": "product-1", "name": "Candle", "stock": 10})
    monkeypatch.setattr(order_service, "db", SimpleNamespace(products=products))

    asyncio.run(order_service._apply_stock_updates(
        [{"product_id": "product-1", "quantity": 2}],
        {"product-1": {"id": "product-1", "name": "Candle", "stock": 10}},
    ))

    assert products.product["stock"] == 8


def test_pack_product_stock_deduction_uses_pack_quantity(monkeypatch):
    products = StockUpdateProducts({"id": "product-1", "name": "Tealight Set", "stock": 10})
    monkeypatch.setattr(order_service, "db", SimpleNamespace(products=products))

    asyncio.run(order_service._apply_stock_updates(
        [{
            "product_id": "product-1",
            "quantity": 2,
            "selected_pack_id": "pack-4",
            "pieces_per_pack": 100,
            "total_pieces": 200,
        }],
        {"product-1": {"id": "product-1", "name": "Tealight Set", "stock": 10}},
    ))

    assert products.product["stock"] == 8


def test_feedback_token_is_recovered_from_submission_and_reused(monkeypatch):
    orders = FakeOrders({"id": "order-1", "status": "delivered"})
    database = SimpleNamespace(
        orders=orders,
        feedback_submissions=FakeFeedbackSubmissions({"feedback_token": "saved-feedback-token"}),
    )
    monkeypatch.setattr(order_service, "db", database)

    first_token = asyncio.run(order_service.ensure_order_feedback_token(orders.order))
    second_token = asyncio.run(order_service.ensure_order_feedback_token(orders.order))

    assert first_token == "saved-feedback-token"
    assert second_token == "saved-feedback-token"
    assert orders.update_count == 1


def test_feedback_page_service_loads_delivered_order_by_token(monkeypatch):
    database = SimpleNamespace(
        orders=FakeOrders({"id": "order-1", "status": "delivered", "feedback_token": "feedback-token"}),
        feedback_questions=EmptyQuestions(),
        feedback_submissions=FakeFeedbackSubmissions(),
        coupons=EmptyCoupons(),
    )
    monkeypatch.setattr(feedback_service, "db", database)

    response = asyncio.run(feedback_service.get_public_feedback("feedback-token"))

    assert response["order"]["status"] == "delivered"
    assert response["already_submitted"] is False


def test_delivered_email_uses_feedback_token_and_suppresses_broken_link(monkeypatch):
    sent_html = []
    monkeypatch.setattr(email_service, "send_email", lambda subject, to_email, html: sent_html.append(html))

    email_service.send_order_status_email({
        "id": "order-id-not-a-token",
        "status": "delivered",
        "feedback_token": "feedback-token",
        "billing_email": "customer@example.com",
        "billing_name": "Customer",
    })

    assert "/feedback/feedback-token" in sent_html[0]
    assert "/feedback/order-id-not-a-token" not in sent_html[0]

    sent_html.clear()
    email_service.send_order_status_email({
        "id": "order-without-token",
        "status": "delivered",
        "billing_email": "customer@example.com",
        "billing_name": "Customer",
    })

    assert sent_html == []


def test_delivered_status_triggers_feedback_whatsapp_once(monkeypatch):
    orders = setup_status_update_database(monkeypatch, {
        "id": "order-1",
        "user_id": "user-1",
        "status": "shipped",
        "billing_phone": "9876543210",
        "billing_email": "customer@example.com",
        "billing_name": "Customer",
        "tracking_token": "tracking-token",
        "feedback_token": "feedback-token",
        "cancellation_status": "none",
    })
    sent_orders = []
    monkeypatch.setattr(order_service, "send_order_status_email", lambda order: None)
    monkeypatch.setattr(order_service, "send_order_status_whatsapp", lambda order: {"success": True})
    monkeypatch.setattr(
        order_service,
        "send_feedback_reward_whatsapp",
        lambda order: sent_orders.append(order["id"]) or {"success": True},
    )

    result = asyncio.run(order_service.update_order_status(
        "order-1",
        OrderStatusUpdate(status="delivered"),
        "admin-1",
    ))

    assert sent_orders == ["order-1"]
    assert result["feedback_whatsapp_sent_at"]
    assert orders.order["feedback_whatsapp_sent_at"] == result["feedback_whatsapp_sent_at"]


def test_re_saving_delivered_status_does_not_duplicate_feedback_whatsapp(monkeypatch):
    setup_status_update_database(monkeypatch, {
        "id": "order-1",
        "user_id": "user-1",
        "status": "delivered",
        "billing_phone": "9876543210",
        "billing_email": "customer@example.com",
        "billing_name": "Customer",
        "tracking_token": "tracking-token",
        "feedback_token": "feedback-token",
        "feedback_whatsapp_sent_at": "already-sent",
        "cancellation_status": "none",
    })
    sent_orders = []
    monkeypatch.setattr(order_service, "send_order_status_email", lambda order: None)
    monkeypatch.setattr(order_service, "send_order_status_whatsapp", lambda order: {"success": True})
    monkeypatch.setattr(
        order_service,
        "send_feedback_reward_whatsapp",
        lambda order: sent_orders.append(order["id"]) or {"success": True},
    )

    asyncio.run(order_service.update_order_status(
        "order-1",
        OrderStatusUpdate(status="delivered"),
        "admin-1",
    ))

    assert sent_orders == []


def test_missing_feedback_whatsapp_sid_skips_gracefully(monkeypatch):
    monkeypatch.delenv("TWILIO_WHATSAPP_FEEDBACK_REWARD_CONTENT_SID", raising=False)
    monkeypatch.setattr(
        whatsapp_service,
        "send_whatsapp_template",
        lambda *args, **kwargs: pytest.fail("send_whatsapp_template should not be called without feedback SID"),
    )

    result = whatsapp_service.send_feedback_reward_whatsapp({
        "id": "order-1",
        "billing_phone": "9876543210",
        "billing_name": "Customer",
        "feedback_token": "feedback-token",
    })

    assert result == {"success": False, "sid": None, "error": "missing_feedback_reward_template_sid"}


def test_feedback_whatsapp_uses_feedback_link_and_three_template_variables(monkeypatch):
    captured = {}
    monkeypatch.setenv("TWILIO_WHATSAPP_FEEDBACK_REWARD_CONTENT_SID", "HX_test")
    monkeypatch.setattr(whatsapp_service, "FRONTEND_URL", "https://mariso.example")

    def fake_send_whatsapp_template(to_number, content_sid, content_variables):
        captured["to_number"] = to_number
        captured["content_sid"] = content_sid
        captured["content_variables"] = content_variables
        return {"success": True, "sid": "SM_test", "error": None}

    monkeypatch.setattr(whatsapp_service, "send_whatsapp_template", fake_send_whatsapp_template)

    result = whatsapp_service.send_feedback_reward_whatsapp({
        "id": "order-123456789",
        "billing_phone": "9876543210",
        "billing_name": "Customer",
        "feedback_token": "feedback-token",
    })

    assert result["success"] is True
    assert captured == {
        "to_number": "9876543210",
        "content_sid": "HX_test",
        "content_variables": {
            "1": "Customer",
            "2": "ORDER-12",
            "3": "https://mariso.example/feedback/feedback-token",
        },
    }


def test_non_delivered_status_does_not_send_feedback_reward_whatsapp(monkeypatch):
    setup_status_update_database(monkeypatch, {
        "id": "order-1",
        "user_id": "user-1",
        "status": "confirmed",
        "billing_phone": "9876543210",
        "billing_email": "customer@example.com",
        "billing_name": "Customer",
        "tracking_token": "tracking-token",
        "cancellation_status": "none",
    })
    sent_orders = []
    monkeypatch.setattr(order_service, "send_order_status_whatsapp", lambda order: {"success": True})
    monkeypatch.setattr(
        order_service,
        "send_feedback_reward_whatsapp",
        lambda order: sent_orders.append(order["id"]) or {"success": True},
    )

    asyncio.run(order_service.update_order_status(
        "order-1",
        OrderStatusUpdate(status="packed"),
        "admin-1",
    ))

    assert sent_orders == []
