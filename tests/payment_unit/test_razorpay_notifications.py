import asyncio
from types import SimpleNamespace
from copy import deepcopy

import pytest

from core import config
from services import razorpay_notification_service as notices


def run(coro): return asyncio.run(coro)


class Jobs:
    def __init__(self, channel='customer_email'):
        self.row = {'_id': 'order:email', 'order_id': 'order', 'channel': channel,
                    'state': 'pending', 'attempts': 0}
        self.updates = []

    async def update_many(self, query, update): pass

    async def update_one(self, query, update):
        self.updates.append((query, update))
        self.row.update(deepcopy(update['$set']))
        return SimpleNamespace(matched_count=1)

    async def find_one_and_update(self, query, update, **kwargs):
        if self.row['state'] != 'pending' or self.row['channel'] not in query['channel']['$in']:
            return None
        # The fake models a future retry deadline by allowing one claim per run.
        if self.row.get('next_attempt_at'): return None
        self.row.update(update['$set']); self.row['attempts'] += 1
        return deepcopy(self.row)


@pytest.fixture
def setup(monkeypatch):
    for name, value in {'RAZORPAY_NOTIFICATIONS_ENABLED': True, 'RAZORPAY_EMAIL_ENABLED': True,
                        'TWILIO_WHATSAPP_ENABLED': False, 'RAZORPAY_ADMIN_EMAIL': 'admin@example.com',
                        'RESEND_API_KEY': 'dummy', 'RESEND_FROM_EMAIL': 'test@example.com'}.items():
        monkeypatch.setattr(config, name, value)
    jobs = Jobs()
    async def find(_):
        return {'id': 'order', 'billing_email': 'customer@example.com', 'amount_paise': 100, 'status': 'confirmed', 'payment_status': 'paid'}
    monkeypatch.setattr(notices, 'db', SimpleNamespace(razorpay_notification_outbox=jobs,
                                                       orders=SimpleNamespace(find_one=find)))
    return jobs


def test_delivery_marked_sent_only_after_success(setup, monkeypatch):
    async def send(job, order):
        assert setup.row['state'] == 'sending'
        return 'message1'
    monkeypatch.setattr(notices, 'send_email', send)
    run(notices.run_once())
    assert setup.row['state'] == 'sent'
    assert setup.row['provider_message_id'] == 'message1'


def test_failed_email_retains_retry(setup, monkeypatch):
    async def fail(*args): raise RuntimeError('simulated delivery failure')
    monkeypatch.setattr(notices, 'send_email', fail)
    run(notices.run_once())
    assert setup.row['state'] == 'pending'
    assert setup.row['next_attempt_at']
    assert setup.row['attempts'] == 1


def test_disabled_email_is_not_claimed(setup, monkeypatch):
    monkeypatch.setattr(config, 'RAZORPAY_EMAIL_ENABLED', False)
    run(notices.run_once())
    assert setup.row['state'] == 'pending'
    assert setup.row['attempts'] == 0


def test_expired_idempotency_window_requires_review(setup, monkeypatch):
    setup.row['first_attempt_at'] = '2000-01-01T00:00:00+00:00'
    run(notices.run_once())
    assert setup.row['state'] == 'delivery_unknown'


def test_outbox_adapter_uses_frozen_payload_and_idempotency_key(setup, monkeypatch):
    calls = []
    class Session:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, **kwargs):
            assert self.trust_env is False
            assert url == 'https://api.resend.com/emails'
            assert kwargs['allow_redirects'] is False
            assert kwargs['timeout'] == (5, 15)
            calls.append(kwargs)
            return SimpleNamespace(status_code=200, json=lambda: {'id': 'msg1'})
    monkeypatch.setattr(notices.requests, 'Session', Session)
    job = {**setup.row, 'lease_token': 'lease'}
    order = {'id': 'order', 'billing_email': 'customer@example.com', 'amount_paise': 100, 'status': 'confirmed', 'payment_status': 'paid'}
    run(notices.send_email(job, order))
    job['payload'] = setup.row['payload']
    order['amount_paise'] = 500
    run(notices.send_email(job, order))
    assert calls[0]['json'] == calls[1]['json']
    assert calls[0]['headers']['Idempotency-Key'] == calls[1]['headers']['Idempotency-Key']


def test_notification_gate_prevents_any_db_access(monkeypatch):
    monkeypatch.setattr(config, 'RAZORPAY_NOTIFICATIONS_ENABLED', False)
    monkeypatch.setattr(notices, 'db', None)
    run(notices.run_once())

@pytest.mark.parametrize('event,phrase', [('cancelled','cancellation request has been successfully processed'), ('refund_completed','full refund has been processed')])
def test_event_specific_email_payload(setup, monkeypatch, event, phrase):
    class Session:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, **kwargs):
            assert phrase in kwargs['json']['html']
            assert 'is confirmed' not in kwargs['json']['html']
            return SimpleNamespace(status_code=200, json=lambda: {'id':'msg'})
    monkeypatch.setattr(notices.requests, 'Session', Session)
    run(notices.send_email({**setup.row, 'event':event, 'lease_token':'lease'},
        {'id':'order','billing_email':'customer@example.com','amount_paise':69822}))

def test_missing_template_waits_without_attempting_delivery(setup, monkeypatch):
    setup.row.update(channel='whatsapp',event='cancelled')
    monkeypatch.setattr(config, 'TWILIO_WHATSAPP_ENABLED', True)
    for key in ('TWILIO_ACCOUNT_SID','TWILIO_AUTH_TOKEN','TWILIO_WHATSAPP_NUMBER'):
        monkeypatch.setenv(key,'dummy')
    async def find(_): return {'id':'order','status':'cancelled','payment_status':'paid','refund_status':'pending'}
    monkeypatch.setattr(notices.db.orders, 'find_one', find)
    run(notices.run_once())
    assert setup.row['state'] == 'pending'
    assert setup.row['last_error'] == 'missing_whatsapp_template'
    assert not setup.row.get('first_attempt_at')

def test_stale_confirmation_is_not_sent_after_cancellation(setup, monkeypatch):
    async def find(_): return {'id':'order','status':'cancelled','payment_status':'paid'}
    monkeypatch.setattr(notices.db.orders, 'find_one', find)
    run(notices.run_once())
    assert setup.row['state'] == 'superseded'

def test_refund_notification_uses_cancelled_order(setup, monkeypatch):
    setup.row['event'] = 'refund_completed'
    async def find(query):
        assert query['payment_environment'] == config.RAZORPAY_ENV
        return {'id':'order','status':'cancelled','payment_status':'paid','refund_status':'success','billing_email':'customer@example.com'}
    async def send(*args): return 'message_refund'
    monkeypatch.setattr(notices.db.orders, 'find_one', find)
    monkeypatch.setattr(notices, 'send_email', send)
    run(notices.run_once())
    assert setup.row['state'] == 'sent'

def test_whatsapp_uncertain_result_is_not_retried(setup, monkeypatch):
    setup.row['channel'] = 'whatsapp'
    monkeypatch.setattr(config, 'TWILIO_WHATSAPP_ENABLED', True)
    monkeypatch.setattr(notices, 'configuration_error', lambda *args: None)
    async def uncertain(*args): return {'success':False}
    monkeypatch.setattr(notices, 'send_whatsapp', uncertain)
    run(notices.run_once())
    assert setup.row['state'] == 'delivery_unknown'


def test_confirmation_reuses_mariso_customer_and_admin_templates(setup, monkeypatch):
    calls = []
    class Session:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        def post(self, url, **kwargs):
            calls.append(kwargs['json'])
            return SimpleNamespace(status_code=200, json=lambda: {'id':'msg'})
    monkeypatch.setattr(notices.requests, 'Session', Session)
    order = {'id':'ca454554-test', 'billing_name':'A <Customer>', 'billing_email':'customer@example.com',
        'amount_paise':96942, 'total_price':969.42, 'tracking_token':'testtoken',
        'items':[{'product_name':'Coaster set', 'quantity':1, 'price':899}]}
    for channel in ('customer_email','admin_email'):
        setup.row.pop('payload', None)
        run(notices.send_email({**setup.row, 'channel':channel, 'lease_token':'lease'}, order))
    customer, admin = calls
    assert 'Thank you for shopping with' in customer['html']
    assert 'Dear A &lt;Customer&gt;' in customer['html']
    assert 'Coaster set' in customer['html']
    assert '/track-order/testtoken' in customer['html']
    assert 'Team Mariso' in customer['html']
    assert customer['subject'] == 'Your Mariso order CA454554 is confirmed'
    assert 'Shipping Address' in admin['html']
    assert 'Open admin dashboard' in admin['html']
