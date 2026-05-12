import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getCashfreePaymentStatus, getUserOrders } from '../../lib/api';
import { Package, Eye, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';

const ORDER_ITEM_IMAGE_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="100" viewBox="0 0 80 100">
      <rect width="80" height="100" rx="10" fill="#f3f0eb"/>
      <text x="40" y="47" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#9c8f82">No image</text>
      <text x="40" y="61" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#b5a89c">Mariso</text>
    </svg>
  `);

const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingOrderId, setCheckingOrderId] = useState(null);
  const [statusMessages, setStatusMessages] = useState({});

  useEffect(() => {
    const fetchOrders = async () => {
      try {
        const data = await getUserOrders();
        setOrders(data);
      } catch (error) {
        console.error('Error fetching orders:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchOrders();
  }, []);

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending_payment':
      case 'payment_expired':
      case 'payment_failed':
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'packed': return 'bg-purple-100 text-purple-800';
      case 'shipped': return 'bg-indigo-100 text-indigo-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const isPendingCashfreeOrder = (order) => {
    const isCashfree = order.payment_method === 'cashfree' || order.payment_provider === 'cashfree';
    const isPendingPayment = order.status === 'pending_payment' || order.payment_status === 'pending';
    return isCashfree && isPendingPayment;
  };

  const formatStatus = (status) => (
    status ? status.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()) : 'Pending'
  );

  const handleCheckPaymentStatus = async (orderId) => {
    setCheckingOrderId(orderId);
    setStatusMessages((current) => ({ ...current, [orderId]: '' }));

    try {
      const result = await getCashfreePaymentStatus(orderId);
      setOrders((currentOrders) => currentOrders.map((order) => (
        order.id === orderId
          ? { ...order, ...result, id: result.order_id || order.id }
          : order
      )));
      setStatusMessages((current) => ({
        ...current,
        [orderId]: `Payment status updated to ${formatStatus(result.status)}.`
      }));
      toast.success('Payment status updated');
    } catch (error) {
      console.error('Error checking Cashfree payment status:', error);
      setStatusMessages((current) => ({
        ...current,
        [orderId]: 'Unable to refresh payment status. Please try again.'
      }));
      toast.error('Unable to refresh payment status');
    } finally {
      setCheckingOrderId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-white rounded-xl p-6 card-shadow animate-pulse">
            <div className="h-6 bg-muted rounded w-1/3 mb-4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl card-shadow" data-testid="no-orders">
        <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" strokeWidth={1} />
        <h2 className="font-heading text-xl mb-2">No orders yet</h2>
        <p className="text-muted-foreground mb-6">Start shopping to see your orders here.</p>
        <Link to="/shop">
          <Button className="btn-primary">Start Shopping</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4" data-testid="orders-list">
      <h2 className="font-heading text-2xl mb-6">Your Orders</h2>
      
      {orders.map((order) => (
        <div key={order.id} className="bg-white rounded-xl p-6 card-shadow" data-testid={`order-${order.id}`}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-4">
            <div>
              <p className="font-heading text-lg">Order #{order.id.slice(0, 8).toUpperCase()}</p>
              <p className="text-sm text-muted-foreground">
                Placed on {new Date(order.created_at).toLocaleDateString('en-IN', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <span className={`text-xs px-3 py-1 rounded-full font-medium ${getStatusColor(order.status)}`}>
                {formatStatus(order.status)}
              </span>
              <Button asChild variant="outline" size="sm">
                <Link to={`/account/orders/${order.id}`} data-testid={`view-order-${order.id}`}>
                  <Eye className="h-4 w-4 mr-2" strokeWidth={1.5} />
                  View Details
                </Link>
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mb-4">
            {order.items?.map((item, index) => (
              <div key={`${item.product_id || item.product_name}-${item.variant_id || index}`} className="flex items-center gap-3">
                <img
                  src={item.product_image || ORDER_ITEM_IMAGE_FALLBACK}
                  alt={item.product_name || 'Order item'}
                  className="w-16 h-20 object-cover rounded-lg bg-muted"
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = ORDER_ITEM_IMAGE_FALLBACK;
                  }}
                />
                <div>
                  <p className="font-medium text-sm">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                </div>
              </div>
            ))}
          </div>

          {isPendingCashfreeOrder(order) && (
            <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm text-yellow-900 mb-3">
                Payment is pending. If you completed payment or the session expired, check the latest status.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => handleCheckPaymentStatus(order.id)}
                  disabled={checkingOrderId === order.id}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${checkingOrderId === order.id ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                  {checkingOrderId === order.id ? 'Checking...' : 'Check Payment Status'}
                </Button>
                {statusMessages[order.id] && (
                  <p className="text-xs text-muted-foreground">{statusMessages[order.id]}</p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-4 border-t border-border">
            <div className="text-sm text-muted-foreground">
              {order.items?.length} item(s) • {order.payment_method.toUpperCase()}
            </div>
            <p className="font-medium">Total: ₹{order.total_price?.toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default OrdersPage;
