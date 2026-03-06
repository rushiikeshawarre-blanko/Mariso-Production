import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { CheckCircle2, Package, Truck, MapPin } from 'lucide-react';
import { getOrder } from '../lib/api';

const OrderSuccessPage = () => {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const orderData = await getOrder(orderId);
        setOrder(orderData);
      } catch (error) {
        console.error('Error fetching order:', error);
      } finally {
        setLoading(false);
      }
    };

    if (orderId) {
      fetchOrder();
    }
  }, [orderId]);

  if (loading) {
    return (
      <Layout>
        <div className="pt-32 pb-24 min-h-screen flex items-center justify-center">
          <div className="animate-pulse text-center">
            <div className="h-16 w-16 bg-muted rounded-full mx-auto mb-4" />
            <div className="h-8 bg-muted rounded w-48 mx-auto mb-2" />
            <div className="h-4 bg-muted rounded w-32 mx-auto" />
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="pt-32 pb-24 min-h-screen" data-testid="order-success-page">
        <div className="max-w-2xl mx-auto container-padding text-center">
          {/* Success Icon */}
          <div className="w-20 h-20 bg-[#8B9D83]/20 rounded-full flex items-center justify-center mx-auto mb-6 animate-scale-in">
            <CheckCircle2 className="h-10 w-10 text-[#8B9D83]" strokeWidth={1.5} />
          </div>

          <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-4 animate-fade-up" data-testid="order-success-title">
            Thank You!
          </h1>
          <p className="text-muted-foreground text-lg mb-8 animate-fade-up" style={{ animationDelay: '0.1s' }}>
            Your order has been placed successfully.
          </p>

          {order && (
            <div className="bg-white rounded-xl p-8 card-shadow text-left mb-8 animate-fade-up" style={{ animationDelay: '0.2s' }}>
              <div className="flex items-center justify-between mb-6 pb-6 border-b border-border">
                <div>
                  <p className="text-sm text-muted-foreground">Order Number</p>
                  <p className="font-medium" data-testid="order-id">{order.id.slice(0, 8).toUpperCase()}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Order Date</p>
                  <p className="font-medium">{new Date(order.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Order Timeline */}
              <div className="flex items-center justify-between mb-8">
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 bg-[#8B9D83] rounded-full flex items-center justify-center">
                    <CheckCircle2 className="h-5 w-5 text-white" strokeWidth={1.5} />
                  </div>
                  <p className="text-xs mt-2 text-center">Order<br />Placed</p>
                </div>
                <div className="flex-1 h-0.5 bg-border mx-2" />
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                    <Package className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <p className="text-xs mt-2 text-center text-muted-foreground">Processing</p>
                </div>
                <div className="flex-1 h-0.5 bg-border mx-2" />
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                    <Truck className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <p className="text-xs mt-2 text-center text-muted-foreground">Shipped</p>
                </div>
                <div className="flex-1 h-0.5 bg-border mx-2" />
                <div className="flex flex-col items-center">
                  <div className="w-10 h-10 bg-muted rounded-full flex items-center justify-center">
                    <MapPin className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                  </div>
                  <p className="text-xs mt-2 text-center text-muted-foreground">Delivered</p>
                </div>
              </div>

              {/* Items */}
              <div className="space-y-4 mb-6">
                <h3 className="font-medium">Order Items</h3>
                {order.items?.map((item, index) => (
                  <div key={index} className="flex gap-4">
                    <img
                      src={item.product_image || 'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=100'}
                      alt={item.product_name}
                      className="w-16 h-20 object-cover rounded-lg"
                    />
                    <div className="flex-1">
                      <p className="font-medium">{item.product_name}</p>
                      <p className="text-sm text-muted-foreground">Qty: {item.quantity}</p>
                      <p className="text-sm">₹{(item.price * item.quantity).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Shipping Address */}
              <div className="pt-6 border-t border-border">
                <h3 className="font-medium mb-2">Shipping Address</h3>
                <p className="text-muted-foreground text-sm">
                  {order.billing_name}<br />
                  {order.billing_address}<br />
                  {order.billing_city}, {order.billing_postal_code}<br />
                  {order.billing_phone}
                </p>
              </div>

              {/* Total */}
              <div className="pt-6 mt-6 border-t border-border flex justify-between items-center">
                <span className="font-medium">Total Paid</span>
                <span className="text-xl font-medium" data-testid="order-total">₹{order.total_price?.toLocaleString()}</span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-up" style={{ animationDelay: '0.3s' }}>
            <Link to="/account/orders">
              <Button className="btn-secondary" data-testid="view-orders-button">
                View Orders
              </Button>
            </Link>
            <Link to="/shop">
              <Button className="btn-primary" data-testid="continue-shopping-success">
                Continue Shopping
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default OrderSuccessPage;
