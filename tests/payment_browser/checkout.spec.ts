// Browser-level checkout contract tests: real module, mocked gateway and API.
// These do not substitute for deployed full-store end-to-end acceptance.
import { test, expect } from './fixtures';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(path.resolve(__dirname, '../../frontend/src/lib/razorpay.js'), 'utf8');
for (const scenario of ['success-test', 'success-live', 'dismiss', 'failed', 'verify-timeout', 'invalid-key', 'expired']) {
  test(scenario, async ({ page, baseURL }) => {
    await page.route(baseURL! + '/', route => route.fulfill({ contentType: 'text/html', body: '<html><body>Checkout test</body></html>' }));
    await page.route(baseURL! + '/checkout-module.js', route => route.fulfill({ contentType: 'text/javascript', body: source }));
    await page.goto('/');
    const result = await page.evaluate(async (scenario) => {
      const module = await import('/checkout-module.js');
      let creates = 0, verifies = 0, opens = 0;
      let sdkOptions: any;
      (window as any).Razorpay = class {
        options: any; failed: any;
        constructor(options: any) { this.options = options; sdkOptions = options; }
        on(name: string, callback: any) { this.failed = callback; }
        close() { this.options.modal.ondismiss(); }
        open() {
          opens++;
          if (scenario === 'dismiss') this.options.modal.ondismiss();
          else if (scenario === 'failed') this.failed();
          else this.options.handler({ razorpay_order_id: 'order_Test', razorpay_payment_id: 'pay_Test', razorpay_signature: 'do-not-store' });
        }
      };
      const session = { order_id: 'local-order', razorpay_order_id: 'order_Test',
        key_id: scenario === 'invalid-key' ? 'rzp_live_' : scenario === 'success-live' ? 'rzp_live_dummy' : 'rzp_test_dummy',
        amount: 69822, currency: 'INR', stock_reserved_until: new Date(Date.now() + (scenario === 'expired' ? -60000 : 60000)).toISOString() };
      const args = { owner: 'test-user', payload: { items: [{ product_id: 'p', quantity: 1 }] }, cart: ['p'],
        createOrder: async () => { creates++; return session; },
        verifyPayment: async () => { verifies++; if (scenario === 'verify-timeout') throw new Error('timeout'); } };
      let error = '';
      try { await module.startRazorpayCheckout(args); } catch (e: any) { error = e.message; }
      const pending = sessionStorage.getItem(module.pendingKey('test-user'));
      if (!error) await module.startRazorpayCheckout(args);
      return { creates, verifies, opens, error, pending, key: sdkOptions?.key, amount: sdkOptions?.amount };
    }, scenario);
    expect(result.creates).toBe(1);
    expect(result.pending).toContain('local-order');
    expect(result.pending).not.toContain('do-not-store');
    if (['invalid-key', 'expired'].includes(scenario)) {
      expect(result.opens).toBe(0);
      expect(result.verifies).toBe(0);
      expect(result.error).toContain('validated');
    } else {
      expect(result.error).toBe('');
      expect(result.opens).toBe(1);
      expect(result.amount).toBe(69822);
      expect(result.verifies).toBe(['dismiss', 'failed'].includes(scenario) ? 0 : 1);
      if (scenario === 'success-live') expect(result.key).toBe('rzp_live_dummy');
    }
  });
}
