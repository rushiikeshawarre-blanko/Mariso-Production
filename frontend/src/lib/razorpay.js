const SDK_URL = 'https://checkout.razorpay.com/v1/checkout.js';
let sdkPromise;

export const razorpayEnabled = () => process.env.REACT_APP_RAZORPAY_ENABLED === 'true';

export const fingerprint = async (value) => {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const pendingKey = (owner) => `mariso_razorpay_pending:${owner}`;
export const getPending = (owner) => {
  try { return JSON.parse(sessionStorage.getItem(pendingKey(owner)) || 'null'); }
  catch { throw new Error('Checkout recovery information is unavailable. Please check your orders.'); }
};

export const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    const timer = window.setTimeout(() => fail(), 15000);
    const fail = () => {
      window.clearTimeout(timer);
      script.remove();
      sdkPromise = null;
      reject(new Error('Secure payment could not load. Please try again.'));
    };
    script.onerror = fail;
    script.onload = () => {
      window.clearTimeout(timer);
      if (window.Razorpay) resolve(window.Razorpay);
      else fail();
    };
    document.head.appendChild(script);
  });
  return sdkPromise;
};

export const openCheckout = (Razorpay, session, prefill) => new Promise((resolve, reject) => {
  if (!session?.order_id || !/^order_[A-Za-z0-9]+$/.test(session.razorpay_order_id || '') ||
      !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(session.key_id || '') || !Number.isSafeInteger(session.amount) ||
      session.amount < 100 || session.currency !== 'INR' ||
      !(Date.parse(session.stock_reserved_until) > Date.now())) {
    reject(new Error('Payment information could not be validated. Please check your orders.'));
    return;
  }
  let completed = false;
  const finish = (result) => { if (!completed) { completed = true; resolve(result); } };
  const checkout = new Razorpay({
    key: session.key_id, order_id: session.razorpay_order_id,
    amount: session.amount, currency: session.currency, name: 'Mariso', prefill,
    retry: { enabled: false },
    handler: (response) => finish({ type: 'submitted', response }),
    modal: { ondismiss: () => finish({ type: 'dismissed' }) },
  });
  checkout.on('payment.failed', () => {
    finish({ type: 'failed' });
    checkout.close();
  });
  checkout.open();
});

export const startRazorpayCheckout = async ({ owner, payload, cart, createOrder, verifyPayment }) => {
  if (!owner) throw new Error('Please sign in again.');
  const hash = await fingerprint(payload);
  let pending = getPending(owner);
  if (pending?.orderId) return pending.orderId;
  if (pending && pending.fingerprint !== hash) {
    throw new Error('An earlier checkout needs review. Please check your orders before starting another payment.');
  }
  const Razorpay = await loadRazorpay(); // No reservation if SDK loading fails.
  if (!pending) {
    pending = { requestId: window.crypto.randomUUID(), fingerprint: hash, cartHash: await fingerprint(cart) };
    sessionStorage.setItem(pendingKey(owner), JSON.stringify(pending));
  }
  let session;
  try { session = await createOrder({ ...payload, request_id: pending.requestId }); }
  catch (error) {
    const orderId = error?.response?.data?.detail?.order_id;
    if (orderId) {
      sessionStorage.setItem(pendingKey(owner), JSON.stringify({ ...pending, orderId }));
      return orderId;
    }
    if (error?.response?.status === 400 || error?.response?.status === 422) {
      sessionStorage.removeItem(pendingKey(owner));
    }
    throw error;
  }
  pending.orderId = session.order_id;
  sessionStorage.setItem(pendingKey(owner), JSON.stringify(pending));
  const result = await openCheckout(Razorpay, session, {
    name: payload.billing_name, email: payload.billing_email, contact: payload.billing_phone,
  });
  if (result.type === 'submitted') {
    const response = result.response;
    try {
      await verifyPayment({ order_id: session.order_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_signature: response.razorpay_signature });
    } catch {
      // A callback or network error is not proof of payment failure. The worker
      // and status page resolve it. Do not persist/log the payment signature.
    }
  }
  return session.order_id;
};
