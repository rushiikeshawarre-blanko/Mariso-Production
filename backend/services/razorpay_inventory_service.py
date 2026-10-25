"""Atomic Razorpay inventory transitions. Never fall back to standalone writes."""

from datetime import datetime, timezone

from fastapi import HTTPException
from pymongo.read_concern import ReadConcern
from pymongo.write_concern import WriteConcern

from core import config
from core.database import db, client
from services.order_service import _get_effective_quantity


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def expired(order):
    try:
        deadline = datetime.fromisoformat(order['stock_reserved_until'])
        return deadline.tzinfo is None or deadline <= datetime.now(timezone.utc)
    except (KeyError, ValueError, TypeError):
        return True


async def require_transactions():
    hello = await db.command('hello')
    if not (hello.get('setName') or hello.get('msg') == 'isdbgrid'):
        raise HTTPException(503, 'Razorpay requires MongoDB replica-set transactions')


async def transaction(callback):
    async with await client.start_session() as session:
        return await session.with_transaction(
            callback, read_concern=ReadConcern('snapshot'),
            write_concern=WriteConcern('majority'), max_commit_time_ms=10000,
        )


async def move_stock(order, action, session):
    for item in order['items']:
        quantity = _get_effective_quantity(item)
        if quantity <= 0:
            raise HTTPException(409, 'Invalid inventory quantity')
        reserve = action == 'reserve'
        field = 'stock' if reserve else 'reserved_stock'
        query = {'id': item['product_id']}
        prefix = ''
        if item.get('variant_id'):
            query['variants'] = {'$elemMatch': {'id': item['variant_id'], field: {'$gte': quantity}}}
            prefix = 'variants.$.'
        else:
            query[field] = {'$gte': quantity}
        increments = {prefix + 'reserved_stock': quantity if reserve else -quantity}
        if action != 'confirm':
            increments[prefix + 'stock'] = -quantity if reserve else quantity
        result = await db.products.update_one(query, {'$inc': increments}, session=session)
        if result.modified_count != 1:
            raise HTTPException(409, 'Inventory requires reconciliation')


def scope(order_id):
    return {'id': order_id, 'payment_provider': 'razorpay',
            'payment_environment': config.RAZORPAY_ENV}


async def reserve(order_id):
    async def apply(session):
        order = await db.orders.find_one(scope(order_id), session=session)
        if not order or order.get('inventory_version') != 1:
            raise HTTPException(409, 'Legacy reservation requires manual reconciliation')
        if order.get('stock_reserved'):
            return
        if expired(order) or order.get('status') != 'pending_payment' or order.get('stock_deducted'):
            raise HTTPException(409, 'Reservation is no longer available')
        await move_stock(order, 'reserve', session)
        await db.orders.update_one(scope(order_id), {'$set': {
            'stock_reserved': True, 'stock_reserved_at': timestamp()},
            '$unset': {'stock_reservation_transition': ''}}, session=session)
    await transaction(apply)


async def expire_reservation(order_id):
    async def apply(session):
        order = await db.orders.find_one(scope(order_id), session=session)
        if not order or not expired(order) or order.get('payment_status') == 'paid':
            return
        if order.get('inventory_version') != 1:
            return  # Earlier nontransactional holds cannot be inferred or replayed.
        if order.get('stock_deducted'):
            return
        if order.get('payment_status') == 'expired' and not order.get('stock_reserved'):
            return
        if order.get('stock_reserved'):
            await move_stock(order, 'release', session)
        await db.orders.update_one(scope(order_id), {'$set': {
            'stock_reserved': False, 'stock_released_at': timestamp(),
            'payment_status': 'expired', 'status': 'payment_expired'},
            '$unset': {'stock_reservation_transition': ''}}, session=session)
        # Keep the active claim while provider creation/payment is uncertain.
    await transaction(apply)


async def finalize(order_id, payment):
    """Provider reads happen before entering this retryable, DB-only callback."""
    async def apply(session):
        order = await db.orders.find_one(scope(order_id), session=session)
        if not order:
            raise HTTPException(409, 'Payment order unavailable')
        attempt = await db.payment_attempts.find_one({
            '_id': order['payment_attempt_id'], 'order_id': order_id,
            'payment_provider': 'razorpay', 'environment': config.RAZORPAY_ENV,
            'key_id': config.RAZORPAY_KEY_ID}, session=session)
        if (not attempt or payment.get('order_id') != order.get('razorpay_order_id')
                or payment.get('order_id') != attempt.get('razorpay_order_id')
                or type(payment.get('amount')) is not int
                or payment['amount'] != order.get('amount_paise')
                or payment['amount'] != attempt.get('amount_paise')
                or payment.get('currency') != 'INR' or order.get('currency') != 'INR'
                or payment.get('status') != 'captured' or payment.get('captured') is not True):
            raise HTTPException(409, 'Captured payment does not match stored order')
        if order.get('payment_status') == 'paid':
            if order.get('razorpay_payment_id') != payment['id']:
                raise HTTPException(409, 'Additional payment requires admin review')
            return order
        valid = (order.get('inventory_version') == 1 and order.get('stock_reserved')
                 and not order.get('stock_deducted') and not expired(order)
                 and order.get('status') == 'pending_payment'
                 and not order.get('stock_reservation_transition')
                 and payment.get('amount_refunded', 0) == 0
                 and (not order.get('payment_window_started_at')
                      or (type(payment.get('created_at')) is int
                          and payment['created_at'] >= order['payment_window_started_at'])))
        if valid:
            await move_stock(order, 'confirm', session)
        # Expired/legacy reservations remain in admin review, never auto-fulfilled.
        fields = {'payment_status': 'paid', 'paid_at': timestamp(),
                  'razorpay_payment_id': payment['id'], 'razorpay_payment_status': 'captured',
                  'status': 'confirmed' if valid else 'paid_stock_issue',
                  'updated_at': timestamp()}
        if valid:
            fields.update(stock_reserved=False, stock_deducted=True, stock_deducted_at=timestamp())
        if order.get('coupon_id') and not order.get('coupon_usage_recorded'):
            result = await db.coupons.update_one({'id': order['coupon_id']},
                {'$inc': {'used_count': 1}}, session=session)
            if result.matched_count != 1:
                raise HTTPException(409, 'Coupon accounting requires reconciliation')
            fields.update(coupon_usage_recorded=True, coupon_usage_recorded_at=timestamp())
        await db.orders.update_one(scope(order_id), {'$set': fields}, session=session)
        await db.payment_attempts.update_one({'_id': attempt['_id']}, {'$set': {
            'state': 'paid' if valid else 'paid_stock_issue', 'active': not valid and not attempt.get('retired_for_repurchase', False),
            'monitor_late_payment': False,
            'updated_at': timestamp()}}, session=session)
        if valid:
            from services.razorpay_notification_service import enqueue
            await enqueue(db, order, 'confirmed', session)
        order.update(fields)
        return order
    return await transaction(apply)
