"""Razorpay Orders API adapter. No generic retry or idempotency header."""

import asyncio
import logging
import re

import requests
from fastapi import HTTPException

from core import config

logger = logging.getLogger(__name__)


class OrderCreationUncertain(Exception):
    """Creation might have reached the provider; reconcile the stored receipt."""


def require_order_creation_enabled():
    # Creation and processing share the explicit live activation gate.
    if not config.RAZORPAY_ENABLED or not config.RAZORPAY_CREATE_ORDERS_ENABLED:
        raise HTTPException(503, 'Razorpay order creation is disabled')
    if not config.RAZORPAY_PROCESSING_ENABLED or not config.RAZORPAY_WORKER_ENABLED:
        raise HTTPException(503, 'Razorpay creation requires processing and recovery worker')
    if config.STOCK_RESERVATION_MINUTES <= 0:
        raise HTTPException(503, 'Stock reservation duration must be positive')
    from services.razorpay_verification_service import require_processing
    require_processing()



async def create_razorpay_order(*, amount_paise: int, receipt: str, internal_order_id: str) -> dict:
    require_order_creation_enabled()
    if type(amount_paise) is not int or not 100 <= amount_paise <= 100000000000:
        raise HTTPException(400, 'Invalid order amount')
    if not re.fullmatch(r'[A-Za-z0-9_-]{1,40}', receipt):
        raise HTTPException(400, 'Invalid order receipt')
    if not internal_order_id or len(internal_order_id) > 256:
        raise HTTPException(400, 'Invalid internal order reference')
    payload = {
        'amount': amount_paise,
        'currency': 'INR',
        'receipt': receipt,
        'partial_payment': False,
        'notes': {'internal_order_id': internal_order_id},
    }
    try:
        def post():
            with requests.Session() as session:
                session.trust_env = False
                session.auth = (config.RAZORPAY_KEY_ID, config.RAZORPAY_KEY_SECRET)
                return session.post(
                    'https://api.razorpay.com/v1/orders', json=payload,
                    timeout=(config.RAZORPAY_CONNECT_TIMEOUT_SECONDS, config.RAZORPAY_READ_TIMEOUT_SECONDS),
                    allow_redirects=False,
                )
        response = await asyncio.to_thread(post)
    except requests.RequestException:
        logger.warning('Razorpay order creation transport failure: order_id=%s', internal_order_id)
        raise OrderCreationUncertain() from None
    if response.status_code not in (200, 201):
        # Even duplicate-receipt errors require reconciliation, not another POST.
        # Never expose/log provider bodies, headers, auth or customer information.
        logger.warning('Razorpay order creation rejected: order_id=%s http_status=%s',
                       internal_order_id, response.status_code)
        raise OrderCreationUncertain()
    try:
        data = response.json()
        if (
            not isinstance(data, dict)
            or not isinstance(data.get('id'), str)
            or not re.fullmatch(r'order_[A-Za-z0-9]+', data['id'])
            or type(data.get('amount')) is not int
            or data['amount'] != amount_paise
            or data.get('currency') != 'INR'
            or data.get('receipt') != receipt
            or data.get('status') != 'created'
        ):
            raise ValueError
    except (ValueError, TypeError, KeyError):
        raise OrderCreationUncertain() from None
    return {'id': data['id'], 'amount': amount_paise, 'currency': 'INR',
            'receipt': receipt, 'status': 'created'}
