"""Full cancellation refunds: one durable submission, read-only reconciliation thereafter."""
import asyncio
import hashlib
import requests
from fastapi import HTTPException
from core import config
from core.database import db
from services import razorpay_inventory_service as inventory
from services.razorpay_verification_service import require_processing, fetch_payment, identifier
from services.razorpay_recovery_service import provider_get
from services.order_service import _get_effective_quantity


def require_refunds():
    require_processing()  # Includes matching credentials and explicit live activation gate.
    if not config.RAZORPAY_REFUNDS_ENABLED:
        raise HTTPException(503, 'Razorpay refunds are disabled')


def eligible(order):
    if (not order or order.get('payment_provider') != 'razorpay'
            or order.get('payment_environment') != config.RAZORPAY_ENV
            or order.get('payment_status') != 'paid'
            or type(order.get('amount_paise')) is not int or order['amount_paise'] <= 0
            or order.get('currency') != 'INR'
            or not identifier(order.get('razorpay_payment_id'), 'pay')):
        raise HTTPException(409, 'Paid Razorpay order requires review')


async def approve(order_id, decision, admin_id):
    require_refunds()
    await inventory.require_transactions()
    async def apply(session):
        order = await db.orders.find_one(inventory.scope(order_id), session=session)
        eligible(order)
        if order.get('cancellation_status') == 'approved' and order.get('status') == 'cancelled':
            if not order.get('stock_restored_at') and order.get('refund_resolution') != 'expired_hold':
                raise HTTPException(409, 'Cancellation stock needs review')
            return order
        if order.get('status') == 'paid_stock_issue':
            # Only a proven released, never-deducted hold can bypass restocking.
            if (order.get('inventory_version') != 1 or not order.get('stock_released_at')
                    or order.get('stock_reserved') or order.get('stock_deducted')
                    or order.get('stock_restored_at') or order.get('refund_id')):
                raise HTTPException(409, 'Inventory needs manual reconciliation before refund approval')
            now = inventory.timestamp()
            fields = {'status': 'cancelled', 'cancellation_status': 'approved',
                'cancelled_at': now, 'cancelled_by': 'admin', 'updated_by': admin_id,
                'cancellation_admin_note': decision.note, 'refund_resolution': 'expired_hold',
                'refund_status': 'pending', 'refund_reason': 'Payment received after stock hold expired',
                'refund_amount': order['amount_paise'] / 100,
                'refund_amount_paise': order['amount_paise'], 'updated_at': now}
            await db.orders.update_one(inventory.scope(order_id), {'$set': fields}, session=session)
            order.update(fields)
            from services.razorpay_notification_service import enqueue
            await enqueue(db, order, 'cancelled', session)
            order.pop('_id', None)
            return order
        if (order.get('cancellation_status') != 'requested' or order.get('status') != 'confirmed'
                or order.get('inventory_version') != 1 or not order.get('stock_deducted')
                or order.get('stock_reserved') or order.get('stock_restored_at')):
            raise HTTPException(409, 'Order is no longer eligible for cancellation approval')
        for item in order['items']:
            quantity = _get_effective_quantity(item)
            if quantity <= 0:
                raise HTTPException(409, 'Stock quantity requires review')
            query = {'id': item['product_id']}
            field = 'stock'
            if item.get('variant_id'):
                query['variants'] = {'$elemMatch': {'id': item['variant_id']}}
                field = 'variants.$.stock'
            result = await db.products.update_one(query, {'$inc': {field: quantity}}, session=session)
            if result.matched_count != 1:
                raise HTTPException(409, 'Product unavailable for stock restoration')
        now = inventory.timestamp()
        fields = {'cancellation_status': 'approved', 'status': 'cancelled',
            'cancellation_admin_note': decision.note, 'cancelled_at': now, 'cancelled_by': 'admin',
            'stock_restored_at': now, 'refund_status': 'pending',
            'refund_amount': order['amount_paise'] / 100, 'refund_amount_paise': order['amount_paise'],
            'refund_reason': order.get('cancellation_reason'), 'updated_at': now, 'updated_by': admin_id}
        await db.orders.update_one(inventory.scope(order_id), {'$set': fields}, session=session)
        order.update(fields)
        from services.razorpay_notification_service import enqueue
        await enqueue(db, order, 'cancelled', session)
        order.pop('_id', None)
        return order
    return await inventory.transaction(apply)


async def load_order(order_id):
    order = await db.orders.find_one(inventory.scope(order_id))
    eligible(order)
    if order.get('status') != 'cancelled' or order.get('cancellation_status') != 'approved':
        raise HTTPException(409, 'Approve cancellation before refunding')
    attempt = await db.payment_attempts.find_one({'_id': order.get('payment_attempt_id')})
    if (not attempt or attempt.get('key_id') != config.RAZORPAY_KEY_ID
            or attempt.get('environment') != config.RAZORPAY_ENV
            or attempt.get('order_id') != order_id):
        raise HTTPException(409, 'Refund key requires reconciliation')
    return order


async def submit(payment_id, payload):
    # Exactly one POST per durable claim. Receipt is a reconciliation reference,
    # not an assumption that Razorpay makes refund POSTs idempotent.
    def post():
        with requests.Session() as client:
            client.trust_env = False
            client.auth = (config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET)
            return client.post('https://api.razorpay.com/v1/payments/' + payment_id + '/refund',
                json=payload, timeout=(config.RAZORPAY_CONNECT_TIMEOUT_SECONDS, config.RAZORPAY_READ_TIMEOUT_SECONDS),
                allow_redirects=False)
    try:
        response = await asyncio.to_thread(post)
        if response.status_code not in (200, 201):
            raise ValueError
        result = response.json()
        if not isinstance(result, dict): raise ValueError
        return result
    except (requests.RequestException, ValueError):
        raise HTTPException(503, 'Refund submission needs reconciliation; do not submit again') from None


async def apply_refund(order_id, refund):
    async def apply(session):
        order = await db.orders.find_one(inventory.scope(order_id), session=session)
        eligible(order)
        if (order.get('cancellation_status') != 'approved' or not order.get('refund_id')
                or not identifier(refund.get('id'), 'rfnd')
                or refund.get('payment_id') != order.get('razorpay_payment_id')
                or type(refund.get('amount')) is not int or refund['amount'] != order['amount_paise']
                or refund.get('currency') != 'INR' or refund.get('receipt') != order['refund_id']
                or order.get('razorpay_refund_id') not in (None, refund['id'])
                or refund.get('status') not in {'pending', 'processed', 'failed'}):
            raise HTTPException(409, 'Refund does not match approved full amount')
        if order.get('refund_status') == 'success':
            order.pop('_id', None)
            return order  # Stale events cannot downgrade a completed refund.
        state = {'pending': 'processing', 'processed': 'success', 'failed': 'failed'}[refund['status']]
        fields = {'razorpay_refund_id': refund['id'], 'razorpay_refund_status': refund['status'],
            'refund_status': state, 'refund_last_synced_at': inventory.timestamp(),
            'refund_failed_reason': 'Provider refund failed; admin review required' if state == 'failed' else None}
        if state == 'success': fields['refund_completed_at'] = inventory.timestamp()
        await db.orders.update_one(inventory.scope(order_id), {'$set': fields}, session=session)
        order.update(fields)
        if state == 'success':
            if order.get('refund_resolution') == 'expired_hold':
                await db.payment_attempts.update_one({'_id': order['payment_attempt_id'], 'order_id': order_id},
                    {'$set': {'active': False, 'state': 'refunded', 'updated_at': inventory.timestamp()}}, session=session)
            from services.razorpay_notification_service import enqueue
            await enqueue(db, order, 'refund_completed', session)
        order.pop('_id', None)
        return order
    return await inventory.transaction(apply)


async def initiate(order_id, admin_id):
    require_refunds()
    await inventory.require_transactions()
    order = await load_order(order_id)
    if order.get('refund_id'):
        return await sync(order_id, admin_id)
    payment = await fetch_payment(order['razorpay_payment_id'])
    if (payment.get('id') != order['razorpay_payment_id'] or payment.get('order_id') != order['razorpay_order_id']
            or payment.get('status') != 'captured' or payment.get('captured') is not True
            or type(payment.get('amount')) is not int or payment['amount'] != order['amount_paise']
            or payment.get('currency') != 'INR' or payment.get('amount_refunded') != 0):
        raise HTTPException(409, 'Provider payment or previous refunds require review')
    receipt = 'mr_rf_' + hashlib.sha256((config.RAZORPAY_ENV + ':' + order_id).encode()).hexdigest()[:32]
    async def claim(session):
        current = await db.orders.find_one(inventory.scope(order_id), session=session)
        eligible(current)
        if (current.get('refund_id') or current.get('refund_status') != 'pending'
                or current.get('cancellation_status') != 'approved' or current.get('status') != 'cancelled'
                or current.get('razorpay_payment_id') != order['razorpay_payment_id']
                or current.get('amount_paise') != order['amount_paise']):
            raise HTTPException(409, 'Refund already claimed; use Sync refund')
        await db.orders.update_one(inventory.scope(order_id), {'$set': {
            'refund_id': receipt, 'refund_status': 'initiated', 'refund_initiated_at': inventory.timestamp(),
            'refund_key_id': config.RAZORPAY_KEY_ID, 'updated_by': admin_id}}, session=session)
    await inventory.transaction(claim)
    # A crash here remains reconciliation-only, even if the POST never left.
    try:
        refund = await submit(order['razorpay_payment_id'], {'amount': order['amount_paise'],
            'speed': 'normal', 'receipt': receipt, 'notes': {'internal_order_id': order_id}})
        return await apply_refund(order_id, refund)
    except Exception:
        # Preserve a concurrently completed webhook result.
        await db.orders.update_one({**inventory.scope(order_id), 'refund_id': receipt, 'refund_status': 'initiated'},
            {'$set': {'refund_status': 'reconciliation_required'}})
        raise HTTPException(503, 'Refund outcome is being checked. Use Sync refund, not another refund') from None


async def sync(order_id, admin_id=None, refund_id=None):
    require_processing()  # Read reconciliation remains available if new refunds are disabled.
    await inventory.require_transactions()
    order = await load_order(order_id)
    if not order.get('refund_id') or order.get('refund_key_id') != config.RAZORPAY_KEY_ID:
        raise HTTPException(409, 'No matching refund request to reconcile')
    provider_id = refund_id or order.get('razorpay_refund_id')
    if provider_id:
        if not identifier(provider_id, 'rfnd'): raise HTTPException(409, 'Invalid refund reference')
        refund = await provider_get('refunds/' + provider_id)
    else:
        found = await provider_get('payments/' + order['razorpay_payment_id'] + '/refunds', {'count': 100})
        items = found.get('items')
        if not isinstance(items, list) or len(items) >= 100:
            raise HTTPException(409, 'Refund history needs manual review')
        matches = [r for r in items if isinstance(r, dict) and r.get('receipt') == order['refund_id']]
        if len(matches) != 1:
            raise HTTPException(409, 'Refund outcome remains uncertain; manual review required')
        refund = matches[0]
    return await apply_refund(order_id, refund)
