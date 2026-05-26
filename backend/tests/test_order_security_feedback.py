import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

import email_service
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


def test_customer_cannot_invoke_manual_paid_order_creation():
    with pytest.raises(HTTPException) as error:
        asyncio.run(order_service.create_order(None, {"role": "user"}))

    assert error.value.status_code == 403
    assert "Cashfree checkout" in error.value.detail


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
