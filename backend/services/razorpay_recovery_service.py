"""Repeatable provider reconciliation; never retries an order-creation POST."""

import asyncio
from datetime import datetime, timedelta, timezone
import logging

import requests
from fastapi import HTTPException

from core import config
from core.database import db
from services import razorpay_inventory_service as inventory
from services.razorpay_verification_service import require_processing, identifier, fetch_payment

logger = logging.getLogger(__name__)
_task = None


async def provider_get(path, params=None):
    require_processing()
    def get():
        with requests.Session() as session:
            session.trust_env = False
            session.auth = (config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET)
            return session.get('https://api.razorpay.com/v1/' + path, params=params,
                timeout=(config.RAZORPAY_CONNECT_TIMEOUT_SECONDS, config.RAZORPAY_READ_TIMEOUT_SECONDS),
                allow_redirects=False)
    try:
        response = await asyncio.to_thread(get)
        if response.status_code != 200:
            raise ValueError
        result = response.json()
        if not isinstance(result, dict):
            raise ValueError
        return result
    except (requests.RequestException, ValueError):
        raise HTTPException(503, 'Provider reconciliation unavailable') from None


def check_order(provider, attempt, order):
    if (not identifier(provider.get('id'), 'order')
            or type(provider.get('amount')) is not int
            or provider['amount'] != order.get('amount_paise')
            or provider['amount'] != attempt.get('amount_paise')
            or provider.get('currency') != 'INR'
            or provider.get('receipt') != attempt['receipt']
            or not isinstance(provider.get('notes'), dict)
            or provider['notes'].get('internal_order_id') != order['id']):
        raise HTTPException(409, 'Provider order requires manual review')


async def record_failed_attempt(order_id, payment):
    """Record a verified failed attempt, never declare the entire order failed."""
    if payment.get('status') != 'failed':
        return
    order = await db.orders.find_one(inventory.scope(order_id))
    if (not order or payment.get('order_id') != order.get('razorpay_order_id')
            or not identifier(payment.get('id'), 'pay')
            or type(payment.get('amount')) is not int
            or payment['amount'] != order.get('amount_paise')
            or payment.get('currency') != 'INR'):
        raise HTTPException(409, 'Failed payment requires reconciliation')
    await db.orders.update_one({**inventory.scope(order_id), 'payment_status': 'pending'},
        {'$set': {'has_failed_payment_attempt': True}})


async def reconcile_attempt(attempt):
    require_processing()
    if (attempt.get('environment') != config.RAZORPAY_ENV
            or attempt.get('key_id') != config.RAZORPAY_KEY_ID):
        raise HTTPException(409, 'Payment key requires reconciliation')
    order = await db.orders.find_one(inventory.scope(attempt['order_id']))
    if not order:
        return  # A pre-order claim needs manual review, never a replacement POST.
    provider_id = attempt.get('razorpay_order_id')
    if provider_id:
        if not identifier(provider_id, 'order'):
            raise HTTPException(409, 'Invalid stored provider reference')
        provider = await provider_get('orders/' + provider_id)
    else:
        result = await provider_get('orders', {'receipt': attempt['receipt'], 'count': 100})
        items = result.get('items')
        if not isinstance(items, list) or len(items) != 1:
            # Empty/ambiguous results never prove the POST did not succeed.
            await inventory.expire_reservation(order['id'])
            return
        provider = items[0]
    check_order(provider, attempt, order)
    provider_id = provider['id']
    async def attach(session):
        current = await db.orders.find_one(inventory.scope(order['id']), session=session)
        current_attempt = await db.payment_attempts.find_one({'_id': attempt['_id']}, session=session)
        if not current or not current_attempt:
            raise HTTPException(409, 'Local payment references unavailable')
        if current.get('razorpay_order_id') not in (None, provider_id) or current_attempt.get('razorpay_order_id') not in (None, provider_id):
            raise HTTPException(409, 'Conflicting provider reference')
        await db.orders.update_one(inventory.scope(order['id']), {'$set': {
            'razorpay_order_id': provider_id}}, session=session)
        fields = {'razorpay_order_id': provider_id}
        if (current.get('inventory_version') == 1 and current.get('stock_reserved')
                and current.get('status') == 'pending_payment'
                and not current.get('stock_reservation_transition') and not inventory.expired(current)):
            fields['state'] = 'ready'
        await db.payment_attempts.update_one({'_id': attempt['_id']}, {'$set': fields}, session=session)
    await inventory.transaction(attach)
    payments = await provider_get('orders/' + provider_id + '/payments')
    items = payments.get('items')
    if not isinstance(items, list):
        raise HTTPException(503, 'Invalid provider payment collection')
    for payment in items:
        if not isinstance(payment, dict) or not identifier(payment.get('id'), 'pay'):
            raise HTTPException(503, 'Invalid provider payment reference')
        if payment.get('status') == 'failed':
            await record_failed_attempt(order['id'], await fetch_payment(payment['id']))
        if payment.get('status') == 'captured':
            # Fetch current state rather than trusting a stale collection/webhook.
            current = await fetch_payment(payment['id'])
            if current.get('status') == 'captured':
                await inventory.finalize(order['id'], current)
    await inventory.expire_reservation(order['id'])


async def process_inbox(event):
    if event.get('event', '').startswith('refund.'):
        from services.razorpay_refund_service import sync
        if event.get('key_id') != config.RAZORPAY_KEY_ID or event.get('environment') != config.RAZORPAY_ENV:
            raise HTTPException(409, 'Webhook key requires reconciliation')
        order = await db.orders.find_one({'payment_provider': 'razorpay',
            'payment_environment': config.RAZORPAY_ENV, 'razorpay_payment_id': event['razorpay_payment_id']})
        if not order:
            raise HTTPException(409, 'Refund awaits matching order')
        await sync(order['id'], refund_id=event['razorpay_refund_id'])
        await db.razorpay_webhook_inbox.update_one({'_id': event['_id']}, {'$set': {
            'state': 'processed', 'processed_at': inventory.timestamp()}})
        return
    attempt = await db.payment_attempts.find_one({
        'payment_provider': 'razorpay', 'environment': config.RAZORPAY_ENV,
        'razorpay_order_id': event['razorpay_order_id'], 'key_id': config.RAZORPAY_KEY_ID})
    if not attempt:
        raise HTTPException(409, 'Webhook awaits order attachment')
    if event.get('key_id') != config.RAZORPAY_KEY_ID:
        raise HTTPException(409, 'Webhook key requires reconciliation')
    payment = await fetch_payment(event['razorpay_payment_id'])
    if payment.get('order_id') != event['razorpay_order_id']:
        raise HTTPException(409, 'Webhook payment mismatch')
    if payment.get('status') == 'captured':
        await inventory.finalize(attempt['order_id'], payment)
    await record_failed_attempt(attempt['order_id'], payment)
    # An old failure/authorization event cannot downgrade an already-paid order.
    await db.razorpay_webhook_inbox.update_one({'_id': event['_id']}, {'$set': {
        'state': 'processed', 'processed_at': inventory.timestamp()}})


async def run_once():
    require_processing()
    await inventory.require_transactions()
    now = inventory.timestamp()
    due = {'$or': [{'next_attempt_at': {'$exists': False}}, {'next_attempt_at': {'$lte': now}}]}
    attempts = await db.payment_attempts.find({
        'payment_provider': 'razorpay', 'environment': config.RAZORPAY_ENV,
        'key_id': config.RAZORPAY_KEY_ID,
        '$and': [{'$or': [{'active': True}, {'monitor_late_payment': True}]}, due],
        'updated_at': {'$lt': (datetime.now(timezone.utc)-timedelta(minutes=2)).isoformat()},
    }).sort('next_attempt_at', 1).limit(50).to_list(length=50)
    for attempt in attempts:
        try:
            await reconcile_attempt(attempt)
        except Exception:
            logger.warning('Razorpay reconciliation deferred: attempt_id=%s', attempt['_id'])
        finally:
            await db.payment_attempts.update_one({'_id': attempt['_id']}, {'$set': {
                'next_attempt_at': (datetime.now(timezone.utc)+timedelta(minutes=2)).isoformat()}})
    events = await db.razorpay_webhook_inbox.find({
        'environment': config.RAZORPAY_ENV, 'state': 'pending', **due,
    }).sort('next_attempt_at', 1).limit(50).to_list(length=50)
    for event in events:
        try:
            await process_inbox(event)
        except Exception:
            await db.razorpay_webhook_inbox.update_one({'_id': event['_id']}, {
                '$inc': {'attempts': 1}, '$set': {
                    'next_attempt_at': (datetime.now(timezone.utc)+timedelta(minutes=2)).isoformat()}})
            logger.warning('Razorpay webhook deferred: event_id=%s', event['_id'])

    from services.razorpay_refund_service import sync as sync_refund
    refunds = await db.orders.find({'payment_provider': 'razorpay',
        'payment_environment': config.RAZORPAY_ENV, 'refund_key_id': config.RAZORPAY_KEY_ID,
        'refund_status': {'$in': ['initiated', 'processing', 'reconciliation_required']},
        '$or': [{'refund_next_sync_at': {'$exists': False}}, {'refund_next_sync_at': {'$lte': now}}],
    }).sort('refund_next_sync_at', 1).limit(50).to_list(length=50)
    for order in refunds:
        try:
            await sync_refund(order['id'])
        except Exception:
            logger.warning('Razorpay refund reconciliation deferred: order_id=%s', order['id'])
        finally:
            await db.orders.update_one(inventory.scope(order['id']), {'$set': {
                'refund_next_sync_at': (datetime.now(timezone.utc)+timedelta(minutes=2)).isoformat()}})


async def loop():
    while True:
        try:
            await run_once()
            from services.razorpay_notification_service import run_once as notify
            await notify()
        except Exception:
            logger.warning('Razorpay worker iteration failed; will retry')
        await asyncio.sleep(30)


async def start():
    global _task
    if config.RAZORPAY_WORKER_ENABLED:
        if config.RAZORPAY_ENV == 'live' and not config.RAZORPAY_LIVE_ENABLED:
            logger.info('Razorpay worker inactive: live activation gate is disabled')
            return
        require_processing()
        await inventory.require_transactions()
        if _task is None:
            _task = asyncio.create_task(loop())


async def stop():
    global _task
    if _task:
        _task.cancel()
        try:
            await _task
        except asyncio.CancelledError:
            pass
        _task = None
