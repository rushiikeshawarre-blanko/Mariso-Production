import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Circle, Home, Package, ShoppingBag } from 'lucide-react';

import Layout from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { getTrackedOrder } from '../lib/api';
import { formatINR } from '../lib/currency';

const ORDER_ITEM_IMAGE_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="100" height="120" viewBox="0 0 100 120">
      <rect width="100" height="120" rx="14" fill="#f3f0eb"/>
      <text x="50" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" fill="#9c8f82">No image</text>
      <text x="50" y="74" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#b5a89c">Mariso</text>
    </svg>
  `);

const formatStatus = (status) => (
  status ? status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Pending'
);

const formatDate = (value) => {
  if (!value) return 'Not available';

  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const getStatusColor = (status) => {
  switch (status) {
    case 'delivered':
      return 'bg-[#8B9D83]/15 text-[#53634B] border-[#8B9D83]/30';
    case 'shipped':
      return 'bg-[#C7A88A]/20 text-[#7D5E44] border-[#C7A88A]/35';
    case 'packed':
    case 'confirmed':
      return 'bg-[#D7BFA6]/25 text-[#7A5A42] border-[#D7BFA6]/45';
    case 'pending_payment':
    case 'payment_failed':
    case 'payment_expired':
      return 'bg-yellow-50 text-yellow-800 border-yellow-200';
    default:
      return 'bg-white text-muted-foreground border-border';
  }
};

const TrackOrderPage = () => {
  const { token } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;

    const fetchTrackedOrder = async () => {
      setLoading(true);
      setError('');

      try {
        const data = await getTrackedOrder(token);
        if (isMounted) {
          setOrder(data);
        }
      } catch (fetchError) {
        console.error('Error loading tracked order:', fetchError);
        if (isMounted) {
          setError('Order not found');
          setOrder(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    if (token) {
      fetchTrackedOrder();
    } else {
      setError('Order not found');
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [token]);

  const trackingSteps = useMemo(() => order?.tracking_steps || [], [order]);

  return (
    <Layout>
      <div className="min-h-screen bg-[#F8F5F1] pt-8 pb-20 text-foreground md:pt-10">
        <div className="mx-auto max-w-5xl px-5 md:px-8">
          <div className="mb-10">
            <p className="text-xs font-medium uppercase tracking-[0.22em] text-muted-foreground">
              Order Tracking
            </p>
            <h1 className="mt-3 font-heading text-4xl leading-tight md:text-5xl">
              Track Your Mariso Order
            </h1>
          </div>

          {loading ? (
            <div className="rounded-xl border border-black/5 bg-white p-6 shadow-sm md:p-8">
              <div className="animate-pulse space-y-5">
                <div className="h-5 w-36 rounded bg-muted" />
                <div className="h-10 w-2/3 rounded bg-muted" />
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="h-24 rounded-lg bg-muted" />
                  <div className="h-24 rounded-lg bg-muted" />
                  <div className="h-24 rounded-lg bg-muted" />
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="rounded-xl border border-black/5 bg-white p-8 text-center shadow-sm">
              <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#F3EFE8]">
                <Package className="h-7 w-7 text-muted-foreground" strokeWidth={1.5} />
              </div>
              <h2 className="font-heading text-2xl">Order not found</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                This tracking link may be invalid or expired. Please check the link from your Mariso message.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild className="btn-primary">
                  <Link to="/shop">
                    <ShoppingBag className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    Shop
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">
                    <Home className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    Home
                  </Link>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <section className="rounded-xl border border-black/5 bg-white p-6 shadow-sm md:p-8">
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Order Number</p>
                    <h2 className="mt-1 font-heading text-3xl">#{order.order_number}</h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      Placed on {formatDate(order.created_at)}
                    </p>
                  </div>
                  <span className={`inline-flex w-fit items-center rounded-full border px-3 py-1 text-sm font-medium ${getStatusColor(order.status)}`}>
                    {formatStatus(order.status)}
                  </span>
                </div>
              </section>

              <section className="rounded-xl border border-black/5 bg-white p-6 shadow-sm md:p-8">
                <h2 className="font-heading text-2xl">Tracking</h2>
                <div className="mt-6 space-y-4">
                  {trackingSteps.map((step, index) => (
                    <div key={step.key || index} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        {step.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-[#8B9D83]" strokeWidth={1.7} />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground/60" strokeWidth={1.5} />
                        )}
                        {index < trackingSteps.length - 1 ? (
                          <div className={`mt-1 h-8 w-px ${step.completed ? 'bg-[#8B9D83]/70' : 'bg-border'}`} />
                        ) : null}
                      </div>
                      <div className="pb-2">
                        <p className={`font-medium ${step.current ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {step.label}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {step.current ? 'Current status' : step.completed ? 'Completed' : 'Pending'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-black/5 bg-white p-6 shadow-sm md:p-8">
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-heading text-2xl">Items</h2>
                  <p className="text-sm text-muted-foreground">{order.item_count} item(s)</p>
                </div>

                <div className="mt-6 space-y-4">
                  {(order.items || []).map((item, index) => (
                    <div key={`${item.product_name}-${index}`} className="flex gap-4 border-b border-border pb-4 last:border-0 last:pb-0">
                      <img
                        src={item.product_image || ORDER_ITEM_IMAGE_FALLBACK}
                        alt={item.product_name || 'Order item'}
                        className="h-24 w-20 shrink-0 rounded-lg border border-border bg-muted object-cover"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = ORDER_ITEM_IMAGE_FALLBACK;
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium leading-6">{item.product_name || 'Mariso item'}</p>
                        {(item.color_name || item.flavor_name) ? (
                          <p className="mt-1 text-sm leading-6 text-muted-foreground">
                            {[item.color_name ? `Color: ${item.color_name}` : null, item.flavor_name ? `Fragrance: ${item.flavor_name}` : null]
                              .filter(Boolean)
                              .join(' • ')}
                          </p>
                        ) : null}
                        <p className="mt-1 text-sm text-muted-foreground">Qty: {item.quantity}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-black/5 bg-white p-6 shadow-sm md:p-8">
                <h2 className="font-heading text-2xl">Payment Summary</h2>
                <div className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Payment Method</span>
                    <span className="font-medium uppercase">{order.payment_method || 'N/A'}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Payment Status</span>
                    <span className="font-medium">{formatStatus(order.payment_status)}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-border pt-3 text-base">
                    <span className="font-medium">Total</span>
                    <span className="font-medium">{formatINR(order.total_price)}</span>
                  </div>
                </div>
              </section>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild className="btn-primary">
                  <Link to="/shop">
                    <ShoppingBag className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    Continue Shopping
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/">
                    <Home className="mr-2 h-4 w-4" strokeWidth={1.5} />
                    Home
                  </Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default TrackOrderPage;
