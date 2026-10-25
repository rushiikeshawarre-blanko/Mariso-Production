from types import SimpleNamespace
import pytest
from fastapi import HTTPException
from core import config
from services import razorpay_refund_service as refunds
from services import razorpay_inventory_service as stock
from test_razorpay_transactions import database, run, payment

@pytest.fixture
def ready(database, monkeypatch):
    monkeypatch.setattr(refunds, 'db', database)
    monkeypatch.setattr(refunds, 'require_processing', lambda: None)
    monkeypatch.setattr(config, 'RAZORPAY_REFUNDS_ENABLED', True)
    async def noop(): pass
    monkeypatch.setattr(stock, 'require_transactions', noop)
    async def prepare():
        await stock.reserve('o')
        await stock.finalize('o', payment())
    run(prepare())
    database.orders.rows[0]['cancellation_status'] = 'requested'
    database.orders.rows[0]['total_after_discount'] = 0.25
    return database

def approve(): return run(refunds.approve('o', SimpleNamespace(note='approved'), 'admin'))

def test_approval_restores_once_and_refunds_captured_total(ready):
    result = approve(); approve()
    assert ready.products.rows[0]['stock'] == 5
    assert result['refund_amount_paise'] == 100
    assert result['refund_amount'] == 1
    assert result['status'] == 'cancelled'

def test_missing_product_rolls_back_approval(ready):
    ready.orders.rows[0]['items'].append({'product_id': 'missing', 'quantity': 1})
    with pytest.raises(HTTPException): approve()
    assert ready.products.rows[0]['stock'] == 3
    assert ready.orders.rows[0]['status'] == 'confirmed'

@pytest.mark.parametrize('field,value', [('status','shipped'), ('payment_status','pending'), ('stock_reserved',True)])
def test_ineligible_approval(ready, field, value):
    ready.orders.rows[0][field] = value
    with pytest.raises(HTTPException): approve()
    assert ready.products.rows[0]['stock'] == 3

def test_refund_disabled(ready, monkeypatch):
    monkeypatch.setattr(config, 'RAZORPAY_REFUNDS_ENABLED', False)
    with pytest.raises(HTTPException) as exc: approve()
    assert exc.value.status_code == 503

@pytest.fixture
def provider(ready, monkeypatch):
    approve()
    calls = []
    async def fetch(_): return payment(amount_refunded=0)
    def entity(status='processed'):
        return {'id':'rfnd_Test','payment_id':'pay_Test','amount':100,'currency':'INR',
                'receipt':ready.orders.rows[0]['refund_id'],'status':status}
    async def submit(pid, payload):
        calls.append(payload)
        return entity()
    async def get(*args): return entity()
    monkeypatch.setattr(refunds, 'fetch_payment', fetch)
    monkeypatch.setattr(refunds, 'submit', submit)
    monkeypatch.setattr(refunds, 'provider_get', get)
    return calls, entity

def test_full_refund_repeated_request_never_posts_twice(ready, provider):
    calls, entity = provider
    run(refunds.initiate('o','admin')); run(refunds.initiate('o','admin'))
    assert len(calls) == 1 and calls[0]['amount'] == 100
    assert ready.orders.rows[0]['refund_status'] == 'success'
    run(refunds.apply_refund('o', entity('pending')))
    assert ready.orders.rows[0]['refund_status'] == 'success'
    assert ready.products.rows[0]['stock'] == 5

def test_unknown_submission_never_reposts(ready, provider, monkeypatch):
    calls, entity = provider
    async def timeout(*args):
        calls.append('post'); raise HTTPException(503, 'timeout')
    async def missing(*args): return {'items': []}
    monkeypatch.setattr(refunds, 'submit', timeout)
    monkeypatch.setattr(refunds, 'provider_get', missing)
    with pytest.raises(HTTPException): run(refunds.initiate('o','admin'))
    assert ready.orders.rows[0]['refund_status'] == 'reconciliation_required'
    with pytest.raises(HTTPException): run(refunds.initiate('o','admin'))
    assert len(calls) == 1

@pytest.mark.parametrize('field,value', [('amount',99),('payment_id','pay_Other'),('currency','USD'),('receipt','other')])
def test_mismatched_provider_refund_rejected(ready, provider, field, value):
    run(refunds.initiate('o','admin'))
    bad = provider[1](); bad[field] = value
    with pytest.raises(HTTPException): run(refunds.apply_refund('o', bad))
    assert ready.orders.rows[0]['refund_status'] == 'success'

def test_concurrent_requests_submit_once(ready, provider):
    import asyncio
    async def concurrent():
        return await asyncio.gather(refunds.initiate('o','admin'), refunds.initiate('o','admin'), return_exceptions=True)
    run(concurrent())
    assert len(provider[0]) == 1

@pytest.mark.parametrize('provider_status,expected', [('pending','processing'),('failed','failed')])
def test_provider_outcomes_and_read_sync_with_refunds_disabled(ready, provider, monkeypatch, provider_status, expected):
    async def submit(*args): return provider[1](provider_status)
    monkeypatch.setattr(refunds, 'submit', submit)
    run(refunds.initiate('o','admin'))
    assert ready.orders.rows[0]['refund_status'] == expected
    monkeypatch.setattr(config, 'RAZORPAY_REFUNDS_ENABLED', False)
    run(refunds.sync('o'))
    assert ready.orders.rows[0]['refund_status'] == 'success'

def test_refund_webhook_reconciles_provider_and_acknowledges(ready, provider):
    from services import razorpay_recovery_service as recovery
    run(refunds.initiate('o','admin'))
    event = {'_id':'evt','event':'refund.processed','environment':'test','key_id':'rzp_test_dummy',
        'razorpay_payment_id':'pay_Test','razorpay_refund_id':'rfnd_Test','state':'pending'}
    ready.razorpay_webhook_inbox.rows.append(event.copy())
    run(recovery.process_inbox(event))
    assert ready.razorpay_webhook_inbox.rows[0]['state'] == 'processed'
    assert ready.orders.rows[0]['refund_status'] == 'success'

def test_old_capture_does_not_reconfirm_cancelled_order(ready, provider):
    run(refunds.initiate('o','admin'))
    run(stock.finalize('o', payment()))
    assert ready.orders.rows[0]['status'] == 'cancelled'
    assert ready.products.rows[0]['stock'] == 5

def test_cancellation_and_refund_jobs_are_transactional_and_deduplicated(ready, provider):
    approve()
    run(refunds.initiate('o','admin'))
    run(refunds.sync('o'))
    rows = ready.razorpay_notification_outbox.rows
    for event in ('confirmed','cancelled','refund_completed'):
        jobs = [r for r in rows if r.get('event') == event]
        assert len(jobs) == 3
        assert {r['channel'] for r in jobs} == {'customer_email','admin_email','whatsapp'}
        assert all(r['environment'] == 'test' for r in jobs)


def test_late_capture_approval_never_restocks_released_inventory(ready):
    order = ready.orders.rows[0]
    order.update(status='paid_stock_issue', stock_deducted=False, stock_reserved=False,
                 stock_released_at='2026-10-25T00:00:00+00:00', cancellation_status='none')
    before = ready.products.rows[0]['stock']
    first = approve(); approve()
    assert first['refund_resolution'] == 'expired_hold'
    assert first['refund_status'] == 'pending'
    assert ready.products.rows[0]['stock'] == before
    assert not ready.orders.rows[0].get('stock_restored_at')


@pytest.mark.parametrize('field,value', [('stock_reserved',True),('stock_deducted',True),
                                        ('stock_released_at',None),('inventory_version',0)])
def test_ambiguous_late_capture_cannot_be_cancelled(ready, field, value):
    ready.orders.rows[0].update(status='paid_stock_issue',stock_deducted=False,
                               stock_reserved=False,stock_released_at='released')
    ready.orders.rows[0][field] = value
    with pytest.raises(HTTPException): approve()
    assert ready.orders.rows[0]['status'] == 'paid_stock_issue'


def test_late_capture_refund_clears_checkout_lock(ready, provider):
    ready.orders.rows[0]['refund_resolution'] = 'expired_hold'
    ready.payment_attempts.rows[0].update(active=True,state='paid_stock_issue')
    run(refunds.initiate('o','admin'))
    assert ready.payment_attempts.rows[0]['active'] is False
    assert ready.payment_attempts.rows[0]['state'] == 'refunded'
