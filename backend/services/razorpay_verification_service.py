"""Phase 3 evidence checkpoint. No fulfillment or stock side effects here."""

import asyncio
import hashlib
import hmac
import json
import re
from datetime import datetime, timezone

import requests
from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError

from core import config
from core.database import db


def require_processing():
    # Separate from creation: stopping new checkouts must not stop evidence intake.
    if not config.RAZORPAY_ENABLED or not config.RAZORPAY_PROCESSING_ENABLED:
        raise HTTPException(503, 'Razorpay processing is disabled')
    mode = config.RAZORPAY_ENV
    if mode not in {'test', 'live'} or (mode == 'live' and not config.RAZORPAY_LIVE_ENABLED):
        raise HTTPException(503, 'Razorpay live processing is not enabled')
    prefix = f'rzp_{mode}_'
    if (not config.RAZORPAY_KEY_ID.startswith(prefix) or len(config.RAZORPAY_KEY_ID) <= len(prefix)
            or not config.RAZORPAY_KEY_SECRET or not config.RAZORPAY_WEBHOOK_SECRET):
        raise HTTPException(503, 'Razorpay configuration is incomplete')



def valid_signature(message, signature, secret):
    if not secret or not isinstance(signature, str) or not re.fullmatch('[0-9a-f]{64}', signature):
        return False
    expected = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def identifier(value, prefix):
    return isinstance(value, str) and re.fullmatch(prefix + r'_[A-Za-z0-9]{1,100}', value) is not None


async def get_owned_payment_status(order_id, user):
    # Read-only and available when creation/processing is disabled for rollback.
    if not user.get('id'):
        raise HTTPException(401, 'Authentication required')
    order = await db.orders.find_one({'id': order_id, 'user_id': user['id'],
        'payment_provider': 'razorpay', 'payment_environment': config.RAZORPAY_ENV})
    if not order:
        raise HTTPException(404, 'Order not found')
    return {'order_id': order['id'], 'payment_status': order.get('payment_status'),
            'status': order.get('status'),
            'stock_reserved_until': order.get('stock_reserved_until'),
            'has_failed_payment_attempt': order.get('has_failed_payment_attempt') is True
                and order.get('payment_status') != 'paid',
            'fulfillment_ready': order.get('payment_status') == 'paid'
                and order.get('stock_deducted') is True
                and order.get('status') in {'confirmed', 'packed', 'shipped', 'delivered'}}


async def fetch_payment(payment_id):
    require_processing()
    if not identifier(payment_id, 'pay'):
        raise HTTPException(400, 'Invalid payment reference')

    def get():
        with requests.Session() as session:
            session.trust_env = False
            session.auth = (config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET)
            return session.get(
                'https://api.razorpay.com/v1/payments/' + payment_id,
                timeout=(config.RAZORPAY_CONNECT_TIMEOUT_SECONDS, config.RAZORPAY_READ_TIMEOUT_SECONDS),
                allow_redirects=False,
            )
    try:
        response = await asyncio.to_thread(get)
        if response.status_code != 200:
            raise ValueError
        payment = response.json()
        if not isinstance(payment, dict) or payment.get('id') != payment_id:
            raise ValueError
    except (requests.RequestException, ValueError):
        raise HTTPException(503, 'Payment lookup unavailable; retry verification') from None
    return payment


async def verify_checkout(payload, user):
    require_processing()
    if not user.get('id'):
        raise HTTPException(401, 'Authentication required')
    order = await db.orders.find_one({
        'id': payload.order_id, 'user_id': user['id'],
        'payment_provider': 'razorpay', 'payment_environment': config.RAZORPAY_ENV,
    })
    if not order:
        raise HTTPException(404, 'Order not found')
    attempt = await db.payment_attempts.find_one({
        '_id': order.get('payment_attempt_id'), 'order_id': order['id'],
        'user_id': user['id'], 'payment_provider': 'razorpay',
        'environment': config.RAZORPAY_ENV, 'key_id': config.RAZORPAY_KEY_ID,
    })
    stored_id = order.get('razorpay_order_id')
    if (not attempt or not identifier(stored_id, 'order')
            or attempt.get('razorpay_order_id') != stored_id
            or payload.razorpay_order_id != stored_id):
        raise HTTPException(409, 'Payment order requires reconciliation')
    message = (stored_id + '|' + payload.razorpay_payment_id).encode()
    if not valid_signature(message, payload.razorpay_signature, config.RAZORPAY_KEY_SECRET):
        raise HTTPException(401, 'Invalid payment signature')
    payment = await fetch_payment(payload.razorpay_payment_id)
    if (payment.get('order_id') != stored_id
            or type(payment.get('amount')) is not int
            or payment['amount'] != order.get('amount_paise')
            or payment['amount'] != attempt.get('amount_paise')
            or payment.get('currency') != 'INR'
            or order.get('currency') != 'INR'):
        raise HTTPException(409, 'Payment does not match this order')
    captured = payment.get('status') == 'captured' and payment.get('captured') is True
    if not captured:
        return {'order_id': order['id'], 'verification_status': 'capture_not_confirmed',
                'fulfillment_ready': False}
    # Immutable evidence, separate from fulfillment state. Same payment replays are
    # harmless; a later worker must re-fetch provider state before finalization.
    evidence = {
        '_id': 'razorpay:' + config.RAZORPAY_ENV + ':' + payment['id'],
        'order_id': order['id'], 'payment_attempt_id': attempt['_id'],
        'razorpay_order_id': stored_id, 'razorpay_payment_id': payment['id'],
        'amount_paise': payment['amount'], 'currency': 'INR',
        'environment': config.RAZORPAY_ENV, 'key_id': config.RAZORPAY_KEY_ID,
        'state': 'awaiting_finalization', 'created_at': datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.razorpay_payment_evidence.insert_one(evidence)
    except DuplicateKeyError:
        existing = await db.razorpay_payment_evidence.find_one({'_id': evidence['_id']})
        if not existing or any(existing.get(k) != evidence[k] for k in (
                'order_id', 'payment_attempt_id', 'razorpay_order_id', 'amount_paise', 'currency', 'key_id')):
            raise HTTPException(409, 'Payment evidence requires reconciliation') from None
    from services.razorpay_inventory_service import finalize
    finalized = await finalize(order['id'], payment)
    return {'order_id': order['id'], 'verification_status': finalized['status'],
            'payment_status': finalized['payment_status'],
            'fulfillment_ready': finalized['status'] == 'confirmed'}



async def receive_webhook(raw_body, signature, event_id):
    require_processing()
    if len(raw_body) > 262144:
        raise HTTPException(413, 'Webhook too large')
    if not valid_signature(raw_body, signature, config.RAZORPAY_WEBHOOK_SECRET):
        raise HTTPException(401, 'Invalid webhook signature')
    if not isinstance(event_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,128}', event_id):
        raise HTTPException(400, 'Missing or invalid webhook event ID')
    try:
        body = json.loads(raw_body)
        if not isinstance(body, dict) or not isinstance(body.get('event'), str):
            raise ValueError
        event = body['event']
        refund_id = None
        if event in {'refund.created', 'refund.processed', 'refund.failed'}:
            entity = body['payload']['refund']['entity']
            refund_id, payment_id, order_id = entity['id'], entity['payment_id'], None
            if not identifier(refund_id, 'rfnd') or not identifier(payment_id, 'pay'):
                raise ValueError
        elif event in {'payment.authorized', 'payment.captured', 'payment.failed', 'order.paid'}:
            entity = body['payload']['payment']['entity']
            payment_id, order_id = entity['id'], entity['order_id']
            if not identifier(payment_id, 'pay') or not identifier(order_id, 'order'):
                raise ValueError
        else:
            raise HTTPException(422, 'Webhook event is not supported')
    except (ValueError, TypeError, KeyError, UnicodeDecodeError):
        raise HTTPException(400, 'Invalid webhook payload') from None
    digest = hashlib.sha256(raw_body).hexdigest()
    key = 'razorpay:' + config.RAZORPAY_ENV + ':' + event_id
    document = {
        '_id': key, 'event': event, 'body_sha256': digest,
        'environment': config.RAZORPAY_ENV, 'key_id': config.RAZORPAY_KEY_ID,
        'razorpay_payment_id': payment_id, 'razorpay_order_id': order_id,
        'razorpay_refund_id': refund_id,
        'state': 'pending', 'received_at': datetime.now(timezone.utc).isoformat(),
    }
    try:
        await db.razorpay_webhook_inbox.insert_one(document)
    except DuplicateKeyError:
        existing = await db.razorpay_webhook_inbox.find_one({'_id': key})
        if not existing or existing.get('body_sha256') != digest:
            raise HTTPException(409, 'Webhook event ID conflict') from None
    # No PII, signatures, raw bodies or provider errors are persisted/logged.
    # ACK means durable receipt only; pending records still need the next worker.
    return {'received': True}
