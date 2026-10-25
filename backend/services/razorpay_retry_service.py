"""Resume valid holds or prepare a fresh cart after an expired checkout is reconciled."""
from types import SimpleNamespace
from fastapi import HTTPException
from core import config
from core.database import db
from services import razorpay_inventory_service as inventory
from services.razorpay_service import require_order_creation_enabled
from services.razorpay_order_service import response_for
from services.razorpay_recovery_service import provider_get, check_order
from services.razorpay_verification_service import identifier


async def retry_checkout(order_id, user, *, buy_again=False):
    require_order_creation_enabled()
    if not user.get('id'):
        raise HTTPException(401, 'Authentication required')
    order = await db.orders.find_one({**inventory.scope(order_id), 'user_id': user['id']})
    if not order:
        raise HTTPException(404, 'Order not found')
    attempt = await db.payment_attempts.find_one({'_id': order.get('payment_attempt_id'),
        'order_id': order_id, 'user_id': user['id'], 'payment_provider': 'razorpay',
        'environment': config.RAZORPAY_ENV, 'key_id': config.RAZORPAY_KEY_ID})
    provider_id = order.get('razorpay_order_id')
    if not attempt or not identifier(provider_id, 'order') or attempt.get('razorpay_order_id') != provider_id:
        raise HTTPException(409, 'This order needs review before another payment')
    if buy_again != inventory.expired(order):
        raise HTTPException(409, 'Reservation expired. Use Buy again.' if not buy_again else 'Reservation is still valid. Use Resume payment.')
    if not attempt.get('active') and not (buy_again and attempt.get('retired_for_repurchase')):
        raise HTTPException(409, 'This checkout is no longer available')
    provider = await provider_get('orders/' + provider_id)
    check_order(provider, attempt, order)
    if (provider.get('id') != provider_id or provider.get('status') not in {'created', 'attempted'}
            or provider.get('amount_paid') != 0
            or ('partial_payment' in provider and provider['partial_payment'] is not False)):
        raise HTTPException(409, 'Payment may already be underway. Check the order status')
    # Fail closed on truncated/ambiguous payment history and any unresolved attempt.
    payments = await provider_get('orders/' + provider_id + '/payments')
    items = payments.get('items')
    if (not isinstance(items, list) or type(provider.get('attempts')) is not int
            or len(items) != provider['attempts'] or payments.get('count') != len(items)):
        raise HTTPException(409, 'Payment history needs reconciliation')
    if any(not isinstance(p, dict) or not identifier(p.get('id'), 'pay')
           or p.get('order_id') != provider_id or p.get('status') != 'failed'
           or type(p.get('amount')) is not int or p['amount'] != order['amount_paise']
           or p.get('currency') != 'INR' for p in items):
        raise HTTPException(409, 'A payment is still being checked. Please check again later')
    await inventory.require_transactions()

    cart_items = None
    if buy_again:
        await inventory.expire_reservation(order_id)
        cart_items = await rebuild_cart(order)

    async def resume(session):
        current = await db.orders.find_one({**inventory.scope(order_id), 'user_id': user['id']}, session=session)
        claim = await db.payment_attempts.find_one({'_id': attempt['_id']}, session=session)
        if (not current or not claim
                or (not claim.get('active') and not (buy_again and claim.get('retired_for_repurchase')))
                or claim.get('key_id') != config.RAZORPAY_KEY_ID
                or claim.get('razorpay_order_id') != provider_id
                or current.get('razorpay_order_id') != provider_id
                or current.get('amount_paise') != order.get('amount_paise')
                or claim.get('amount_paise') != order.get('amount_paise')
                or current.get('currency') != 'INR'
                or current.get('inventory_version') != 1 or current.get('stock_deducted')
                or current.get('stock_reservation_transition')
                or (current.get('payment_status'), current.get('status')) not in {
                    ('pending', 'pending_payment'), ('expired', 'payment_expired')}):
            raise HTTPException(409, 'Order changed. Check its payment status before retrying')
        if buy_again:
            if not inventory.expired(current) or current.get('stock_reserved'):
                raise HTTPException(409, 'Reservation is still being released. Please check again')
            await db.payment_attempts.update_one({'_id': claim['_id']}, {'$set': {
                'state': 'retired', 'active': False, 'retired_for_repurchase': True,
                'monitor_late_payment': True}}, session=session)
            return {'order_id': order_id, 'items': cart_items}
        if inventory.expired(current):
            raise HTTPException(409, 'Reservation expired. Use Buy again.')
        if not current.get('stock_reserved'):
            raise HTTPException(409, 'Stock reservation needs review')
        await db.payment_attempts.update_one({'_id': claim['_id']}, {'$set': {'state': 'ready'}}, session=session)
        claim['state'] = 'ready'
        return response_for(claim, current)
    return await inventory.transaction(resume)


async def rebuild_cart(order):
    """Recheck catalog/variants/packs/stock; never reuse old price or coupon."""
    from models.order import CartItem
    from services.order_service import _build_order_items
    from services.payment_money import rupees
    selections = [CartItem(**{k: item.get(k) for k in
        ('product_id', 'quantity', 'variant_id', 'color_id', 'flavor_id', 'selected_pack_id')})
        for item in order['items']]
    details, products = await _build_order_items(SimpleNamespace(items=selections, gift_packaging=False), money_round=rupees)
    cart = []
    for item in details:
        product = products[item['product_id']]
        variant = next((v for v in product.get('variants', []) if v.get('id') == item.get('variant_id')), None)
        available = (variant or product).get('stock', 0)
        cart.append({
            'id': item['product_id'], 'name': item['product_name'], 'images': [item['product_image']],
            'price': item['price'], 'original_price': item['price'], 'quantity': item['quantity'],
            'category_id': product.get('category_id'), 'availableQuantity': available,
            'variantStock': available, 'stock': available,
            'variantId': item.get('variant_id'), 'selectedColorId': item.get('color_id'),
            'selectedFlavorId': item.get('flavor_id'), 'selectedPackId': item.get('selected_pack_id'),
            'selectedColor': item.get('color_name'), 'selectedFlavor': item.get('flavor_name'),
            'selectedPackLabel': item.get('selected_pack_label'),
            **{k: item.get(k) for k in ('sell_as_pack', 'pack_size', 'pack_label', 'pack_multiplier',
                'base_pieces_per_unit', 'pieces_per_pack')},
            **{k: product.get(k) for k in ('show_gift_packaging', 'gift_packaging_options', 'gift_packaging_price',
                'show_free_shipping')},
        })
    return cart
