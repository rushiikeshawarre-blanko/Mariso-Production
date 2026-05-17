import React, { useState, useEffect, useCallback } from 'react';
import { getAllOrders, updateOrderStatus } from '../../lib/api';
import { Button } from '../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Eye, Package } from 'lucide-react';
import { toast } from 'sonner';
import { formatINR } from '../../lib/currency';

const ORDER_ITEM_IMAGE_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="80" height="100" viewBox="0 0 80 100">
      <rect width="80" height="100" rx="10" fill="#f3f0eb"/>
      <text x="40" y="47" text-anchor="middle" font-family="Arial, sans-serif" font-size="10" fill="#9c8f82">No image</text>
      <text x="40" y="61" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" fill="#b5a89c">Mariso</text>
    </svg>
  `);

const ORDER_STATUS_LABELS = {
  pending_payment: 'Payment Pending',
  payment_expired: 'Payment Expired',
  payment_failed: 'Payment Failed',
  paid_stock_issue: 'Paid - Manual Review',
  pending: 'Pending',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
};

const PAYMENT_STATUS_LABELS = {
  paid: 'Paid',
  pending: 'Payment Pending',
  failed: 'Payment Failed',
  expired: 'Payment Expired',
  refunded: 'Refunded',
};

const STATUS_FILTERS = [
  { value: 'pending_payment', label: 'Payment Pending' },
  { value: 'payment_expired', label: 'Payment Expired' },
  { value: 'payment_failed', label: 'Payment Failed' },
  { value: 'paid_stock_issue', label: 'Paid - Manual Review' },
  { value: 'pending', label: 'Pending' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'packed', label: 'Packed' },
  { value: 'shipped', label: 'Shipped' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

const getOrderStatusLabel = (status) => ORDER_STATUS_LABELS[status] || 'Unknown Status';
const getPaymentStatusLabel = (status) => PAYMENT_STATUS_LABELS[status] || 'Payment Unknown';

const formatPaymentProvider = (value) => {
  if (!value) return 'Not specified';
  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'cashfree') return 'Cashfree';
  if (normalized === 'cod') return 'COD';
  return String(value).trim();
};


const formatAdminValue = (value) => {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value === null || value === undefined || value === '') return 'Not available';
  return String(value);
};

const formatAdminDate = (value) => {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available';
  return date.toLocaleString();
};

const getOrderSubtotal = (order) => (
  order?.subtotal_before_discount ??
  order?.items?.reduce((sum, item) => sum + (item.line_total ?? item.price * item.quantity), 0) ??
  0
);

const hasCouponDiscount = (order) => Boolean(order?.coupon_code && Number(order?.coupon_discount_amount || 0) > 0);

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
      case 'pending_payment': return 'bg-amber-100 text-amber-900 border border-amber-200';
      case 'payment_expired': return 'bg-orange-100 text-orange-900 border border-orange-200';
      case 'payment_failed': return 'bg-red-100 text-red-800 border border-red-200';
      case 'paid_stock_issue': return 'bg-rose-100 text-rose-900 border border-rose-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'confirmed': return 'bg-blue-100 text-blue-800';
      case 'packed': return 'bg-purple-100 text-purple-800';
      case 'shipped': return 'bg-indigo-100 text-indigo-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-stone-200 text-stone-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentStatusColor = (status) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800 border border-green-200';
      case 'pending': return 'bg-amber-100 text-amber-900 border border-amber-200';
      case 'failed': return 'bg-red-100 text-red-800 border border-red-200';
      case 'expired': return 'bg-orange-100 text-orange-900 border border-orange-200';
      case 'refunded': return 'bg-sky-100 text-sky-800 border border-sky-200';
      default: return 'bg-gray-100 text-gray-800 border border-gray-200';
    }
  };

  const getPaymentProviderText = (order) => {
    const provider = order.payment_provider || order.payment_method;
    const method = order.payment_method;
    const formattedProvider = formatPaymentProvider(provider);
    const formattedMethod = formatPaymentProvider(method);

    if (provider && method && String(provider).trim().toLowerCase() !== String(method).trim().toLowerCase()) {
      return `${formattedProvider} / ${formattedMethod}`;
    }

    return formattedProvider;
  };

  const getOrderRowClass = (order) => {
    if (order.status === 'paid_stock_issue') return 'bg-rose-50/70';
    if (order.payment_status === 'pending' || order.status === 'pending_payment') return 'bg-amber-50/60';
    if (order.payment_status === 'failed' || order.status === 'payment_failed') return 'bg-red-50/50';
    if (order.payment_status === 'expired' || order.status === 'payment_expired') return 'bg-orange-50/50';
    return '';
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
              {STATUS_FILTERS.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
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
                <TableRow key={order.id} className={getOrderRowClass(order)} data-testid={`order-row-${order.id}`}>
                  <TableCell className="font-medium">
                    #{order.id.slice(0, 8).toUpperCase()}
                  </TableCell>
                  <TableCell>
                    <div>
                      <p className="font-medium">{order.billing_name || order.user_name || 'Customer'}</p>
                      <p className="text-xs text-muted-foreground">{order.billing_email || order.user_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{order.items?.length} items</TableCell>
                  <TableCell>
                    <p className="font-medium">{formatINR(order.total_price)}</p>
                    {hasCouponDiscount(order) && (
                      <p className="mt-1 text-xs font-medium text-[#8B9D83]">
                        {order.coupon_code} -{formatINR(order.coupon_discount_amount)}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getPaymentStatusColor(order.payment_status)}`}>
                        {getPaymentStatusLabel(order.payment_status)}
                      </span>
                      <p className="text-xs font-medium text-muted-foreground">
                        {getPaymentProviderText(order)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={order.status}
                      onValueChange={(value) => handleStatusChange(order.id, value)}
                    >
                      <SelectTrigger className={`h-8 w-[170px] text-xs ${getStatusColor(order.status)}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={order.status}>
                          {getOrderStatusLabel(order.status)}
                        </SelectItem>
                        {allowedTransitions[order.status]?.map((status) => (
                          <SelectItem key={status} value={status}>
                            {getOrderStatusLabel(status)}
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
                  {getOrderStatusLabel(selectedOrder.status)}
                </span>
              </div>

              {selectedOrder.status === 'paid_stock_issue' && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm leading-6 text-rose-900">
                  Payment received, but stock could not be safely confirmed. Please review manually before packing or shipping.
                </div>
              )}

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
                        src={item.product_image || ORDER_ITEM_IMAGE_FALLBACK}
                        alt={item.product_name || 'Order item'}
                        className="h-20 w-16 rounded bg-muted object-cover"
                        onError={(event) => {
                          event.currentTarget.onerror = null;
                          event.currentTarget.src = ORDER_ITEM_IMAGE_FALLBACK;
                        }}
                      />
                      <div className="flex-1">
                        <p className="font-medium">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatINR(item.price)} × {item.quantity}
                        </p>
                      </div>
                      <p className="font-medium sm:text-right">{formatINR(item.line_total ?? item.price * item.quantity)}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Summary */}
              <div className="space-y-3 border-t border-border pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{hasCouponDiscount(selectedOrder) ? 'Gross Amount' : 'Subtotal'}</span>
                  <span>{formatINR(getOrderSubtotal(selectedOrder))}</span>
                </div>
                {hasCouponDiscount(selectedOrder) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Coupon {selectedOrder.coupon_code}</span>
                    <span className="font-medium text-[#8B9D83]">-{formatINR(selectedOrder.coupon_discount_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between pt-2 text-base font-medium">
                  <span>Total Paid</span>
                  <span className="text-xl font-heading">{formatINR(selectedOrder.total_price)}</span>
                </div>
              </div>

              {/* Payment Method */}
              <div className="flex flex-col items-start justify-between gap-1 text-sm sm:flex-row sm:items-center">
                <span className="text-muted-foreground">Payment Method</span>
                <span>{formatPaymentProvider(selectedOrder.payment_method)}</span>
              </div>

              {/* Payment Details */}
              <div className="rounded-lg bg-muted/30 p-4">
                <h4 className="font-medium mb-3">Payment Details</h4>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <p className="text-muted-foreground">Payment Provider</p>
                    <p className="font-medium">{selectedOrder.payment_provider ? formatPaymentProvider(selectedOrder.payment_provider) : formatAdminValue(selectedOrder.payment_provider)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Payment Method</p>
                    <p className="font-medium">{selectedOrder.payment_method ? formatPaymentProvider(selectedOrder.payment_method) : formatAdminValue(selectedOrder.payment_method)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Payment Status</p>
                    <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getPaymentStatusColor(selectedOrder.payment_status)}`}>
                      {getPaymentStatusLabel(selectedOrder.payment_status)}
                    </span>
                  </div>
                  {hasCouponDiscount(selectedOrder) && (
                    <>
                      <div>
                        <p className="text-muted-foreground">Gross Amount</p>
                        <p className="font-medium">{formatINR(getOrderSubtotal(selectedOrder))}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Coupon Code</p>
                        <p className="font-medium">{selectedOrder.coupon_code}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Coupon Discount</p>
                        <p className="font-medium text-[#8B9D83]">-{formatINR(selectedOrder.coupon_discount_amount)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Eligible Subtotal</p>
                        <p className="font-medium">{formatINR(selectedOrder.eligible_subtotal)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Net Paid Amount</p>
                        <p className="font-medium">{formatINR(selectedOrder.total_after_discount ?? selectedOrder.total_price)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Coupon Usage Recorded</p>
                        <p className="font-medium">{formatAdminValue(selectedOrder.coupon_usage_recorded)}</p>
                      </div>
                    </>
                  )}
                  <div>
                    <p className="text-muted-foreground">Cashfree Order Status</p>
                    <p className="font-medium">{formatAdminValue(selectedOrder.cashfree_order_status)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cashfree Order ID</p>
                    <p className="break-all font-medium">{formatAdminValue(selectedOrder.cashfree_order_id)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cashfree CF Order ID</p>
                    <p className="break-all font-medium">{formatAdminValue(selectedOrder.cashfree_cf_order_id)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Cashfree Payment ID</p>
                    <p className="break-all font-medium">{formatAdminValue(selectedOrder.cashfree_payment_id)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Paid At</p>
                    <p className="font-medium">{formatAdminDate(selectedOrder.paid_at)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Stock Reserved</p>
                    <p className="font-medium">{formatAdminValue(selectedOrder.stock_reserved)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Stock Reserved Until</p>
                    <p className="font-medium">{formatAdminDate(selectedOrder.stock_reserved_until)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Stock Deducted</p>
                    <p className="font-medium">{formatAdminValue(selectedOrder.stock_deducted)}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminOrders;
