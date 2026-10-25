import asyncio
import pytest
from fastapi import HTTPException
from core import config
from routes import payments
from services.razorpay_verification_service import require_processing


def test_cashfree_retired_before_order_creation(monkeypatch):
    async def forbidden(*args, **kwargs):
        pytest.fail('Retired checkout must not create an order')
    monkeypatch.setattr(payments, 'create_pending_cashfree_order', forbidden)
    route = payments.create_cashfree_session_route
    while hasattr(route, '__wrapped__'):
        route = route.__wrapped__
    with pytest.raises(HTTPException) as error:
        asyncio.run(route(None, None, {'id':'test-user'}))
    assert error.value.status_code == 410


@pytest.mark.parametrize('mode,key,enabled,allowed', [
    ('test','rzp_test_dummy',False,True),
    ('live','rzp_live_dummy',False,False),
    ('live','rzp_live_dummy',True,True),
    ('live','rzp_test_dummy',True,False),
    ('test','rzp_live_dummy',True,False),
    ('live','rzp_live_',True,False),
])
def test_explicit_live_gate(monkeypatch, mode, key, enabled, allowed):
    for name,value in dict(RAZORPAY_ENABLED=True, RAZORPAY_PROCESSING_ENABLED=True,
        RAZORPAY_ENV=mode, RAZORPAY_KEY_ID=key, RAZORPAY_KEY_SECRET='dummy',
        RAZORPAY_WEBHOOK_SECRET='dummy', RAZORPAY_LIVE_ENABLED=enabled).items():
        monkeypatch.setattr(config,name,value)
    if allowed:
        require_processing()
    else:
        with pytest.raises(HTTPException): require_processing()


def test_disabled_live_gate_keeps_startup_dormant(monkeypatch):
    from services import razorpay_recovery_service as recovery
    monkeypatch.setattr(config, 'RAZORPAY_WORKER_ENABLED', True)
    monkeypatch.setattr(config, 'RAZORPAY_ENV', 'live')
    monkeypatch.setattr(config, 'RAZORPAY_LIVE_ENABLED', False)
    def forbidden():
        pytest.fail('Dormant live worker must not access payments or database')
    monkeypatch.setattr(recovery, 'require_processing', forbidden)
    monkeypatch.setattr(recovery.inventory, 'require_transactions', forbidden)
    asyncio.run(recovery.start())
