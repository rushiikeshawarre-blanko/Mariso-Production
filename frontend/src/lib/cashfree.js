const CASHFREE_SDK_URL = 'https://sdk.cashfree.com/js/v3/cashfree.js';
const CASHFREE_SCRIPT_ID = 'cashfree-sdk-js';

let cashfreeSdkPromise = null;

const PRODUCTION_HOSTS = new Set(['mariso.store', 'www.mariso.store']);
const PRODUCTION_MODES = new Set(['production', 'prod', 'live']);
const SANDBOX_MODES = new Set(['sandbox', 'test', 'local']);

export const getCashfreeMode = () => {
  const configuredMode = (
    process.env.REACT_APP_CASHFREE_ENV ||
    process.env.REACT_APP_CASHFREE_MODE ||
    ''
  ).trim().toLowerCase();

  if (PRODUCTION_MODES.has(configuredMode)) {
    return 'production';
  }

  if (SANDBOX_MODES.has(configuredMode)) {
    return 'sandbox';
  }

  if (typeof window !== 'undefined' && PRODUCTION_HOSTS.has(window.location.hostname)) {
    return 'production';
  }

  return 'sandbox';
};

const loadCashfreeScript = () => {
  if (window.Cashfree) {
    return Promise.resolve();
  }

  if (cashfreeSdkPromise) {
    return cashfreeSdkPromise;
  }

  cashfreeSdkPromise = new Promise((resolve, reject) => {
    const existingScript = document.getElementById(CASHFREE_SCRIPT_ID);

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(), { once: true });
      existingScript.addEventListener('error', () => reject(new Error('Failed to load Cashfree SDK')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = CASHFREE_SCRIPT_ID;
    script.src = CASHFREE_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Cashfree SDK'));
    document.body.appendChild(script);
  });

  return cashfreeSdkPromise;
};

export const loadCashfree = async () => {
  await loadCashfreeScript();

  if (!window.Cashfree) {
    throw new Error('Cashfree SDK is unavailable');
  }

  return window.Cashfree({ mode: getCashfreeMode() });
};
