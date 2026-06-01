import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { getCashfreePaymentStatus, getOrder, requestOrderCancellation } from "../../lib/api";
import { formatINR } from "../../lib/currency";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Textarea } from "../../components/ui/textarea";

const ORDER_ITEM_IMAGE_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100">
      <rect width="100" height="100" rx="14" fill="#f3f0eb"/>
      <text x="50" y="47" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#9c8f82">No image</text>
      <text x="50" y="62" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#b5a89c">Mariso</text>
    </svg>
  `);

const getItemGiftPackaging = (item) => {
  const giftPackaging = item?.gift_packaging || item?.gift_packaging_snapshot;
  return giftPackaging?.selected === false ? null : giftPackaging;
};

const hasItemGiftPackaging = (items = []) => items.some((item) => Boolean(getItemGiftPackaging(item)));

const CANCELLATION_REASONS = [
  "Delivery timeline does not meet my requirement",
  "Ordered the wrong fragrance/design/variant",
  "Found a more suitable product",
  "Others",
];

const OTHER_CANCELLATION_REASON = "Others";

const getGiftPackagingAmount = (order) => {
  if (order?.gift_packaging_amount !== undefined && order?.gift_packaging_amount !== null) {
    return order.gift_packaging_amount;
  }

  return order?.items?.reduce(
    (sum, item) => sum + Number(getItemGiftPackaging(item)?.line_total || 0),
    0
  ) || 0;
};

const OrderDetailsPage = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [checkingPaymentStatus, setCheckingPaymentStatus] = useState(false);
  const [paymentStatusError, setPaymentStatusError] = useState('');
  const [cancelFormOpen, setCancelFormOpen] = useState(false);
  const [selectedCancellationReasons, setSelectedCancellationReasons] = useState([]);
  const [cancellationReasonOther, setCancellationReasonOther] = useState('');
  const [cancellationValidationError, setCancellationValidationError] = useState('');
  const [submittingCancellation, setSubmittingCancellation] = useState(false);

  const statusSteps = ["pending", "confirmed", "packed", "shipped", "delivered"];

  const getStatusStepIndex = (status) => {
    const index = statusSteps.indexOf(status);
    return index >= 0 ? index : 0;
  };

  const isPendingCashfreeOrder = (currentOrder) => {
    const isCashfree = currentOrder?.payment_method === 'cashfree' || currentOrder?.payment_provider === 'cashfree';
    const isPendingPayment = currentOrder?.status === 'pending_payment' || currentOrder?.payment_status === 'pending';
    return isCashfree && isPendingPayment;
  };

  const formatStatus = (status) => (
    status ? status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Pending'
  );

  const fetchOrder = useCallback(async (showLoader = false) => {
    if (!id) return;

    if (showLoader) {
      setLoading(true);
    }

    try {
      const data = await getOrder(id);
      setOrder(data);
      setLastUpdated(new Date());
    } catch (error) {
      console.error("Error fetching order details:", error);
    } finally {
      if (showLoader) {
        setLoading(false);
      }
    }
  }, [id]);

  useEffect(() => {
    fetchOrder(true);
  }, [fetchOrder]);

  useEffect(() => {
    if (!id) return;

    const interval = setInterval(() => {
      fetchOrder(false);
    }, 15000);

    return () => clearInterval(interval);
  }, [id, fetchOrder]);

  const handleCheckPaymentStatus = async () => {
    if (!order?.id) return;

    setCheckingPaymentStatus(true);
    setPaymentStatusError('');

    try {
      const result = await getCashfreePaymentStatus(order.id);
      setOrder((currentOrder) => ({
        ...currentOrder,
        ...result,
        id: result.order_id || currentOrder.id,
      }));
      setLastUpdated(new Date());
      toast.success('Payment status updated');
    } catch (error) {
      console.error("Error checking Cashfree payment status:", error);
      setPaymentStatusError('Unable to refresh payment status. Please try again.');
      toast.error('Unable to refresh payment status');
    } finally {
      setCheckingPaymentStatus(false);
    }
  };

  const toggleCancellationReason = (reason, checked) => {
    setCancellationValidationError('');
    setSelectedCancellationReasons((currentReasons) => {
      if (checked) {
        return currentReasons.includes(reason) ? currentReasons : [...currentReasons, reason];
      }
      return currentReasons.filter((currentReason) => currentReason !== reason);
    });

    if (reason === OTHER_CANCELLATION_REASON && !checked) {
      setCancellationReasonOther('');
    }
  };

  const resetCancellationForm = () => {
    setCancelFormOpen(false);
    setSelectedCancellationReasons([]);
    setCancellationReasonOther('');
    setCancellationValidationError('');
  };

  const getCancellationValidationError = () => {
    if (selectedCancellationReasons.length === 0) {
      return 'Please select at least one cancellation reason.';
    }

    if (
      selectedCancellationReasons.includes(OTHER_CANCELLATION_REASON) &&
      !cancellationReasonOther.trim()
    ) {
      return 'Please enter the other cancellation reason.';
    }

    return '';
  };

  const handleCancellationRequest = async (event) => {
    event.preventDefault();
    const validationError = getCancellationValidationError();
    if (!order?.id || validationError) {
      setCancellationValidationError(validationError);
      return;
    }

    setSubmittingCancellation(true);
    try {
      const updatedOrder = await requestOrderCancellation(order.id, {
        cancellation_reasons: selectedCancellationReasons,
        cancellation_reason_other: cancellationReasonOther.trim(),
      });
      setOrder(updatedOrder);
      resetCancellationForm();
      toast.success('Cancellation request submitted. Refund will be initiated after mariso team approval.');
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Unable to submit cancellation request.');
    } finally {
      setSubmittingCancellation(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-10 px-4">
        <p className="text-muted-foreground">Loading order details...</p>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-4xl mx-auto py-10 px-4">
        <Link to="/account/orders" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>
        <p className="text-destructive font-medium">Order not found.</p>
      </div>
    );
  }

  const subtotal = order.items?.reduce((sum, item) => sum + (item.line_total ?? item.price * item.quantity), 0) || 0;
  const grossSubtotal = order.subtotal_before_discount ?? subtotal;
  const hasCouponDiscount = Boolean(order.coupon_code && Number(order.coupon_discount_amount || 0) > 0);
  const orderShortId = order.id?.slice(0, 8).toUpperCase();
  const hasGiftedItems = hasItemGiftPackaging(order.items);
  const hasGiftPackaging = Boolean(order.gift_packaging || hasGiftedItems || Number(order.gift_packaging_amount || 0) > 0);
  const hasShippingCharge = order.shipping_charge !== undefined && order.shipping_charge !== null;
  const cancellationStatus = order.cancellation_status || 'none';
  const refundStatusText = {
    pending: 'Refund pending mariso team initiation',
    initiated: 'Refund initiated',
    processing: 'Refund initiated',
    success: 'Refund completed',
    failed: 'Refund failed, contact support',
  }[order.refund_status];
  const placedAt = new Date(order.created_at).getTime();
  const cancellationWindowOpen = Number.isFinite(placedAt) && Date.now() <= placedAt + (60 * 60 * 1000);
  const isCancellationCandidate = (
    order.status === 'confirmed' &&
    order.payment_status === 'paid' &&
    !['requested', 'approved'].includes(cancellationStatus)
  );
  const canRequestCancellation = isCancellationCandidate && cancellationWindowOpen;
  const cancellationWindowExpired = isCancellationCandidate && !cancellationWindowOpen;
  const cancellationSubmitDisabled = submittingCancellation || Boolean(getCancellationValidationError());

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <Link to="/account/orders" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="h-4 w-4" />
        Back to Orders
      </Link>

      <div className="bg-white rounded-2xl border border-border p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h1 className="font-heading text-2xl text-foreground mb-2">Order Details</h1>
            <p className="text-sm text-muted-foreground">Order ID: {orderShortId}</p>
            <p className="text-sm text-muted-foreground">
              Placed on {new Date(order.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          </div>

          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-secondary text-foreground w-fit">
            {formatStatus(order.status)}
          </span>
        </div>
      </div>

      {(canRequestCancellation || cancellationWindowExpired || cancellationStatus !== 'none') && (
        <div className="bg-white rounded-2xl border border-border p-6 mb-6">
          <h2 className="font-heading text-xl mb-3">Cancellation</h2>

          {cancellationStatus === 'requested' && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Cancellation request submitted. Refund will be initiated after mariso team approval.
            </p>
          )}

          {cancellationStatus === 'approved' && (
            <p className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
              Your cancellation request has been approved. {refundStatusText || 'Refund pending mariso team initiation'}.
            </p>
          )}

          {cancellationStatus === 'rejected' && (
            <div className="mb-4 rounded-lg border border-stone-200 bg-stone-50 p-4 text-sm text-stone-800">
              <p>Your cancellation request was not approved.</p>
              {order.cancellation_admin_note && <p className="mt-2">Note: {order.cancellation_admin_note}</p>}
            </div>
          )}

          {cancellationWindowExpired && (
            <p className="text-sm text-muted-foreground">
              Cancellation window expired. Please contact support.
            </p>
          )}

          {canRequestCancellation && (
            <div className="space-y-4">
              {!cancelFormOpen && (
                <Button type="button" variant="outline" onClick={() => setCancelFormOpen(true)}>
                  Request Cancellation
                </Button>
              )}

              {cancelFormOpen && (
                <form className="space-y-4" onSubmit={handleCancellationRequest}>
                  <div>
                    <p className="text-sm font-medium text-foreground">Cancellation reason</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Refunds are initiated only after mariso team approval.
                    </p>
                  </div>

                  <div className="space-y-3">
                    {CANCELLATION_REASONS.map((reason) => {
                      const reasonId = `cancellation-reason-${reason.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
                      const checked = selectedCancellationReasons.includes(reason);

                      return (
                        <div key={reason} className="space-y-2">
                          <label htmlFor={reasonId} className="flex items-start gap-3 text-sm text-foreground">
                            <Checkbox
                              id={reasonId}
                              checked={checked}
                              onCheckedChange={(value) => toggleCancellationReason(reason, value === true)}
                              className="mt-0.5"
                            />
                            <span>{reason}</span>
                          </label>

                          {reason === OTHER_CANCELLATION_REASON && checked && (
                            <Textarea
                              value={cancellationReasonOther}
                              onChange={(event) => {
                                setCancellationReasonOther(event.target.value);
                                setCancellationValidationError('');
                              }}
                              placeholder="Please share the reason"
                              maxLength={500}
                              required
                              className="ml-7"
                              data-testid="cancellation-reason-other"
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {cancellationValidationError && (
                    <p className="text-sm text-destructive">{cancellationValidationError}</p>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button type="button" variant="outline" onClick={resetCancellationForm}>
                      Keep Order
                    </Button>
                    <Button type="submit" disabled={cancellationSubmitDisabled}>
                      {submittingCancellation ? 'Submitting...' : 'Submit Request'}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-border p-6 mb-6">
        <h2 className="font-heading text-xl mb-4">Order Status</h2>

        {isPendingCashfreeOrder(order) && (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-sm text-yellow-900 mb-3">
              Payment is pending. If you completed payment or the session expired, check the latest status.
            </p>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCheckPaymentStatus}
                disabled={checkingPaymentStatus}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${checkingPaymentStatus ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                {checkingPaymentStatus ? 'Checking...' : 'Check Payment Status'}
              </Button>
              {paymentStatusError && (
                <p className="text-xs text-destructive">{paymentStatusError}</p>
              )}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {statusSteps.map((step, index) => {
            const currentStepIndex = getStatusStepIndex(order.status);
            const isCompleted = index <= currentStepIndex;
            const isCurrent = index === currentStepIndex;

            return (
              <div key={step} className="flex items-start gap-4">
                <div className="flex flex-col items-center">
                  {isCompleted ? (
                    <CheckCircle2 className="h-5 w-5 text-[#8B9D83]" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                  {index < statusSteps.length - 1 && (
                    <div className={`w-px h-8 mt-1 ${isCompleted ? 'bg-[#8B9D83]' : 'bg-border'}`} />
                  )}
                </div>

                <div className="pb-2">
                  <p className={`font-medium capitalize ${isCurrent ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {step}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {index < currentStepIndex
                      ? 'Completed'
                      : isCurrent
                      ? 'Current status'
                      : 'Pending'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border p-6 mb-6">
        <h2 className="font-heading text-xl mb-4">Items</h2>

        <div className="space-y-4">
          {order.items?.map((item, index) => {
            const giftPackaging = getItemGiftPackaging(item);

            return (
              <div
                key={`${item.product_id}-${item.variant_id || index}`}
                className="flex gap-4 border-b border-border pb-4 last:border-0 last:pb-0"
              >
                <img
                  src={item.product_image || ORDER_ITEM_IMAGE_FALLBACK}
                  alt={item.product_name || "Order item"}
                  className="w-20 h-20 object-cover rounded-xl border border-border bg-muted"
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = ORDER_ITEM_IMAGE_FALLBACK;
                  }}
                />

                <div className="flex-1">
                  <p className="font-medium text-foreground">{item.product_name}</p>

                  {(item.color_name || item.color_id || item.flavor_name || item.flavor_id) && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {[
                        item.color_name || item.color_id ? `Color: ${item.color_name || item.color_id}` : null,
                        item.flavor_name || item.flavor_id ? `Fragrance: ${item.flavor_name || item.flavor_id}` : null,
                      ]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  )}

                  <p className="text-sm text-muted-foreground mt-1">Qty: {item.quantity}</p>
                  <p className="text-sm text-muted-foreground">
                    Unit Price: {formatINR(item.price, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>

                  {giftPackaging && (
                    <div className="mt-3 rounded-lg border border-[#d9d4cc] bg-[#faf7f2] p-3 text-sm">
                      <p className="font-medium text-foreground">Gift Packaging</p>
                      <p className="mt-1 text-muted-foreground">
                        {giftPackaging.title || 'Gift Packaging'} × {giftPackaging.quantity ?? 1}
                      </p>
                      {giftPackaging.description && (
                        <p className="text-muted-foreground">{giftPackaging.description}</p>
                      )}
                      {(giftPackaging.unit_price !== undefined || giftPackaging.line_total !== undefined) && (
                        <p className="text-muted-foreground">
                          {giftPackaging.unit_price !== undefined && `${formatINR(giftPackaging.unit_price)} each`}
                          {giftPackaging.unit_price !== undefined && giftPackaging.line_total !== undefined && ' · '}
                          {giftPackaging.line_total !== undefined && `${formatINR(giftPackaging.line_total)} total`}
                        </p>
                      )}
                      {giftPackaging.message && (
                        <p className="mt-1 text-muted-foreground">Message: {giftPackaging.message}</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <p className="font-medium text-foreground">
                    {formatINR(item.line_total ?? item.price * item.quantity)}
                  </p>
                </div>
              </div>
            );
          })}

          {hasGiftPackaging && !hasGiftedItems && (
            <p className="rounded-lg border border-[#d9d4cc] bg-[#faf7f2] p-3 text-sm font-medium text-foreground">
              Gift Packaging Included
            </p>
          )}
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="font-heading text-xl mb-4">Shipping Details</h2>
          <div className="space-y-2 text-sm text-muted-foreground">
            <p className="text-foreground font-medium">{order.billing_name}</p>
            <p>{order.billing_phone}</p>
            <p>{order.billing_email}</p>
            <p>{order.billing_address}</p>
            {order.billing_address_2 && <p>{order.billing_address_2}</p>}
            <p>
              {order.billing_city} - {order.billing_postal_code}
            </p>
            <p>
              {order.billing_state || 'Not provided'}, {order.billing_country || 'Not provided'}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="font-heading text-xl mb-4">Payment Summary</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{hasCouponDiscount ? 'Gross Amount' : 'Subtotal'}</span>
              <span>{formatINR(grossSubtotal)}</span>
            </div>

            {hasCouponDiscount && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Coupon {order.coupon_code}</span>
                <span className="font-medium text-[#8B9D83]">-{formatINR(order.coupon_discount_amount)}</span>
              </div>
            )}

            {hasGiftPackaging && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gift Packaging</span>
                <span>{formatINR(getGiftPackagingAmount(order))}</span>
              </div>
            )}

            {hasShippingCharge && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Shipping</span>
                <span>{Number(order.shipping_charge || 0) === 0 ? 'Free' : formatINR(order.shipping_charge)}</span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Method</span>
              <span className="uppercase">{order.payment_method}</span>
            </div>

            {order.payment_status && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Status</span>
                <span>{formatStatus(order.payment_status)}</span>
              </div>
            )}

            <div className="border-t border-border pt-3 flex justify-between font-medium text-base">
              <span>{hasCouponDiscount ? 'Total Paid' : 'Total'}</span>
              <span>{formatINR(order.total_price)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailsPage;
