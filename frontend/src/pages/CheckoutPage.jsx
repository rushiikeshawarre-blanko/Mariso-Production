import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useCart } from '../context/CartContext';
import { useAuth0 } from '@auth0/auth0-react';
import { createCashfreeSession, validateCoupon } from '../lib/api';
import { loadCashfree } from '../lib/cashfree';
import { toast } from 'sonner';
import { CreditCard, Lock, ChevronLeft, Gift, Sparkles, Heart, Recycle, Truck, Star, ShieldCheck } from 'lucide-react';

const formatCouponCurrency = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const CheckoutPage = () => {
  const location = useLocation();
  const { giftPackaging = false, giftNote = '' } = location.state || {};
  const { items } = useCart();
  const { user, isAuthenticated, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponCartSignature, setCouponCartSignature] = useState('');
  const paymentMessage = new URLSearchParams(location.search).get('payment');
  
  const GIFT_PACKAGING_PRICE = 149;

  const getCheckoutOriginalSubtotal = () => {
    return items.reduce((total, item) => total + (item.price * item.quantity), 0 );
  };
  
  const getCheckoutEffectivePrice =(item) => {
    return item.is_on_sale && (item.sale_price || item.discount_price)
      ? (item.sale_price || item.discount_price)
      : item.price;
  };

  const getCheckoutDiscountSubtotal = () => {
    return items.reduce((total, item) => total + (getCheckoutEffectivePrice(item) * item.quantity), 0 );
  };

  const cartSignature = items
    .map((item) => [
      item.id,
      item.variantId || '',
      item.selectedColorId || '',
      item.selectedFlavorId || '',
      item.quantity,
      getCheckoutEffectivePrice(item),
    ].join(':'))
    .join('|');

  const getCheckoutSaving = () => {
    return getCheckoutOriginalSubtotal() - getCheckoutDiscountSubtotal();
  };

  const [formData, setFormData] = useState({
    name: user?.name || '',
    phone: '',
    email: user?.email || '',
    address: '',
    city: '',
    postalCode: ''
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  useEffect(() => {
    if (appliedCoupon && couponCartSignature && couponCartSignature !== cartSignature) {
      setAppliedCoupon(null);
      setCouponMessage('');
      setCouponError('Cart changed. Please apply the coupon again.');
      setCouponCartSignature('');
    }
  }, [appliedCoupon, cartSignature, couponCartSignature]);

  const getCouponPreviewItemsTotal = () => {
    return appliedCoupon ? appliedCoupon.final_total : getCheckoutDiscountSubtotal();
  };

  const getCouponPreviewTotal = () => {
    return getCouponPreviewItemsTotal() + (giftPackaging ? GIFT_PACKAGING_PRICE : 0);
  };

  const getCheckoutItemImage = (item) => {
    const selectedColor = (item.color_options || []).find(
      (color) => color.id === item.selectedColorId
    );

    return (
      (selectedColor?.images || []).filter(Boolean)[0] ||
      (item.images || []).filter(Boolean)[0] ||
      (item.color_options || [])
        .filter((color) => color?.is_active !== false)
        .flatMap((color) => color?.images || [])
        .filter(Boolean)[0] ||
      'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=100'
    );
  };  

  const paymentMessageText = {
    expired: 'Payment session expired. Your items are still in your cart. Please try again.',
    failed: 'Payment failed or was cancelled. Your items are still in your cart. Please try again.',
    pending: 'Payment is still pending. You can retry checkout or check your order status.',
    cancelled: 'Payment was cancelled. Your items are still in your cart.',
  }[paymentMessage];

  const buildCouponValidationItems = () => {
    return items.map((item) => ({
      product_id: item.product_id || item.id || item.product?.id || '',
      category_id: item.category_id || item.categoryId || item.product?.category_id || '',
      quantity: item.quantity,
      price: getCheckoutEffectivePrice(item),
    }));
  };

  const handleApplyCoupon = async () => {
    const normalizedCode = couponCode.trim().toUpperCase();
    if (!normalizedCode) {
      setCouponError('Please enter a coupon code.');
      setCouponMessage('');
      return;
    }

    if (appliedCoupon) {
      setCouponError('Remove the current coupon before applying another.');
      setCouponMessage('');
      return;
    }

    setCouponLoading(true);
    setCouponError('');
    setCouponMessage('');

    try {
      const result = await validateCoupon({
        code: normalizedCode,
        items: buildCouponValidationItems(),
        user_id: user?.sub || user?.id || undefined,
        email: formData.email || user?.email || undefined,
        phone: formData.phone || undefined,
      });

      if (!result?.valid) {
        setAppliedCoupon(null);
        setCouponError(result?.message || 'Coupon could not be applied.');
        return;
      }

      setAppliedCoupon(result);
      setCouponCode(result.code || normalizedCode);
      setCouponCartSignature(cartSignature);
      setCouponMessage(result.message || 'Coupon applied successfully.');
      toast.success('Coupon applied');
    } catch (error) {
      console.error('Error applying coupon:', error);
      setAppliedCoupon(null);
      setCouponError(error?.response?.data?.message || error?.response?.data?.detail || 'Unable to validate coupon. Please try again.');
    } finally {
      setCouponLoading(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponMessage('');
    setCouponError('');
    setCouponCartSignature('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isAuthenticated) {
      toast.error('Please sign in to place an order');
      loginWithRedirect();
      return;
    }

    if (items.length === 0) {
      toast.error('Your cart is empty');
      navigate('/shop');
      return;
    }

    // Validate form
    if (!formData.name || !formData.phone || !formData.email || !formData.address || !formData.city || !formData.postalCode) {
      toast.error('Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      const checkoutPayload = {
        items: items.map(item => ({
          product_id: item.id,
          quantity: item.quantity,
          variant_id: item.variantId ?? null,
          color_id: item.selectedColorId ?? null,
          flavor_id: item.selectedFlavorId ?? null,
        })),
        billing_name: formData.name,
        billing_phone: formData.phone,
        billing_email: formData.email,
        billing_address: formData.address,
        billing_city: formData.city,
        billing_postal_code: formData.postalCode,
        gift_packaging: giftPackaging
      };

      // TODO Phase 4: send coupon_code to Cashfree create-session and let backend recalculate final amount.
      const session = await createCashfreeSession(checkoutPayload);
      if (!session?.payment_session_id || !session?.order_id) {
        throw new Error('Payment session could not be created');
      }

      sessionStorage.setItem('pending_cashfree_order_id', session.order_id);

      const cashfree = await loadCashfree();
      await cashfree.checkout({
        paymentSessionId: session.payment_session_id,
        redirectTarget: '_self'
      });
    } catch (error) {
      console.error('Error starting Cashfree checkout:', error);
      toast.error('Unable to start secure payment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <Layout>
        <div className="pt-32 pb-24 min-h-screen">
          <div className="max-w-[1440px] mx-auto container-padding text-center">
            <h1 className="font-heading text-3xl mb-4">Your cart is empty</h1>
            <Button onClick={() => navigate('/shop')} className="btn-primary">
              Continue Shopping
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="pt-32 pb-24 min-h-screen" data-testid="checkout-page">
        <div className="max-w-[1440px] mx-auto container-padding">
          {/* Back Button */}
          <button
            onClick={() => navigate('/cart')}
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
            data-testid="back-to-cart"
          >
            <ChevronLeft className="h-4 w-4 mr-1" strokeWidth={1.5} />
            Back to Cart
          </button>

          <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-12">Checkout</h1>

          {paymentMessageText && (
            <div className="mb-8 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <p className="text-sm text-yellow-900">{paymentMessageText}</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
              {/* Billing Details */}
              <div className="lg:col-span-2 space-y-8">
                {/* Contact Information */}
                <div className="bg-white rounded-xl p-8 card-shadow">
                  <h2 className="font-heading text-xl mb-6">Contact Information</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <Label htmlFor="name">Full Name</Label>
                      <Input
                        id="name"
                        name="name"
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Enter your full name"
                        className="mt-2"
                        required
                        data-testid="checkout-name"
                      />
                    </div>
                    <div>
                      <Label htmlFor="phone">Phone Number</Label>
                      <Input
                        id="phone"
                        name="phone"
                        type="tel"
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="+91 98765 43210"
                        className="mt-2"
                        required
                        data-testid="checkout-phone"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Label htmlFor="email">Email Address</Label>
                      <Input
                        id="email"
                        name="email"
                        type="email"
                        value={formData.email}
                        onChange={handleChange}
                        placeholder="you@example.com"
                        className="mt-2"
                        required
                        data-testid="checkout-email"
                      />
                    </div>
                  </div>
                </div>

                {/* Shipping Address */}
                <div className="bg-white rounded-xl p-8 card-shadow">
                  <h2 className="font-heading text-xl mb-6">Shipping Address</h2>
                  <div className="space-y-6">
                    <div>
                      <Label htmlFor="address">Street Address</Label>
                      <Input
                        id="address"
                        name="address"
                        value={formData.address}
                        onChange={handleChange}
                        placeholder="123 Main Street, Apartment 4B"
                        className="mt-2"
                        required
                        data-testid="checkout-address"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          name="city"
                          value={formData.city}
                          onChange={handleChange}
                          placeholder="Mumbai"
                          className="mt-2"
                          required
                          data-testid="checkout-city"
                        />
                      </div>
                      <div>
                        <Label htmlFor="postalCode">Postal Code</Label>
                        <Input
                          id="postalCode"
                          name="postalCode"
                          value={formData.postalCode}
                          onChange={handleChange}
                          placeholder="400001"
                          className="mt-2"
                          required
                          data-testid="checkout-postal"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Method */}
                <div className="bg-white rounded-xl p-8 card-shadow">
                  <div className="flex items-center gap-2 mb-6">
                    <ShieldCheck className="h-5 w-5 text-[#8B9D83]" strokeWidth={1.5} />
                    <h2 className="font-heading text-xl">Secure Online Payment</h2>
                  </div>
                  <div className="flex items-start gap-4 p-4 rounded-lg border border-border bg-muted/20">
                    <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" strokeWidth={1.5} />
                    <div>
                      <p className="font-medium">Pay securely with Cashfree</p>
                      <p className="text-sm text-muted-foreground">
                        Choose UPI, cards, net banking, or wallets on the secure payment page.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Why Choose Mariso */}
                <div className="bg-terracotta/5 rounded-xl p-8 border border-terracotta/20" data-testid="why-choose-mariso-section">
                  <div className="flex items-center gap-2 mb-6">
                    <Sparkles className="h-5 w-5 text-terracotta" strokeWidth={1.5} />
                    <h2 className="font-heading text-xl">Why Choose Mariso?</h2>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                    <div className="flex items-start gap-3">
                      <Heart className="h-5 w-5 text-terracotta flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium text-sm">Handcrafted with Care</p>
                        <p className="text-xs text-muted-foreground">Each piece made with love</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Star className="h-5 w-5 text-terracotta flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium text-sm">Premium Quality</p>
                        <p className="text-xs text-muted-foreground">100% natural soy wax</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Recycle className="h-5 w-5 text-terracotta flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium text-sm">Sustainable</p>
                        <p className="text-xs text-muted-foreground">Reusable containers</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Gift className="h-5 w-5 text-terracotta flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium text-sm">Perfect for Gifting</p>
                        <p className="text-xs text-muted-foreground">Beautiful presentation</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Truck className="h-5 w-5 text-terracotta flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium text-sm">Free Shipping</p>
                        <p className="text-xs text-muted-foreground">On orders over ₹1500</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3">
                      <Sparkles className="h-5 w-5 text-terracotta flex-shrink-0 mt-0.5" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium text-sm">Artisan Made</p>
                        <p className="text-xs text-muted-foreground">Supporting local crafts</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Order Summary */}
              <div className="lg:col-span-1">
                <div className="bg-white rounded-xl p-8 card-shadow sticky top-32">
                  <h2 className="font-heading text-xl mb-6">Order Summary</h2>

                  {/* Items */}
                  <div className="space-y-4 mb-6 max-h-64 overflow-y-auto">
                    {items.map((item) => {
                      const price = getCheckoutEffectivePrice(item);
                      return (
                        <div
                          key={`${item.id}-${item.variantId || item.selectedColorId || 'none'}-${item.selectedFlavorId || 'none'}`}
                          className="flex gap-4"
                          data-testid={`checkout-item-${item.id}`}
                        >
                          <img
                            src={getCheckoutItemImage(item)}
                            alt={item.name}
                            className="w-16 h-20 object-cover rounded-lg"
                          />
                          <div className="flex-1">
                            <p className="font-medium text-sm">{item.name}</p>
                            <p className="text-xs text-muted-foreground">Qty: {item.quantity}</p>
                            {item.selectedColor && (
                              <p className="text-xs text-muted-foreground">Color: {item.selectedColor}</p>
                            )}
                            <p className="text-sm mt-1">₹{(price * item.quantity).toLocaleString()}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Gift Packaging Indicator */}
                  {giftPackaging && (
                    <div className="flex items-center gap-2 p-3 bg-terracotta/10 rounded-lg mb-4">
                      <Gift className="h-4 w-4 text-terracotta" strokeWidth={1.5} />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Gift Packaging</p>
                        {giftNote && <p className="text-xs text-muted-foreground truncate">"{giftNote}"</p>}
                      </div>
                      <span className="text-sm">₹{GIFT_PACKAGING_PRICE}</span>
                    </div>
                  )}

                  <div className="border-t border-border pt-4 mb-4">
                    <Label htmlFor="coupon-code" className="text-sm font-medium">Have a coupon?</Label>
                    <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                      <Input
                        id="coupon-code"
                        value={couponCode}
                        onChange={(event) => {
                          setCouponCode(event.target.value.toUpperCase());
                          setCouponError('');
                          setCouponMessage('');
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            handleApplyCoupon();
                          }
                        }}
                        placeholder="Enter coupon code"
                        disabled={Boolean(appliedCoupon) || couponLoading}
                        className="uppercase"
                        data-testid="checkout-coupon-input"
                      />
                      {appliedCoupon ? (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleRemoveCoupon}
                          className="shrink-0"
                          data-testid="remove-coupon-button"
                        >
                          Remove
                        </Button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleApplyCoupon}
                          disabled={couponLoading}
                          className="shrink-0"
                          data-testid="apply-coupon-button"
                        >
                          {couponLoading ? 'Applying...' : 'Apply'}
                        </Button>
                      )}
                    </div>
                    {appliedCoupon ? (
                      <div className="mt-3 rounded-lg border border-[#8B9D83]/30 bg-[#8B9D83]/10 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-medium text-[#52624C]">
                            {appliedCoupon.code} applied
                          </span>
                          <span className="font-medium text-[#52624C]">
                            -{formatCouponCurrency(appliedCoupon.discount_amount)}
                          </span>
                        </div>
                        {couponMessage && (
                          <p className="mt-1 text-xs text-[#52624C]">{couponMessage}</p>
                        )}
                      </div>
                    ) : null}
                    {couponError ? (
                      <p className="mt-2 text-sm text-red-600" data-testid="coupon-error">
                        {couponError}
                      </p>
                    ) : null}
                  </div>

                  <div className="border-t border-border pt-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>₹{getCheckoutDiscountSubtotal().toLocaleString()}</span>
                    </div>
                    {getCheckoutSaving() > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Savings</span>
                        <span className="text-terracotta font-medium">
                          ₹{getCheckoutSaving().toLocaleString()} saved
                        </span>
                      </div>
                    )}
                    {appliedCoupon && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Coupon {appliedCoupon.code}</span>
                        <span className="text-[#8B9D83] font-medium">
                          -{formatCouponCurrency(appliedCoupon.discount_amount)}
                        </span>
                      </div>
                    )}
                    {giftPackaging && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Gift Packaging</span>
                        <span>₹{GIFT_PACKAGING_PRICE}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Shipping</span>
                      <span className="text-[#8B9D83]">Free</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span>Included</span>
                    </div>
                  </div>

                  <div className="border-t border-border mt-4 pt-4">
                    <div className="flex justify-between font-medium">
                      <span>Total</span>
                      <span className="text-xl" data-testid="checkout-total">
                        {appliedCoupon ? formatCouponCurrency(getCouponPreviewTotal()) : `₹${getCouponPreviewTotal().toLocaleString()}`}
                      </span>
                    </div>
                    {appliedCoupon && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Coupon discount is a checkout preview. Payment amount is unchanged until final backend integration.
                      </p>
                    )}
                  </div>

                  <Button 
                    type="submit"
                    className="btn-primary w-full mt-6"
                    disabled={loading}
                    data-testid="place-order-button"
                  >
                    {loading ? 'Opening secure payment...' : 'Proceed to Secure Payment'}
                  </Button>

                  <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" strokeWidth={1.5} />
                    <span>Secure checkout</span>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default CheckoutPage;
