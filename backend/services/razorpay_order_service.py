"""Additive, test-mode checkout creation. Verification/recovery are later phases."""

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
import uuid

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError, PyMongoError

from core import config
from core.constants import PAYMENT_PROVIDER_RAZORPAY
from core.database import db
from models.coupon import CouponValidationItem, CouponValidationRequest, normalize_coupon_code
from services import order_service as orders
from services import razorpay_inventory_service as inventory
from services.coupon_service import validate_coupon
from services.payment_money import decimal_amount, money, paise, rupees
from services.razorpay_service import (
    create_razorpay_order, require_order_creation_enabled,
)

logger = logging.getLogger(__name__)


def now():
    return datetime.now(timezone.utc)


def coupon_discount(snapshot, items):
    """Calculate in Decimal after the existing service checks identity/eligibility."""
    scope = snapshot.get('applies_to', 'all')
    if scope not in {'all', 'categories', 'products'}:
        raise HTTPException(400, 'Invalid coupon scope')
    eligible = sum((money(item['line_total']) for item in items if (
        scope == 'all'
        or scope == 'products' and item['product_id'] in snapshot.get('applicable_product_ids', [])
        or scope == 'categories' and item['category_id'] in snapshot.get('applicable_category_ids', [])
    )), Decimal(0))
    if eligible <= 0 or eligible < money(snapshot.get('minimum_order_amount') or 0):
        raise HTTPException(400, 'Coupon minimum is not met')
    value = decimal_amount(snapshot['discount_value'])
    if value <= 0:
        raise HTTPException(400, 'Invalid coupon discount')
    if snapshot['discount_type'] == 'percentage':
        if value > 100:
            raise HTTPException(400, 'Invalid coupon percentage')
        discount = eligible * value / 100
        cap = snapshot.get('max_discount_amount')
        if cap is not None:
            discount = min(discount, money(cap))
    elif snapshot['discount_type'] == 'fixed':
        discount = value
    else:
        raise HTTPException(400, 'Invalid coupon discount type')
    return min(eligible, money(discount)), eligible


async def build_quote(payload, user):
    if not payload.items:
        raise HTTPException(400, 'Order must contain at least one item')
    items, products = await orders._build_order_items(payload, money_round=rupees)
    subtotal = Decimal(0)
    packaging = Decimal(0)
    for item in items:
        unit = money(item['price'])
        line = unit * item['quantity']
        item.update(price=float(unit), line_total=float(line), unit_price_paise=paise(unit),
                    line_total_paise=paise(line))
        subtotal += line
        gift = item.get('gift_packaging')
        if gift:
            gift_total = money(gift['unit_price']) * gift['quantity']
            gift.update(line_total=float(gift_total), line_total_paise=paise(gift_total))
            packaging += gift_total
    if payload.gift_packaging and not orders._has_item_gift_packaging(items):
        packaging = money(orders.GIFT_PACKAGING_PRICE)
    discount, eligible = Decimal(0), None
    validation = {}
    if payload.coupon_code and payload.coupon_code.strip():
        validation = await validate_coupon(CouponValidationRequest(
            code=normalize_coupon_code(payload.coupon_code),
            items=[CouponValidationItem(product_id=i['product_id'], category_id=i['category_id'],
                                       quantity=i['quantity'], price=i['price']) for i in items],
            user_id=user['id'], email=payload.billing_email, phone=payload.billing_phone,
        ), current_user=user)
        if not validation.get('valid'):
            raise HTTPException(400, 'Coupon is no longer valid')
        discount, eligible = coupon_discount(validation['coupon_snapshot'], items)
    shipping = await orders.calculate_order_shipping(
        items_with_details=items, destination_pincode=payload.billing_postal_code,
        discounted_product_subtotal=float(subtotal - discount), product_map=products,
        money_round=rupees,
    )
    shipping_amount = sum((money(row['shipping_charge']) for row in shipping['shipping_breakdown']), Decimal(0))
    payable = subtotal - discount + packaging + shipping_amount
    amount_paise = paise(payable, payable=True)
    return {
        'items': items, 'subtotal_before_discount': float(subtotal),
        'coupon_code': validation.get('code'), 'coupon_id': validation.get('coupon_id'),
        'coupon_snapshot': validation.get('coupon_snapshot'), 'coupon_usage_recorded': False,
        'coupon_discount_amount': float(discount),
        'eligible_subtotal': float(eligible) if eligible is not None else None,
        'gift_packaging': bool(payload.gift_packaging or orders._has_item_gift_packaging(items)),
        'gift_packaging_amount': float(packaging),
        'total_after_discount': float(subtotal - discount + packaging),
        'total_price': float(payable), 'amount_paise': amount_paise, 'currency': 'INR',
        'shipping_charge': float(shipping_amount),
        'shipping_free_reason': shipping['shipping_free_reason'],
        'shipping_rate_source': shipping['shipping_rate_source'],
        'shipping_breakdown': shipping['shipping_breakdown'],
        'amount_breakdown_paise': {
            'products': paise(subtotal), 'discount': paise(discount),
            'packaging': paise(packaging), 'shipping': paise(shipping_amount),
        },
    }, products


def response_for(attempt, order):
    if (
        attempt['state'] != 'ready' or not order or not order.get('stock_reserved')
        or order.get('payment_status') != 'pending'
        or order.get('status') != 'pending_payment'
        or datetime.fromisoformat(order['stock_reserved_until']) <= now()
        or attempt['key_id'] != config.RAZORPAY_KEY_ID
        or order.get('razorpay_order_id') != attempt.get('razorpay_order_id')
    ):
        raise HTTPException(409, 'Checkout requires reconciliation; do not create another payment')
    return {
        'order_id': order['id'], 'payment_attempt_id': attempt['_id'],
        'razorpay_order_id': attempt['razorpay_order_id'], 'key_id': attempt['key_id'],
        'amount': attempt['amount_paise'], 'currency': 'INR',
        'stock_reserved_until': order['stock_reserved_until'], 'payment_status': 'pending',
    }


async def set_attempt(attempt_id, **fields):
    result = await db.payment_attempts.update_one(
        {'_id': attempt_id}, {'$set': {**fields, 'updated_at': now().isoformat()}})
    if result.matched_count != 1:
        raise RuntimeError('Payment attempt disappeared')


async def create_checkout_order(payload, user):
    require_order_creation_enabled()  # Must precede DB, pricing, shipping and stock work.
    if not user.get('id'):
        raise HTTPException(401, 'Authentication required')
    await inventory.require_transactions()
    if await db.orders.find_one({'user_id': user['id'], 'payment_provider': 'razorpay',
                                'payment_environment': config.RAZORPAY_ENV, 'status': 'paid_stock_issue'}):
        raise HTTPException(409, 'A received payment needs review before starting another checkout')
    request_body = payload.model_dump(mode='json')
    fingerprint = hashlib.sha256(json.dumps(request_body, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    identity = json.dumps([config.RAZORPAY_ENV, user['id'], str(payload.request_id)], separators=(',', ':'))
    attempt_id = hashlib.sha256(identity.encode()).hexdigest()
    order_id = str(uuid.uuid5(uuid.NAMESPACE_URL, 'mariso:razorpay:' + attempt_id))
    receipt = 'mr_' + uuid.UUID(order_id).hex
    attempt = {
        '_id': attempt_id, 'order_id': order_id, 'user_id': user['id'],
        'payment_provider': PAYMENT_PROVIDER_RAZORPAY, 'environment': config.RAZORPAY_ENV,
        'key_id': config.RAZORPAY_KEY_ID, 'request_fingerprint': fingerprint,
        'receipt': receipt, 'state': 'preparing', 'active': True,
        'created_at': now().isoformat(), 'updated_at': now().isoformat(),
    }
    try:
        # Built-in _id uniqueness handles same-key repeats. The active-user index
        # prevents a different request key from bypassing an unresolved attempt.
        await db.payment_attempts.insert_one(attempt)
    except DuplicateKeyError:
        existing = await db.payment_attempts.find_one({'_id': attempt_id})
        if not existing:
            raise HTTPException(409, 'An active checkout already exists; reconcile it first') from None
        if existing['request_fingerprint'] != fingerprint:
            raise HTTPException(409, 'Request ID was already used for a different checkout') from None
        order = await db.orders.find_one({'id': existing['order_id'], 'user_id': user['id']})
        return response_for(existing, order)
    except PyMongoError:
        raise HTTPException(503, 'Checkout claim unavailable; retry only with the same request ID') from None

    stage = 'pricing'
    try:
        quote, products = await build_quote(payload, user)
        created = now()
        order = {
            **{key: value for key, value in request_body.items() if key.startswith('billing_')},
            **quote, 'id': order_id, 'user_id': user['id'],
            'tracking_token': await orders._generate_tracking_token(),
            'payment_provider': PAYMENT_PROVIDER_RAZORPAY, 'payment_method': PAYMENT_PROVIDER_RAZORPAY,
            'payment_environment': config.RAZORPAY_ENV, 'payment_attempt_id': attempt_id,
            'payment_status': 'pending', 'status': 'pending_payment',
            'stock_reserved': False, 'stock_deducted': False, 'paid_at': None,
            'stock_reserved_until': (created + timedelta(minutes=config.STOCK_RESERVATION_MINUTES)).isoformat(),
            'created_at': created.isoformat(), 'updated_at': created.isoformat(),
            'cancellation_status': 'none', 'refund_status': 'none',
            'payment_events': [], 'stock_reservation_transition': 'reserving',
            'inventory_version': 1,
        }
        # Snapshot precedes stock writes so interrupted work is discoverable.
        stage = 'local_order'
        await db.orders.insert_one(order)
        stage = 'reservation'
        await set_attempt(attempt_id, state='reserving', amount_paise=quote['amount_paise'], currency='INR')
        await inventory.reserve(order_id)
        reserved_at = now().isoformat()
        order.update(stock_reserved=True, stock_reserved_at=reserved_at)
        order.pop('stock_reservation_transition')
        # Never blindly replay a POST once this durable state has been entered.
        stage = 'provider_creation'
        if datetime.fromisoformat(order['stock_reserved_until']) <= now():
            raise RuntimeError('Reservation expired before provider creation')
        await set_attempt(attempt_id, state='creating')
        provider = await create_razorpay_order(amount_paise=quote['amount_paise'], receipt=receipt,
                                             internal_order_id=order_id)
        stage = 'attachment'
        await set_attempt(attempt_id, state='attaching', razorpay_order_id=provider['id'])
        result = await db.orders.update_one({'id': order_id}, {'$set': {
            'razorpay_order_id': provider['id'], 'razorpay_order_status': provider['status'],
            'updated_at': now().isoformat(),
        }})
        if result.matched_count != 1:
            raise RuntimeError('Local order disappeared')
        await set_attempt(attempt_id, state='ready')
        attempt.update(state='ready', razorpay_order_id=provider['id'], amount_paise=quote['amount_paise'])
        order['razorpay_order_id'] = provider['id']
        stage = 'response'
        return response_for(attempt, order)
    except Exception as exc:
        # No payment creation retry, stock release or active-lock deletion after an
        # ambiguous result. Phase 3 will reconcile these persisted states.
        safe_pricing_rejection = stage == 'pricing' and isinstance(exc, HTTPException)
        state = 'rejected' if safe_pricing_rejection else (
            'creation_unknown' if stage == 'provider_creation' else 'reconciliation_required')
        try:
            await set_attempt(attempt_id, state=state, failure_stage=stage,
                              active=not safe_pricing_rejection)
        except Exception:
            logger.error('Could not record checkout failure: attempt_id=%s stage=%s', attempt_id, stage)
        if safe_pricing_rejection:
            raise
        logger.warning('Checkout needs reconciliation: attempt_id=%s stage=%s', attempt_id, stage)
        raise HTTPException(503, {'message': 'Checkout requires reconciliation; retry only with the same request ID',
                                  'order_id': order_id, 'payment_attempt_id': attempt_id}) from None
