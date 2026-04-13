import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { getOrder } from "../../lib/api";

const OrderDetailsPage = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const statusSteps = ["pending", "confirmed", "packed", "shipped", "delivered"];

  const getStatusStepIndex = (status) => {
    const index = statusSteps.indexOf(status);
    return index >= 0 ? index : 0;
  };

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
            <p className="text-sm text-muted-foreground">Order ID: {order.id}</p>
            <p className="text-sm text-muted-foreground">
              Placed on {new Date(order.created_at).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-1">
                Auto-refreshing every 15 seconds • Last synced at {lastUpdated.toLocaleTimeString("en-IN", {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            )}
          </div>

          <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-secondary text-foreground capitalize w-fit">
            {order.status}
          </span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-border p-6 mb-6">
        <h2 className="font-heading text-xl mb-4">Order Status</h2>

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
          {order.items?.map((item, index) => (
            <div
              key={`${item.product_id}-${item.variant_id || index}`}
              className="flex gap-4 border-b border-border pb-4 last:border-0 last:pb-0"
            >
              <img
                src={item.product_image || "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=100"}
                alt={item.product_name}
                className="w-20 h-20 object-cover rounded-xl border border-border"
              />

              <div className="flex-1">
                <p className="font-medium text-foreground">{item.product_name}</p>

                {(item.color_id || item.flavor_id) && (
                  <p className="text-sm text-muted-foreground mt-1">
                    {[
                      item.color_id ? `Color: ${item.color_id}` : null,
                      item.flavor_id ? `Fragrance: ${item.flavor_id}` : null,
                    ]
                      .filter(Boolean)
                      .join(" • ")}
                  </p>
                )}

                <p className="text-sm text-muted-foreground mt-1">Qty: {item.quantity}</p>
                <p className="text-sm text-muted-foreground">Unit Price: ₹{item.price?.toLocaleString()}</p>
              </div>

              <div className="text-right">
                <p className="font-medium text-foreground">
                  ₹{(item.line_total ?? item.price * item.quantity).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
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
            <p>
              {order.billing_city} - {order.billing_postal_code}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-border p-6">
          <h2 className="font-heading text-xl mb-4">Payment Summary</h2>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>₹{subtotal.toLocaleString()}</span>
            </div>

            {order.gift_packaging && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gift Packaging</span>
                <span>Included</span>
              </div>
            )}

            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Method</span>
              <span className="uppercase">{order.payment_method}</span>
            </div>

            <div className="border-t border-border pt-3 flex justify-between font-medium text-base">
              <span>Total</span>
              <span>₹{order.total_price?.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailsPage;