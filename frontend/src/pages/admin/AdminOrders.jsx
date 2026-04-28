import React, { useState, useEffect, useCallback } from 'react';
import { getAllOrders, updateOrderStatus } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Eye, Package } from 'lucide-react';
import { toast } from 'sonner';

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAllOrders(statusFilter === 'all' ? null : statusFilter);
      setOrders(data);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      toast.success(`Order marked as ${newStatus}`);
      fetchOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder((prev) => prev ? { ...prev, status: newStatus } : prev);
      }
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

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

  const allowedTransitions = {
    pending: ['confirmed'],
    confirmed: ['packed'],
    packed: ['shipped'],
    shipped: ['delivered'],
    delivered: [],
  };

  const viewOrder = (order) => {
    setSelectedOrder(order);
    setDialogOpen(true);
  };

  return (
    <div data-testid="admin-orders">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <h1 className="font-heading text-3xl">Orders</h1>
        <div className="w-full sm:w-auto">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full min-w-0 sm:w-[180px]" data-testid="order-status-filter">
              <SelectValue placeholder="Filter by status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Orders</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="packed">Packed</SelectItem>
              <SelectItem value="shipped">Shipped</SelectItem>
              <SelectItem value="delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Orders Table */}
      <div className="overflow-x-auto rounded-xl bg-white card-shadow">
        <Table className="min-w-[980px]">
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Payment</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">Loading...</TableCell>
              </TableRow>
            ) : orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground mb-2" strokeWidth={1} />
                  <p className="text-muted-foreground">No orders found</p>
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id} data-testid={`order-row-${order.id}`}>
                  <TableCell className="font-medium">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{order.user_name || order.billing_name}</p>
                      <p className="text-xs text-muted-foreground">{order.user_email || order.billing_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{order.items?.length} items</TableCell>
                  <TableCell className="font-medium">₹{order.total_price?.toLocaleString()}</TableCell>
                  <TableCell className="uppercase text-xs">{order.payment_method}</TableCell>
                  <TableCell>
                    <Select
                      value={order.status}
                      onValueChange={(value) => handleStatusChange(order.id, value)}
                    >
                      <SelectTrigger className={`w-[120px] h-8 text-xs ${getStatusColor(order.status)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={order.status}>
                          {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                        </SelectItem>
                        {allowedTransitions[order.status]?.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status.charAt(0).toUpperCase() + status.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => viewOrder(order)}
                      data-testid={`view-order-${order.id}`}
                    >
                      <Eye className="h-4 w-4" strokeWidth={1.5} />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Order Details Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] max-h-[92dvh] max-w-none overflow-y-auto p-4 sm:max-w-[600px] sm:p-6">
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">
              Order #{selectedOrder?.id.slice(0, 8).toUpperCase()}
            </DialogTitle>
            <DialogDescription>
              View complete order details including customer information, items, and payment summary.
            </DialogDescription>
          </DialogHeader>
          
          {selectedOrder && (
            <div className="space-y-6 mt-4">
              {/* Status */}
              <div className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                <span className="text-muted-foreground">Status</span>
                <span className={`text-sm px-3 py-1 rounded-full font-medium ${getStatusColor(selectedOrder.status)}`}>
                  {selectedOrder.status.charAt(0).toUpperCase() + selectedOrder.status.slice(1)}
                </span>
              </div>

              {/* Customer Info */}
              <div className="p-4 bg-muted/30 rounded-lg">
                <h4 className="font-medium mb-2">Customer Details</h4>
                <p className="text-sm">{selectedOrder.billing_name}</p>
                <p className="text-sm text-muted-foreground">{selectedOrder.billing_email}</p>
                <p className="text-sm text-muted-foreground">{selectedOrder.billing_phone}</p>
              </div>

              {/* Shipping Address */}
              <div className="p-4 bg-muted/30 rounded-lg">
                <h4 className="font-medium mb-2">Shipping Address</h4>
                <p className="text-sm text-muted-foreground">
                  {selectedOrder.billing_address}<br />
                  {selectedOrder.billing_city}, {selectedOrder.billing_postal_code}
                </p>
              </div>

              {/* Items */}
              <div>
                <h4 className="font-medium mb-3">Order Items</h4>
                <div className="space-y-3">
                  {selectedOrder.items?.map((item, index) => (
                    <div key={`${item.product_id || item.product_name}-${item.variant_id || index}`} className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                      <img
                        src={item.product_image || 'https://via.placeholder.com/60'}
                        alt={item.product_name}
                        className="h-20 w-16 rounded object-cover"
                      />
                      <div className="flex-1">
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          ₹{item.price?.toLocaleString()} × {item.quantity}
                        </p>
                      </div>
                      <p className="font-medium sm:text-right">₹{(item.line_total ?? item.price * item.quantity).toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total */}
              <div className="flex flex-col items-start justify-between gap-2 border-t border-border pt-4 sm:flex-row sm:items-center">
                <span className="font-medium">Total</span>
                <span className="text-xl font-heading">₹{selectedOrder.total_price?.toLocaleString()}</span>
              </div>

              {/* Payment Method */}
              <div className="flex flex-col items-start justify-between gap-1 text-sm sm:flex-row sm:items-center">
                <span className="text-muted-foreground">Payment Method</span>
                <span className="capitalize">{selectedOrder.payment_method}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminOrders;
