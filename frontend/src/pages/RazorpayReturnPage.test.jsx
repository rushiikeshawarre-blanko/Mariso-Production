import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import RazorpayReturnPage from './RazorpayReturnPage';
import { getRazorpayPaymentStatus, retryRazorpayCheckout, verifyRazorpayPayment, buyAgainRazorpayOrder } from '../lib/api';
import { fingerprint, loadRazorpay, openCheckout } from '../lib/razorpay';

const mockNavigate = jest.fn();
const mockClearCart = jest.fn();
const mockRestoreItems = jest.fn();
const mockItems = ['cart'];
jest.mock('../lib/api', () => ({ getRazorpayPaymentStatus: jest.fn(), retryRazorpayCheckout: jest.fn(), verifyRazorpayPayment: jest.fn(), buyAgainRazorpayOrder: jest.fn() }));
jest.mock('../lib/razorpay', () => ({
  loadRazorpay: jest.fn(), openCheckout: jest.fn(), fingerprint: jest.fn(), getPending: () => ({ orderId: 'local', cartHash: 'original' }),
  pendingKey: () => 'pending',
}));
jest.mock('@auth0/auth0-react', () => ({ useAuth0: () => ({ user: { sub: 'user' } }) }));
jest.mock('../context/CartContext', () => ({ useCart: () => ({ items: mockItems, clearCart: mockClearCart, restoreItems: mockRestoreItems }) }));
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams('order_id=local')],
  Link: ({ children }) => <span>{children}</span>,
}));
jest.mock('../components/layout/Layout', () => ({ Layout: ({ children }) => <div>{children}</div> }));
jest.mock('../components/ui/button', () => ({ Button: ({ children, asChild, ...props }) => <button {...props}>{children}</button> }));

let container;
let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container);
  fingerprint.mockResolvedValue('original');
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
const render = async (result) => {
  getRazorpayPaymentStatus.mockResolvedValue(result);
  await act(async () => { root.render(<RazorpayReturnPage />); });
};

test('server-confirmed payment clears only matching cart and navigates', async () => {
  await render({ payment_status: 'paid', status: 'confirmed', fulfillment_ready: true });
  expect(mockClearCart).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith('/order-success/local', { replace: true });
});
test('changed cart survives payment confirmation', async () => {
  fingerprint.mockResolvedValue('changed');
  await render({ payment_status: 'paid', status: 'confirmed', fulfillment_ready: true });
  expect(mockClearCart).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalled();
});
test('paid stock issue is displayed without clearing cart or claiming success', async () => {
  await render({ payment_status: 'paid', status: 'paid_stock_issue', fulfillment_ready: false });
  expect(container.textContent).toContain('review needed');
  expect(mockClearCart).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});
test('pending payment remains pending without success navigation', async () => {
  await render({ payment_status: 'pending', status: 'pending_payment', fulfillment_ready: false });
  expect(mockNavigate).not.toHaveBeenCalled();
  expect(mockClearCart).not.toHaveBeenCalled();
});
test('status failure offers checking again without claiming a failed charge', async () => {
  getRazorpayPaymentStatus.mockRejectedValue(new Error('timeout'));
  await act(async () => { root.render(<RazorpayReturnPage />); });
  expect(container.textContent).toContain('before paying another time');
  expect(mockClearCart).not.toHaveBeenCalled();
});

test('verified failed attempt is explained without clearing the cart or offering another charge', async () => {
  await render({ payment_status: 'pending', status: 'pending_payment', has_failed_payment_attempt: true });
  expect(container.textContent).toContain('Payment attempt failed');
  expect(container.textContent).toContain('Your cart has been kept');
  expect(mockClearCart).not.toHaveBeenCalled();
  expect(mockNavigate).not.toHaveBeenCalled();
});


test('retry uses existing order and blocks repeated clicks', async () => {
  await render({ payment_status: 'pending', status: 'pending_payment' });
  loadRazorpay.mockResolvedValue('sdk');
  retryRazorpayCheckout.mockResolvedValue({ order_id: 'local' });
  openCheckout.mockResolvedValue({ type: 'submitted', response: {
    razorpay_order_id: 'order_same', razorpay_payment_id: 'pay_retry', razorpay_signature: 'sig',
  } });
  verifyRazorpayPayment.mockResolvedValue({});
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === 'Resume payment');
  await act(async () => { button.click(); button.click(); });
  expect(retryRazorpayCheckout).toHaveBeenCalledTimes(1);
  expect(retryRazorpayCheckout).toHaveBeenCalledWith('local');
  expect(verifyRazorpayPayment).toHaveBeenCalledWith({ order_id: 'local',
    razorpay_order_id: 'order_same', razorpay_payment_id: 'pay_retry', razorpay_signature: 'sig' });
  expect(mockClearCart).not.toHaveBeenCalled();
});

test('blocked retry keeps message and never opens checkout', async () => {
  await render({ payment_status: 'pending', status: 'pending_payment' });
  loadRazorpay.mockResolvedValue('sdk');
  retryRazorpayCheckout.mockRejectedValue(new Error('unresolved payment'));
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === 'Resume payment');
  await act(async () => { button.click(); });
  expect(openCheckout).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Payment could not be resumed');
  expect(mockClearCart).not.toHaveBeenCalled();
});


test('expired order buys again through fresh checkout without opening the old SDK', async () => {
  await render({ payment_status: 'expired', status: 'payment_expired' });
  buyAgainRazorpayOrder.mockResolvedValue({ items: [{ id: 'p', price: 123 }] });
  const button = [...container.querySelectorAll('button')].find(b => b.textContent === 'Buy again');
  expect(container.textContent).not.toContain('Resume payment');
  await act(async () => { button.click(); });
  expect(buyAgainRazorpayOrder).toHaveBeenCalledWith('local');
  expect(mockRestoreItems).toHaveBeenCalledWith([{ id: 'p', price: 123 }]);
  expect(mockNavigate).toHaveBeenCalledWith('/checkout');
  expect(openCheckout).not.toHaveBeenCalled();
  expect(retryRazorpayCheckout).not.toHaveBeenCalled();
});
