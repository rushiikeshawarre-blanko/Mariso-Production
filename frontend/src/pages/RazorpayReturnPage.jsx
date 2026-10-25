import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import { useCart } from '../context/CartContext';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { getRazorpayPaymentStatus, retryRazorpayCheckout, verifyRazorpayPayment, buyAgainRazorpayOrder } from '../lib/api';
import { fingerprint, getPending, pendingKey, loadRazorpay, openCheckout } from '../lib/razorpay';

export default function RazorpayReturnPage() {
  const [params] = useSearchParams();
  const orderId = params.get('order_id');
  const { user } = useAuth0();
  const { items, clearCart, restoreItems } = useCart();
  const navigate = useNavigate();
  const retryLock = useRef(false);
  const [retryError, setRetryError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (!orderId || !user?.sub) return undefined;
    let active = true;
    let timer;
    let checks = 0;
    const check = async () => {
      setChecking(true);
      try {
        const status = await getRazorpayPaymentStatus(orderId);
        if (!active) return;
        setResult(status);
        setError('');
        if (status.payment_status === 'paid' && status.fulfillment_ready) {
          const pending = getPending(user.sub);
          const cartHash = await fingerprint(items);
          if (!active) return;
          if (pending?.orderId === orderId) {
            if (pending.cartHash === cartHash) clearCart();
            sessionStorage.removeItem(pendingKey(user.sub));
          }
          navigate(`/order-success/${encodeURIComponent(orderId)}`, { replace: true });
          return;
        }
        if (status.payment_status === 'pending' && ++checks < 12) {
          timer = window.setTimeout(check, 5000);
        }
      } catch {
        if (active) setError('We could not check your payment. Please check again before paying another time.');
      } finally {
        if (active) setChecking(false);
      }
    };
    check();
    return () => { active = false; window.clearTimeout(timer); };
  }, [orderId, user?.sub, items, clearCart, navigate, refresh]);

  const retry = async () => {
    if (retryLock.current) return;
    retryLock.current = true;
    setRetrying(true);
    setRetryError('');
    try {
      if (expired) {
        const response = await buyAgainRazorpayOrder(orderId);
        restoreItems(response.items);
        if (getPending(user.sub)?.orderId === orderId) sessionStorage.removeItem(pendingKey(user.sub));
        navigate('/checkout');
        return;
      }
      const SDK = await loadRazorpay();
      const session = await retryRazorpayCheckout(orderId);
      const outcome = await openCheckout(SDK, session, {});
      if (outcome.type === 'submitted') {
        const data = outcome.response;
        await verifyRazorpayPayment({ order_id: orderId,
          razorpay_order_id: data.razorpay_order_id,
          razorpay_payment_id: data.razorpay_payment_id,
          razorpay_signature: data.razorpay_signature });
      }
    } catch (error) {
      setRetryError(error?.response?.status === 429
        ? 'Too many retry requests. Please wait one minute before trying again.'
        : (expired ? 'We could not prepare this order again. Items may be unavailable or a payment still needs checking. Please check again or contact support.' : 'Payment could not be resumed. Check the latest status; if it remains unavailable, contact support.'));
    } finally {
      retryLock.current = false;
      setRetrying(false);
      setRefresh(value => value + 1);
    }
  };
  const review = result?.status === 'paid_stock_issue';
  const failedAttempt = result?.has_failed_payment_attempt && result?.payment_status !== 'paid';
  const expired = result?.payment_status === 'expired' ||
    (result?.payment_status === 'pending' && result?.stock_reserved_until && Date.parse(result.stock_reserved_until) <= Date.now());
  return <Layout><main className="max-w-2xl mx-auto px-6 py-20 text-center" data-testid="razorpay-return-page">
    <h1 className="font-heading text-3xl mb-5">{review ? 'Payment received, review needed' : expired ? 'Reservation expired' : failedAttempt ? 'Payment attempt failed' : 'Payment status'}</h1>
    <p className="mb-6">{!orderId ? 'Select your order from your account to check its payment.' :
      retryError || error || (review ? 'Your payment was received. Your order needs a stock review before it can be fulfilled.' :
        expired ? 'This reservation has expired. Buy again adds the available items to checkout at current prices. Review discounts, gift packaging and shipping before placing a new order.' :
          failedAttempt ? 'A payment attempt failed. Your cart has been kept. You can retry payment for this same order after we check its payment status and stock.' :
          'Your payment is being checked. Closing checkout does not confirm whether a payment was completed.')}</p>
    {orderId && !review && ['pending', 'expired'].includes(result?.payment_status) &&
      <Button onClick={retry} disabled={retrying || checking} className="mr-3">
        {retrying ? (expired ? 'Preparing checkout…' : 'Opening payment…') : expired ? 'Buy again' : 'Resume payment'}
      </Button>}
    {orderId && <Button onClick={() => setRefresh((value) => value + 1)} disabled={checking || retrying} className="mr-3">
      {checking ? 'Checking…' : 'Check again'}
    </Button>}
    <Button asChild variant="outline"><Link to="/account/orders">View orders</Link></Button>
  </main></Layout>;
}
