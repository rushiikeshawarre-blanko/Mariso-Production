import { webcrypto } from 'crypto';
import { TextEncoder } from 'util';
import { startRazorpayCheckout, openCheckout, getPending, pendingKey, razorpayEnabled, loadRazorpay } from './razorpay';

const session = { order_id: 'local', razorpay_order_id: 'order_Test', key_id: 'rzp_test_dummy',
  amount: 12345, currency: 'INR', stock_reserved_until: '2099-01-01T00:00:00Z' };
const payload = { items: [{ product_id: 'p', quantity: 1 }], billing_email: 'test@example.com' };
let mode;
let options;
class SDK {
  constructor(value) { options = value; }
  on(name, callback) { this.failed = callback; }
  close() { options.modal.ondismiss(); }
  open() {
    if (mode === 'dismiss') options.modal.ondismiss();
    else if (mode === 'fail') this.failed();
    else options.handler({ razorpay_order_id: 'order_Test', razorpay_payment_id: 'pay_Test',
      razorpay_signature: 'signature-not-to-be-stored' });
  }
}
beforeEach(() => {
  Object.defineProperty(window, 'crypto', { configurable: true, value: webcrypto });
  global.TextEncoder = TextEncoder;
  sessionStorage.clear();
  window.Razorpay = SDK;
  mode = 'success';
});

const args = () => ({ owner: 'user', payload, cart: ['cart'],
  createOrder: jest.fn().mockResolvedValue(session), verifyPayment: jest.fn().mockResolvedValue({}) });

test('feature defaults disabled', () => {
  delete process.env.REACT_APP_RAZORPAY_ENABLED;
  expect(razorpayEnabled()).toBe(false);
});

test('SDK uses server values; callback is verified without storing the signature', async () => {
  const input = args();
  expect(await startRazorpayCheckout(input)).toBe('local');
  expect(options.amount).toBe(12345);
  expect(options.order_id).toBe('order_Test');
  expect(options.retry.enabled).toBe(false);
  expect(input.verifyPayment).toHaveBeenCalledWith({ order_id: 'local', razorpay_order_id: 'order_Test',
    razorpay_payment_id: 'pay_Test', razorpay_signature: 'signature-not-to-be-stored' });
  expect(sessionStorage.getItem(pendingKey('user'))).not.toContain('signature-not-to-be-stored');
});

test.each(['dismiss', 'fail'])('%s preserves pending order and does not verify success', async (value) => {
  mode = value;
  const input = args();
  expect(await startRazorpayCheckout(input)).toBe('local');
  expect(input.verifyPayment).not.toHaveBeenCalled();
  expect(getPending('user').orderId).toBe('local');
});

test('verification timeout leads to status recovery, not a new order', async () => {
  const input = args(); input.verifyPayment.mockRejectedValue(new Error('timeout'));
  await startRazorpayCheckout(input);
  await startRazorpayCheckout(input);
  expect(input.createOrder).toHaveBeenCalledTimes(1);
});

test('uncertain creation reuses the identical request ID', async () => {
  const input = args();
  input.createOrder.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(session);
  await expect(startRazorpayCheckout(input)).rejects.toThrow('timeout');
  await startRazorpayCheckout(input);
  expect(input.createOrder.mock.calls[0][0].request_id).toBe(input.createOrder.mock.calls[1][0].request_id);
});

test('changed payload does not bypass an uncertain checkout', async () => {
  const input = args(); input.createOrder.mockRejectedValueOnce(new Error('timeout'));
  await expect(startRazorpayCheckout(input)).rejects.toThrow();
  await expect(startRazorpayCheckout({ ...input, payload: { ...payload, coupon_code: 'NEW' } }))
    .rejects.toThrow('earlier checkout');
  expect(input.createOrder).toHaveBeenCalledTimes(1);
});

test('server reconciliation reference is retained', async () => {
  const input = args(); input.createOrder.mockRejectedValue({ response: { status: 503,
    data: { detail: { order_id: 'uncertain' } } } });
  expect(await startRazorpayCheckout(input)).toBe('uncertain');
  expect(getPending('user').orderId).toBe('uncertain');
});

test.each([{ key_id: 'rzp_live_' }, { key_id: 'invalid' }, { amount: 1.5 }, { currency: 'USD' },
  { stock_reserved_until: '2000-01-01' }])('invalid checkout data cannot open payment', async (change) => {
  await expect(openCheckout(SDK, { ...session, ...change }, {})).rejects.toThrow('validated');
});

test('SDK load timeout clears the failed loader for retry', async () => {
  delete window.Razorpay;
  jest.useFakeTimers();
  const first = loadRazorpay();
  const assertion = expect(first).rejects.toThrow('could not load');
  jest.advanceTimersByTime(15001);
  await assertion;
  const second = loadRazorpay();
  const retryAssertion = expect(second).rejects.toThrow('could not load');
  expect(second).not.toBe(first);
  jest.advanceTimersByTime(15001);
  await retryAssertion;
  jest.useRealTimers();
});

 test.each(['rzp_test_dummy', 'rzp_live_dummy'])('server-issued %s opens checkout', async (key_id) => {
  await expect(openCheckout(SDK, { ...session, key_id }, {})).resolves.toMatchObject({ type: 'submitted' });
  expect(options.key).toBe(key_id);
});
