import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getUserOrders } from '../../lib/api';
import { Package, Eye } from 'lucide-react';
import { Button } from '../../components/ui/button';

const OrdersPage = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

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
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'packed': return 'bg-purple-100 text-purple-800';
      case 'shipped': return 'bg-indigo-100 text-indigo-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
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
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </span>
              <Link to={`/order-success/${order.id}`}>
                <Button variant="outline" size="sm">
                  <Eye className="h-4 w-4 mr-2" strokeWidth={1.5} />
                  View Details
                </Button>
              </Link>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mb-4">
            {order.items?.map((item, index) => (
              <div key={index} className="flex items-center gap-3">
                <img
                  src={item.product_image || 'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=100'}
                  alt={item.product_name}
                  className="w-16 h-20 object-cover rounded-lg"
                />
                <div>
                  <p className="font-medium text-sm">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                </div>
              </div>
            ))}
          </div>

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
