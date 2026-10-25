"""Leased notification outbox. Disabled by default; ambiguous delivery needs review."""

import asyncio
from datetime import datetime, timedelta, timezone
from html import escape
import uuid
import os
import logging

logger = logging.getLogger(__name__)

import requests
from pymongo import ReturnDocument

from core import config
from core.database import db


def now(): return datetime.now(timezone.utc)


EVENTS = {
    'confirmed': ('Order confirmed', 'Your order is confirmed.'),
    'cancelled': ('Order cancelled', 'Your cancellation has been approved. Your refund will be processed separately.'),
    'refund_completed': ('Refund completed', 'Your full refund has been processed to your original payment method.'),
}
WHATSAPP_TEMPLATES = {
    'confirmed': 'TWILIO_WHATSAPP_ORDER_CONFIRMED_CONTENT_SID',
    'cancelled': 'TWILIO_WHATSAPP_ORDER_CANCELLED_CONTENT_SID',
    'refund_completed': 'TWILIO_WHATSAPP_REFUND_COMPLETED_CONTENT_SID',
}


async def enqueue(database, order, event, session):
    if event not in EVENTS:
        raise ValueError('Unsupported notification event')
    for channel in ('customer_email', 'admin_email', 'whatsapp'):
        # Preserve the original confirmation key to deduplicate existing orders.
        key = order['id'] + ':' + ('' if event == 'confirmed' else event + ':') + channel
        await database.razorpay_notification_outbox.update_one({'_id': key}, {'$setOnInsert': {
            'order_id': order['id'], 'event': event, 'environment': order['payment_environment'],
            'channel': channel, 'state': 'pending', 'attempts': 0,
            'created_at': now().isoformat(), 'next_attempt_at': now().isoformat(),
        }}, upsert=True, session=session)


def applicable(event, order):
    if not order or order.get('payment_status') != 'paid':
        return False
    if event == 'confirmed':
        return order.get('status') == 'confirmed'
    if event == 'cancelled':
        return order.get('status') == 'cancelled' and order.get('refund_status') != 'success'
    return event == 'refund_completed' and order.get('status') == 'cancelled' and order.get('refund_status') == 'success'


def configuration_error(job, order):
    if job['channel'] == 'whatsapp':
        if not all(os.getenv(k, '').strip() for k in ('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_WHATSAPP_NUMBER')):
            return 'missing_whatsapp_configuration'
        if not os.getenv(WHATSAPP_TEMPLATES[job.get('event', 'confirmed')], '').strip():
            return 'missing_whatsapp_template'
        if not order.get('billing_phone'):
            return 'missing_recipient'
    else:
        if not config.RESEND_API_KEY or not config.RESEND_FROM_EMAIL:
            return 'missing_email_configuration'
        if not (order.get('billing_email') if job['channel'] == 'customer_email' else config.RAZORPAY_ADMIN_EMAIL):
            return 'missing_recipient'
    return None


async def send_whatsapp(job, order):
    if job.get('event', 'confirmed') == 'confirmed':
        from whatsapp_service import send_order_status_whatsapp
        return await asyncio.to_thread(send_order_status_whatsapp, order)
    from whatsapp_service import send_whatsapp_template
    template = os.getenv(WHATSAPP_TEMPLATES[job['event']], '').strip()
    variables = {'1': order.get('billing_name') or 'Customer', '2': order['id'][:8].upper(),
                 '3': f"{order['amount_paise'] / 100:.2f}"}
    return await asyncio.to_thread(send_whatsapp_template, order.get('billing_phone'), template, variables)


async def send_email(job, order):
    recipient = order.get('billing_email') if job['channel'] == 'customer_email' else config.RAZORPAY_ADMIN_EMAIL
    if not recipient or not config.RESEND_API_KEY or not config.RESEND_FROM_EMAIL:
        raise RuntimeError('notification_configuration_missing')
    # The request body is frozen on the job before its first delivery attempt.
    # A stable idempotency key protects retries within the provider's window.
    payload = job.get('payload')
    if not payload:
        from services.order_email_templates import (
            build_order_placed_email, build_admin_new_order_email, build_order_cancellation_email,
        )
        event = job.get('event', 'confirmed')
        if event == 'confirmed':
            builder = build_order_placed_email if job['channel'] == 'customer_email' else build_admin_new_order_email
            subject, html = builder(order)
        elif event == 'cancelled' and job['channel'] == 'customer_email':
            subject, html = build_order_cancellation_email(order)
        else:
            title, message = EVENTS[event]
            if job['channel'] == 'admin_email':
                message = title + ' for customer order ' + order['id'][:8].upper() + '.'
            subject = 'Mariso ' + title.lower() + ': ' + order['id'][:8].upper()
            html = ('<div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1F2937;">'
                    '<p>' + escape(message) + '</p><p>Order: <strong>' + escape(order['id']) +
                    '</strong></p><p>Amount: INR ' + f"{order['amount_paise'] / 100:.2f}" +
                    '</p><p>Warm regards,<br/><strong>Team Mariso</strong></p></div>')
        payload = {'from': config.RESEND_FROM_EMAIL, 'to': [recipient], 'subject': subject, 'html': html}
        await db.razorpay_notification_outbox.update_one(
            {'_id': job['_id'], 'lease_token': job['lease_token']}, {'$set': {'payload': payload}})
    def post():
        with requests.Session() as session:
            session.trust_env = False
            response = session.post('https://api.resend.com/emails', json=payload,
                headers={'Authorization': 'Bearer ' + config.RESEND_API_KEY,
                         'Idempotency-Key': 'mariso-razorpay-' + job['_id']},
                timeout=(5, 15), allow_redirects=False)
            if response.status_code not in (200, 201):
                raise RuntimeError('notification_delivery_failed')
            data = response.json()
            if not isinstance(data, dict) or not data.get('id'):
                raise RuntimeError('notification_delivery_uncertain')
            return data['id']
    return await asyncio.to_thread(post)


async def run_once():
    if not config.RAZORPAY_NOTIFICATIONS_ENABLED:
        return
    # A worker that died mid-send may have delivered; require review.
    # Normal email failures retry within 23h using the same idempotency key.
    await db.razorpay_notification_outbox.update_many(
        {'environment': config.RAZORPAY_ENV, 'state': 'sending', 'lease_until': {'$lt': now().isoformat()}},
        {'$set': {'state': 'delivery_unknown'}})
    channels = []
    if config.RAZORPAY_EMAIL_ENABLED:
        channels.extend(['customer_email', 'admin_email'])
    if config.TWILIO_WHATSAPP_ENABLED:
        channels.append('whatsapp')
    for _ in range(20):
        token = uuid.uuid4().hex
        job = await db.razorpay_notification_outbox.find_one_and_update(
            {'environment': config.RAZORPAY_ENV, 'state': 'pending', 'channel': {'$in': channels}, 'next_attempt_at': {'$lte': now().isoformat()}},
            {'$set': {'state': 'sending', 'lease_token': token,
                      'lease_until': (now()+timedelta(minutes=5)).isoformat()}, '$inc': {'attempts': 1}},
            return_document=ReturnDocument.AFTER)
        if not job:
            break
        state, provider_id = 'sent', None
        try:
            order = await db.orders.find_one({'id': job['order_id'], 'payment_provider': 'razorpay',
                                              'payment_environment': config.RAZORPAY_ENV})
            event = job.get('event', 'confirmed')
            if not applicable(event, order):
                await db.razorpay_notification_outbox.update_one(
                    {'_id': job['_id'], 'lease_token': token},
                    {'$set': {'state': 'superseded', 'last_error': 'order_state_changed'}})
                continue
            problem = configuration_error(job, order)
            if problem:
                await db.razorpay_notification_outbox.update_one(
                    {'_id': job['_id'], 'lease_token': token}, {'$set': {
                        'state': 'pending', 'last_error': problem,
                        'next_attempt_at': (now()+timedelta(minutes=5)).isoformat()}})
                logger.warning('Razorpay notification waiting: channel=%s event=%s reason=%s', job['channel'], event, problem)
                continue
            first = job.get('first_attempt_at')
            if first and now()-datetime.fromisoformat(first) > timedelta(hours=23):
                state = 'delivery_unknown'
            else:
                if not first:
                    await db.razorpay_notification_outbox.update_one(
                        {'_id': job['_id'], 'lease_token': token},
                        {'$set': {'first_attempt_at': now().isoformat()}})
                if job['channel'] == 'whatsapp':
                    if not config.TWILIO_WHATSAPP_ENABLED:
                        raise RuntimeError('whatsapp_disabled')
                    result = await send_whatsapp(job, order)
                    if not result or not result.get('success'):
                        state = 'delivery_unknown'
                    else:
                        provider_id = result.get('sid')
                else:
                    provider_id = await send_email(job, order)
        except Exception:
            state = ('pending' if job['channel'] != 'whatsapp' and job['attempts'] < 8
                     else 'delivery_unknown')
        await db.razorpay_notification_outbox.update_one(
            {'_id': job['_id'], 'lease_token': token, 'state': 'sending'}, {'$set': {
                'state': state, 'provider_message_id': provider_id,
                'last_error': None if state == 'sent' else 'delivery_failed_or_uncertain',
                'next_attempt_at': (now()+timedelta(minutes=5)).isoformat()}})
