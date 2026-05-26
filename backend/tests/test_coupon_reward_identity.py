import asyncio
from types import SimpleNamespace

from models.coupon import AvailableCouponsRequest, CouponValidationRequest
from models.order import CashfreeCheckoutCreate
from services import coupon_service, order_service


def coupon_doc(**overrides):
    coupon = {
        "id": "coupon-1",
        "code": "THANKYOU-OWNER",
        "coupon_type": "personal",
        "visibility": "private",
        "discount_type": "fixed",
        "discount_value": 25,
        "minimum_order_amount": 0,
        "applies_to": "all",
        "applicable_category_ids": [],
        "applicable_product_ids": [],
        "is_active": True,
        "used_count": 0,
        "source": "feedback_reward",
        "assigned_user_id": "owner-user",
        "assigned_email": "owner@example.com",
        "assigned_phone": "+919876543210",
    }
    coupon.update(overrides)
    return coupon


def validation_request(**overrides):
    values = {
        "code": "THANKYOU-OWNER",
        "items": [{"product_id": "product-1", "quantity": 1, "price": 100}],
        "user_id": "owner-user",
        "email": "owner@example.com",
        "phone": "9876543210",
    }
    values.update(overrides)
    return CouponValidationRequest(**values)


class CouponLookup:
    def __init__(self, coupon):
        self.coupon = coupon

    async def find_one(self, query, projection=None):
        return dict(self.coupon) if query.get("code") == self.coupon["code"] else None


class Cursor:
    def __init__(self, documents):
        self.documents = documents

    def sort(self, *args):
        return self

    async def to_list(self, limit):
        return [dict(document) for document in self.documents[:limit]]


class AvailableCoupons:
    def __init__(self, public_coupon, reward_coupon):
        self.public_coupon = public_coupon
        self.reward_coupon = reward_coupon

    def find(self, query, projection=None):
        documents = [self.public_coupon]
        reward_filter = next(
            (entry for entry in query["$or"] if entry.get("source") == "feedback_reward"),
            None,
        )
        if reward_filter and reward_filter.get("assigned_user_id") == self.reward_coupon["assigned_user_id"]:
            documents.append(self.reward_coupon)
        return Cursor(documents)


def test_feedback_reward_cannot_be_validated_with_caller_supplied_identity(monkeypatch):
    monkeypatch.setattr(coupon_service, "db", SimpleNamespace(coupons=CouponLookup(coupon_doc())))

    result = asyncio.run(coupon_service.validate_coupon(validation_request()))

    assert result["valid"] is False
    assert result["message"] == "Coupon is not available"


def test_feedback_reward_uses_authenticated_user_id_not_billing_identity(monkeypatch):
    monkeypatch.setattr(coupon_service, "db", SimpleNamespace(coupons=CouponLookup(coupon_doc())))

    attacker_result = asyncio.run(
        coupon_service.validate_coupon(
            validation_request(),
            current_user={"id": "attacker-user"},
        )
    )
    owner_result = asyncio.run(
        coupon_service.validate_coupon(
            validation_request(email="edited-at-checkout@example.com", phone="1111111111"),
            current_user={"id": "owner-user"},
        )
    )

    assert attacker_result["valid"] is False
    assert owner_result["valid"] is True


def test_legacy_feedback_reward_without_user_id_is_rejected(monkeypatch):
    legacy_coupon = coupon_doc(assigned_user_id=None)
    monkeypatch.setattr(coupon_service, "db", SimpleNamespace(coupons=CouponLookup(legacy_coupon)))

    result = asyncio.run(
        coupon_service.validate_coupon(
            validation_request(),
            current_user={"id": "owner-user"},
        )
    )

    assert result["valid"] is False
    assert result["message"] == "Coupon is not available"


def test_public_coupon_still_validates_for_guest(monkeypatch):
    public_coupon = coupon_doc(
        code="MARISO15",
        coupon_type="general",
        visibility="public",
        source=None,
        assigned_user_id=None,
        assigned_email=None,
        assigned_phone=None,
    )
    monkeypatch.setattr(coupon_service, "db", SimpleNamespace(coupons=CouponLookup(public_coupon)))

    result = asyncio.run(
        coupon_service.validate_coupon(validation_request(code="MARISO15", user_id=None, email=None, phone=None))
    )

    assert result["valid"] is True
    assert result["code"] == "MARISO15"


def test_available_rewards_are_selected_by_authenticated_user_id_only(monkeypatch):
    public_coupon = coupon_doc(
        id="public-1",
        code="CHECK5",
        coupon_type="general",
        visibility="public",
        source=None,
        assigned_user_id=None,
        assigned_email=None,
        assigned_phone=None,
    )
    reward_coupon = coupon_doc()
    monkeypatch.setattr(
        coupon_service,
        "db",
        SimpleNamespace(coupons=AvailableCoupons(public_coupon, reward_coupon)),
    )
    request = AvailableCouponsRequest(
        items=[{"product_id": "product-1", "quantity": 1, "price": 100}],
        user_id="owner-user",
        email="owner@example.com",
        phone="9876543210",
    )

    guest_codes = [
        coupon["code"]
        for coupon in asyncio.run(coupon_service.get_available_coupons(request))
    ]
    owner_codes = [
        coupon["code"]
        for coupon in asyncio.run(
            coupon_service.get_available_coupons(request, current_user={"id": "owner-user"})
        )
    ]

    assert guest_codes == ["CHECK5"]
    assert owner_codes == ["CHECK5", "THANKYOU-OWNER"]


def test_checkout_coupon_revalidation_passes_authenticated_user(monkeypatch):
    captured = {}

    async def fake_validate(request, *, current_user=None):
        captured["current_user"] = current_user
        return {
            "valid": True,
            "code": request.code,
            "coupon_id": "coupon-1",
            "discount_amount": 25,
            "eligible_subtotal": 100,
            "cart_subtotal": 100,
            "final_total": 75,
            "coupon_snapshot": {"source": "feedback_reward"},
        }

    monkeypatch.setattr(order_service, "validate_coupon", fake_validate)
    payload = CashfreeCheckoutCreate(
        items=[{"product_id": "product-1", "quantity": 1}],
        billing_name="Customer",
        billing_phone="1111111111",
        billing_email="edited-at-checkout@example.com",
        billing_address="Address",
        billing_city="Mumbai",
        billing_state="Maharashtra",
        billing_postal_code="400001",
        coupon_code="THANKYOU-OWNER",
    )

    asyncio.run(
        order_service._calculate_coupon_adjustment(
            payload,
            {"id": "owner-user"},
            [{"product_id": "product-1", "category_id": "", "quantity": 1, "price": 100}],
            100,
        )
    )

    assert captured["current_user"] == {"id": "owner-user"}
