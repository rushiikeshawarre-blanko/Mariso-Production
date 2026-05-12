import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { getCashfreePaymentStatus, verifyCashfreePayment } from '../lib/api';
import { useCart } from '../context/CartContext';

const getPaymentState = (paymentResult) => {
  const paymentStatus = paymentResult?.payment_status;
  const orderStatus = paymentResult?.status;

  if (paymentStatus === 'paid' && orderStatus === 'confirmed') {
    return 'paid';
  }

  if (orderStatus === 'paid_stock_issue') {
    return 'paid_stock_issue';
  }

  if (
    paymentStatus === 'expired' ||
    paymentStatus === 'failed' ||
    orderStatus === 'payment_expired' ||
    orderStatus === 'payment_failed'
  ) {
    return 'failed';
  }

  return 'pending';
};

const getCheckoutPaymentReason = (paymentResult) => {
  const paymentStatus = paymentResult?.payment_status;
  const orderStatus = paymentResult?.status;

  if (paymentStatus === 'expired' || orderStatus === 'payment_expired') {
    return 'expired';
  }

  if (paymentStatus === 'failed' || orderStatus === 'payment_failed') {
    return 'failed';
  }

  return 'pending';
};

const PaymentReturnPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { clearCart } = useCart();
  const orderId = searchParams.get('order_id');
  const hasVerifiedRef = useRef(false);
  const [loading, setLoading] = useState(Boolean(orderId));
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [error, setError] = useState(orderId ? '' : 'Missing payment order ID.');

  const handlePaymentResult = useCallback((result) => {
    setPaymentResult(result);
    const nextState = getPaymentState(result);

    if (nextState === 'paid') {
      clearCart();
      sessionStorage.removeItem('pending_cashfree_order_id');
      navigate(`/order-success/${result.order_id}`, { replace: true });
    }
  }, [clearCart, navigate]);

  const verifyPayment = useCallback(async () => {
    if (!orderId) return;

    setLoading(true);
    setError('');
    try {
      const result = await verifyCashfreePayment(orderId);
      handlePaymentResult(result);
    } catch (verifyError) {
      console.error('Cashfree payment verification failed:', verifyError);
      setError('We could not verify your payment right now. Please check the status again.');
    } finally {
      setLoading(false);
    }
  }, [handlePaymentResult, orderId]);

  const checkStatus = async () => {
    if (!orderId) return;

    setCheckingStatus(true);
    setError('');
    try {
      const result = await getCashfreePaymentStatus(orderId);
      handlePaymentResult(result);
      if (getPaymentState(result) === 'pending') {
        toast.info('Payment is still processing.');
      }
    } catch (statusError) {
      console.error('Cashfree payment status check failed:', statusError);
      setError('We could not refresh the payment status. Please try again.');
    } finally {
      setCheckingStatus(false);
    }
  };

  useEffect(() => {
    if (!orderId || hasVerifiedRef.current) return;

    hasVerifiedRef.current = true;
    verifyPayment();
  }, [orderId, verifyPayment]);

  const paymentState = getPaymentState(paymentResult);
  const checkoutPaymentReason = getCheckoutPaymentReason(paymentResult);

  let title = 'Verifying Payment';
  let message = 'Please wait while we confirm your payment with Cashfree.';
  let Icon = Loader2;
  let iconClassName = 'text-muted-foreground animate-spin';

  if (loading) {
    title = 'Verifying Payment';
    message = 'Please wait while we confirm your payment with Cashfree.';
  } else if (error && !paymentResult) {
    title = 'Payment Verification Needed';
    message = error;
    Icon = AlertCircle;
    iconClassName = 'text-destructive';
  } else if (paymentState === 'pending') {
    title = 'Payment Is Still Processing';
    message = 'Payment is still pending. Your items are still in your cart.';
    Icon = Clock;
    iconClassName = 'text-yellow-700';
  } else if (paymentState === 'failed') {
    title = 'Payment Failed or Expired';
    message = 'Payment was not completed. Your items are still in your cart.';
    Icon = AlertCircle;
    iconClassName = 'text-destructive';
  } else if (paymentState === 'paid_stock_issue') {
    title = 'Payment Received, Review Needed';
    message = 'We received your payment, but stock needs manual review. Support will contact you before fulfillment.';
    Icon = CheckCircle2;
    iconClassName = 'text-yellow-700';
  }

  return (
    <Layout>
      <div className="pt-32 pb-24 min-h-screen" data-testid="cashfree-return-page">
        <div className="max-w-2xl mx-auto container-padding text-center">
          <div className="bg-white rounded-xl p-8 card-shadow">
            <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
              <Icon className={`h-8 w-8 ${iconClassName}`} strokeWidth={1.5} />
            </div>

            <h1 className="font-heading text-3xl md:text-4xl tracking-tight mb-4">
              {title}
            </h1>
            <p className="text-muted-foreground mb-6">
              {message}
            </p>

            {orderId && (
              <p className="text-xs text-muted-foreground mb-8">
                Order #{orderId.slice(0, 8).toUpperCase()}
              </p>
            )}

            {error && paymentResult && (
              <p className="text-sm text-destructive mb-6">{error}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              {orderId && paymentState === 'pending' && (
                <Button
                  type="button"
                  className="btn-primary"
                  onClick={checkStatus}
                  disabled={loading || checkingStatus}
                >
                  {checkingStatus ? 'Checking...' : 'Check Status'}
                </Button>
              )}

              {(paymentState === 'failed' || paymentState === 'pending') && (
                <Button asChild className="btn-primary">
                  <Link to={`/checkout?payment=${checkoutPaymentReason}`}>Back to Checkout</Link>
                </Button>
              )}

              {paymentState === 'paid_stock_issue' && (
                <Button asChild className="btn-primary">
                  <Link to="/account/orders">View Orders</Link>
                </Button>
              )}

              <Button asChild variant="outline">
                <Link to="/cart">View Cart</Link>
              </Button>

              {paymentState !== 'paid_stock_issue' && (
                <Button asChild variant="outline">
                  <Link to="/account/orders">View Orders</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default PaymentReturnPage;
