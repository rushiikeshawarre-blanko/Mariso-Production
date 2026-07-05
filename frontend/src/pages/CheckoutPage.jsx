import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { useCart } from '../context/CartContext';
import { useAuth0 } from '@auth0/auth0-react';
import { createCashfreeSession, getAvailableCoupons, previewCashfreeCheckout, validateCoupon } from '../lib/api';
import { loadCashfree } from '../lib/cashfree';
import { formatINR } from '../lib/currency';
import { getCitiesForState, INDIA_STATES, withStoredOption } from '../lib/indiaLocations';
import { cn, getFirstImageUrl, getThumbImage } from '../lib/utils';
import { toast } from 'sonner';
import { CreditCard, Lock, ChevronLeft, Gift, Sparkles, Heart, Recycle, Truck, Star, ShieldCheck } from 'lucide-react';

const getLegacyGiftOption = (item) => ({
  id: null,
  title: item.gift_packaging_title || 'Gift Packaging',
  description: item.gift_packaging_description || '',
  price: item.gift_packaging_price ?? 149,
  message_enabled: item.gift_message_enabled !== false,
});

const getSelectedGiftOption = (item) => {
  if (item.gift_packaging?.selected !== true) return null;
  if (!item.gift_packaging.option_id) return getLegacyGiftOption(item);
  return (item.gift_packaging_options || []).find(
    (option) => option.id === item.gift_packaging.option_id && option.is_active !== false
  ) || null;
};

const isPackItem = (item) => item.sell_as_pack === true;
const CART_FREE_SHIPPING_THRESHOLD = 3000;
const SHIPPING_UNAVAILABLE_MESSAGE = 'Shipping charges could not be calculated for this pincode. Please try another pincode or contact support.';
const getPackSize = (item) => Math.max(Number(item.pack_size) || 1, 1);
const getPackLabel = (item) => item.selectedPackLabel || item.pack_label || (getPackSize(item) === 1 ? 'Single' : `Pack of ${getPackSize(item)}`);
const getPiecesPerPack = (item) => Math.max(Number(item.pieces_per_pack) || getPackSize(item) || 1, 1);
const getTotalUnits = (item) => isPackItem(item) ? item.quantity * getPiecesPerPack(item) : item.quantity;
const getPriceNumber = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const getCheckoutItemPrice = (item) => {
  const regularPrice = getPriceNumber(item.price) ?? 0;
  const salePrice = getPriceNumber(item.sale_price) ?? getPriceNumber(item.discount_price);

  return salePrice != null && salePrice < regularPrice ? salePrice : regularPrice;
};

const CheckoutPage = () => {
  const location = useLocation();
  const { couponCode: couponCodeFromCart = '' } = location.state || {};
  const { items } = useCart();
  const { user, isAuthenticated, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();
  const initialCouponAppliedRef = useRef(false);
  const normalizedCouponCodeFromCart = (couponCodeFromCart || '').trim().toUpperCase();
  const [loading, setLoading] = useState(false);
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [couponError, setCouponError] = useState('');
  const [couponCartSignature, setCouponCartSignature] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [availableCouponsLoading, setAvailableCouponsLoading] = useState(false);
  const [availableCouponsError, setAvailableCouponsError] = useState('');
  const [shippingPreview, setShippingPreview] = useState(null);
  const [shippingPreviewStatus, setShippingPreviewStatus] = useState('idle');
  const [shippingPreviewError, setShippingPreviewError] = useState('');
  const paymentMessage = new URLSearchParams(location.search).get('payment');
  
  const getCheckoutOriginalSubtotal = () => {
    return items.reduce((total, item) => total + (item.price * item.quantity), 0 );
  };
  
  const getCheckoutEffectivePrice =(item) => {
    return getCheckoutItemPrice(item);
  };

  const getCheckoutDiscountSubtotal = () => {
    return items.reduce((total, item) => total + (getCheckoutEffectivePrice(item) * item.quantity), 0 );
  };

  const getGiftPackagingUnitPrice = (item) => {
    const price = Number(getSelectedGiftOption(item)?.price);
    return Number.isFinite(price) && price >= 0 ? price : 149;
  };

  const getItemGiftPackagingAmount = (item) => {
    return item.gift_packaging?.selected === true
      ? getGiftPackagingUnitPrice(item) * item.gift_packaging.quantity
      : 0;
  };

  const getGiftPackagingTotal = () => {
    return items.reduce((total, item) => total + getItemGiftPackagingAmount(item), 0);
  };

  const cartSignature = items
    .map((item) => [
      item.id,
      item.variantId || '',
      item.selectedColorId || '',
      item.selectedFlavorId || '',
      item.selectedPackId || '',
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
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'India'
  });

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleStateChange = (e) => {
    const state = e.target.value;
    setFormData((currentData) => ({
      ...currentData,
      state,
      city: getCitiesForState(state).includes(currentData.city) ? currentData.city : ''
    }));
  };

  const stateOptions = withStoredOption(INDIA_STATES, formData.state);
  const cityOptions = withStoredOption(getCitiesForState(formData.state), formData.city);
  const checkoutInputClassName = 'mt-2 placeholder:text-muted-foreground/70';
  const getCheckoutSelectClassName = (fieldName, className) => cn(
    className,
    !formData[fieldName] && 'text-muted-foreground/70 focus:text-foreground'
  );

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

  const isCheckoutShippingFreeWithoutQuote = useCallback(() => {
    const allItemsFreeShipping = items.length > 0 && items.every((item) => (
      item.free_shipping === true || item.show_free_shipping === true
    ));
    const previewItemsTotal = appliedCoupon
      ? Number(appliedCoupon.final_total || 0)
      : items.reduce((total, item) => total + (getCheckoutItemPrice(item) * item.quantity), 0);
    return allItemsFreeShipping || previewItemsTotal >= CART_FREE_SHIPPING_THRESHOLD;
  }, [appliedCoupon, items]);

  const hasValidShippingPincode = useCallback(
    () => /^\d{6}$/.test(String(formData.postalCode || '').trim()),
    [formData.postalCode],
  );

  const needsShippingQuote = useCallback(
    () => !isCheckoutShippingFreeWithoutQuote(),
    [isCheckoutShippingFreeWithoutQuote],
  );

  const getShippingLabel = () => {
    if (isCheckoutShippingFreeWithoutQuote()) return 'Free';
    if (shippingPreviewStatus === 'loading') return 'Calculating...';
    if (shippingPreviewStatus === 'error') return 'Unable to calculate';
    if (shippingPreviewStatus === 'ready' && shippingPreview) {
      const shippingCharge = Number(shippingPreview.shipping_charge || 0);
      return shippingCharge > 0 ? formatINR(shippingCharge) : 'Free';
    }
    return 'Calculated at checkout';
  };

  const getCouponPreviewTotal = () => {
    return getCouponPreviewItemsTotal() + getGiftPackagingTotal();
  };

  const getCheckoutPreviewTotal = () => {
    if (isCheckoutShippingFreeWithoutQuote()) return getCouponPreviewTotal();
    if (shippingPreviewStatus === 'ready' && shippingPreview?.total_payable != null) {
      return Number(shippingPreview.total_payable);
    }
    return getCouponPreviewTotal();
  };

  const getCheckoutItemImage = (item) => {
    const selectedColor = (item.color_options || []).find(
      (color) => color.id === item.selectedColorId
    );

    return (
      getFirstImageUrl(selectedColor?.images, getThumbImage) ||
      getFirstImageUrl(item.images, getThumbImage) ||
      getFirstImageUrl(
        (item.color_options || [])
          .filter((color) => color?.is_active !== false)
          .flatMap((color) => color?.images || []),
        getThumbImage
      ) ||
      'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=100'
    );
  };  

  const paymentMessageText = {
    expired: 'Payment session expired. Your items are still in your cart. Please try again.',
    failed: 'Payment failed or was cancelled. Your items are still in your cart. Please try again.',
    pending: 'Payment is still pending. You can retry checkout or check your order status.',
    cancelled: 'Payment was cancelled. Your items are still in your cart.',
  }[paymentMessage];

  const buildCouponValidationItems = useCallback(() => {
    return items.map((item) => ({
      product_id: item.product_id || item.id || item.product?.id || '',
      category_id: item.category_id || item.categoryId || item.product?.category_id || '',
      quantity: item.quantity,
      price: getCheckoutItemPrice(item),
    }));
  }, [items]);

  const buildCheckoutItems = useCallback(() => {
    return items.map(item => ({
      product_id: item.id,
      quantity: item.quantity,
      variant_id: item.variantId ?? null,
      color_id: item.selectedColorId ?? null,
      flavor_id: item.selectedFlavorId ?? null,
      selected_pack_id: item.selectedPackId ?? null,
      gift_packaging: item.gift_packaging?.selected === true
          ? {
            selected: true,
            option_id: item.gift_packaging.option_id || null,
            quantity: item.gift_packaging.quantity,
            message: item.gift_packaging.message || '',
          }
        : null,
    }));
  }, [items]);

  const buildCheckoutPayload = useCallback(() => ({
    items: buildCheckoutItems(),
    billing_name: formData.name,
    billing_phone: formData.phone,
    billing_email: formData.email,
    billing_address: formData.address,
    billing_address_2: formData.addressLine2 || undefined,
    billing_city: formData.city,
    billing_state: formData.state,
    billing_country: formData.country,
    billing_postal_code: formData.postalCode,
    gift_packaging: items.some((item) => item.gift_packaging?.selected === true),
    coupon_code: appliedCoupon?.code || undefined,
  }), [appliedCoupon?.code, buildCheckoutItems, formData, items]);

  useEffect(() => {
    let isCurrent = true;

    const fetchAvailableCoupons = async () => {
      if (items.length === 0) {
        setAvailableCoupons([]);
        return;
      }

      setAvailableCouponsLoading(true);
      setAvailableCouponsError('');

      try {
        const couponItems = items.map((item) => ({
          product_id: item.product_id || item.id || item.product?.id || '',
          category_id: item.category_id || item.categoryId || item.product?.category_id || '',
          quantity: item.quantity,
          price: getCheckoutItemPrice(item),
        }));

        const result = await getAvailableCoupons({
          items: couponItems,
          surface: 'checkout',
          user_id: user?.sub || user?.id || undefined,
          email: formData.email || user?.email || undefined,
          phone: formData.phone || undefined,
        });

        if (isCurrent) {
          setAvailableCoupons(Array.isArray(result) ? result : result?.coupons || []);
        }
      } catch (error) {
        console.error('Error fetching available coupons:', error);
        if (isCurrent) {
          setAvailableCoupons([]);
          setAvailableCouponsError('Available offers could not be loaded.');
        }
      } finally {
        if (isCurrent) {
          setAvailableCouponsLoading(false);
        }
      }
    };

    fetchAvailableCoupons();

    return () => {
      isCurrent = false;
    };
  }, [items, formData.email, formData.phone, user?.email, user?.id, user?.sub]);

  const handleApplyCoupon = useCallback(async (codeOverride = '') => {
    const normalizedCode = (codeOverride || couponCode).trim().toUpperCase();
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
  }, [
    appliedCoupon,
    buildCouponValidationItems,
    cartSignature,
    couponCode,
    formData.email,
    formData.phone,
    user?.email,
    user?.id,
    user?.sub,
  ]);

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode('');
    setCouponMessage('');
    setCouponError('');
    setCouponCartSignature('');
  };

  useEffect(() => {
    if (!normalizedCouponCodeFromCart || initialCouponAppliedRef.current || items.length === 0) {
      return;
    }

    initialCouponAppliedRef.current = true;
    setCouponCode(normalizedCouponCodeFromCart);
    handleApplyCoupon(normalizedCouponCodeFromCart);
  }, [handleApplyCoupon, items.length, normalizedCouponCodeFromCart]);

  useEffect(() => {
    let isCurrent = true;

    if (!needsShippingQuote() || items.length === 0 || !isAuthenticated) {
      setShippingPreview(null);
      setShippingPreviewStatus('idle');
      setShippingPreviewError('');
      return () => {
        isCurrent = false;
      };
    }

    if (!hasValidShippingPincode()) {
      setShippingPreview(null);
      setShippingPreviewStatus('idle');
      setShippingPreviewError('');
      return () => {
        isCurrent = false;
      };
    }

    setShippingPreviewStatus('loading');
    setShippingPreviewError('');

    const timer = window.setTimeout(async () => {
      try {
        const payload = buildCheckoutPayload();
        const result = await previewCashfreeCheckout({
          items: payload.items,
          billing_postal_code: payload.billing_postal_code,
          billing_phone: payload.billing_phone || undefined,
          billing_email: payload.billing_email || undefined,
          gift_packaging: payload.gift_packaging,
          coupon_code: payload.coupon_code,
        });

        if (isCurrent) {
          setShippingPreview(result);
          setShippingPreviewStatus('ready');
          setShippingPreviewError('');
        }
      } catch (error) {
        const detail = error?.response?.data?.detail;
        const message = typeof detail === 'string'
          ? detail
          : detail?.message || SHIPPING_UNAVAILABLE_MESSAGE;

        if (isCurrent) {
          setShippingPreview(null);
          setShippingPreviewStatus('error');
          setShippingPreviewError(message);
        }
      }
    }, 500);

    return () => {
      isCurrent = false;
      window.clearTimeout(timer);
    };
  }, [
    appliedCoupon?.code,
    buildCheckoutPayload,
    cartSignature,
    formData.email,
    formData.phone,
    formData.postalCode,
    hasValidShippingPincode,
    isAuthenticated,
    items.length,
    needsShippingQuote,
  ]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (loading) return;
    
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
    if (!formData.name || !formData.phone || !formData.email || !formData.address || !formData.city || !formData.state || !formData.postalCode || !formData.country) {
      toast.error('Please fill in all fields');
      return;
    }

    if (needsShippingQuote() && shippingPreviewStatus !== 'ready') {
      toast.error(shippingPreviewError || 'Please wait while shipping is calculated.');
      return;
    }

    setLoading(true);
    try {
      const checkoutPayload = buildCheckoutPayload();

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
      const detail = error?.response?.data?.detail;
      const message = typeof detail === 'string'
        ? detail
        : detail?.message || 'Unable to start secure payment. Please try again.';

      if (appliedCoupon && message.toLowerCase().includes('coupon')) {
        setCouponError(`${message} Remove or reapply the coupon.`);
        toast.error(message);
      } else {
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <Layout>
        <div className="pt-8 pb-24 min-h-screen md:pt-10">
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
      <div className="pt-8 pb-24 min-h-screen md:pt-10" data-testid="checkout-page">
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
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">
              {/* Billing Details */}
              <div className="contents lg:block lg:col-span-2 lg:space-y-8">
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
                        className={checkoutInputClassName}
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
                        className={checkoutInputClassName}
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
                        className={checkoutInputClassName}
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
                        className={checkoutInputClassName}
                        required
                        data-testid="checkout-address"
                      />
                    </div>
                    <div>
                      <Label htmlFor="addressLine2">Address Line 2 (Optional)</Label>
                      <Input
                        id="addressLine2"
                        name="addressLine2"
                        value={formData.addressLine2}
                        onChange={handleChange}
                        placeholder="Apartment, suite, landmark"
                        className={checkoutInputClassName}
                        data-testid="checkout-address-line-2"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <Label htmlFor="state">State</Label>
                        <select
                          id="state"
                          name="state"
                          value={formData.state}
                          onChange={handleStateChange}
                          className={getCheckoutSelectClassName('state', 'mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm')}
                          required
                          data-testid="checkout-state"
                        >
                          <option value="">Select state</option>
                          {stateOptions.map((state) => (
                            <option key={state} value={state}>{state}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="city">City</Label>
                        <select
                          id="city"
                          name="city"
                          value={formData.city}
                          onChange={handleChange}
                          className={getCheckoutSelectClassName('city', 'mt-2 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50')}
                          required
                          disabled={!formData.state}
                          data-testid="checkout-city"
                        >
                          <option value="">Select city</option>
                          {cityOptions.map((city) => (
                            <option key={city} value={city}>{city}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label htmlFor="postalCode">Postal Code</Label>
                        <Input
                          id="postalCode"
                          name="postalCode"
                          value={formData.postalCode}
                          onChange={handleChange}
                          placeholder="400001"
                          className={checkoutInputClassName}
                          required
                          data-testid="checkout-postal"
                        />
                      </div>
                      <div>
                        <Label htmlFor="country">Country</Label>
                        <Input
                          id="country"
                          name="country"
                          value={formData.country}
                          onChange={handleChange}
                          placeholder="India"
                          className={checkoutInputClassName}
                          required
                          data-testid="checkout-country"
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
                <div className="order-5 lg:order-none bg-terracotta/5 rounded-xl p-8 border border-terracotta/20" data-testid="why-choose-mariso-section">
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
                        <p className="text-xs text-muted-foreground">Eligible items only</p>
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
              <div className="order-4 lg:order-none lg:col-span-1">
                <div className="bg-white rounded-xl p-8 card-shadow sticky top-32">
                  <h2 className="font-heading text-xl mb-6">Order Summary</h2>

                  {/* Items */}
                  <div className="space-y-4 mb-6 max-h-64 overflow-y-auto">
                    {items.map((item) => {
                      const price = getCheckoutEffectivePrice(item);
                      const selectedGiftOption = getSelectedGiftOption(item);
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
                            <p className="text-xs text-muted-foreground">
                              {isPackItem(item) ? `${getPackLabel(item)} × ${item.quantity}` : `Qty: ${item.quantity}`}
                            </p>
                            {isPackItem(item) && (
                              <>
                                <p className="text-xs text-muted-foreground">Includes {getPiecesPerPack(item)} pieces each</p>
                                <p className="text-xs text-muted-foreground">Total pieces: {getTotalUnits(item)}</p>
                              </>
                            )}
                            {item.selectedColor && (
                              <p className="text-xs text-muted-foreground">Color: {item.selectedColor}</p>
                            )}
                            <p className="text-sm mt-1">₹{(price * item.quantity).toLocaleString()}</p>
                            {selectedGiftOption && (
                              <div className="mt-2 rounded-md bg-terracotta/10 p-2 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1 font-medium">
                                    <Gift className="h-3 w-3 text-terracotta" strokeWidth={1.5} />
                                    {selectedGiftOption.title} x {item.gift_packaging.quantity}
                                  </span>
                                  <span>{formatINR(getItemGiftPackagingAmount(item))}</span>
                                </div>
                                {selectedGiftOption.description && (
                                  <p className="mt-1 text-muted-foreground">{selectedGiftOption.description}</p>
                                )}
                                <p className="mt-1 text-muted-foreground">{formatINR(selectedGiftOption.price)} each</p>
                                {selectedGiftOption.message_enabled !== false && item.gift_packaging.message && (
                                  <p className="mt-1 truncate text-muted-foreground">"{item.gift_packaging.message}"</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

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
                          onClick={() => handleApplyCoupon()}
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
                            -{formatINR(appliedCoupon.discount_amount)}
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

                    {(availableCouponsLoading || availableCoupons.length > 0 || availableCouponsError) && (
                      <div className="mt-5 border-t border-border pt-4">
                        <div className="mb-3 flex items-center gap-2">
                          <Gift className="h-4 w-4 text-terracotta" strokeWidth={1.5} />
                          <h3 className="text-sm font-medium">Available Offers</h3>
                        </div>

                        {availableCouponsLoading ? (
                          <p className="text-sm text-muted-foreground">Checking offers...</p>
                        ) : availableCouponsError ? (
                          <p className="text-sm text-muted-foreground">{availableCouponsError}</p>
                        ) : (
                          <div className="space-y-3">
                            {availableCoupons.map((offer) => {
                              const disableApply = Boolean(appliedCoupon) || couponLoading || !offer.is_applicable;
                              return (
                                <div
                                  key={offer.coupon_id || offer.code}
                                  className="rounded-lg border border-border bg-muted/20 p-3"
                                  data-testid={`available-coupon-${offer.code}`}
                                >
                                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-medium">
                                          {offer.display_title || offer.code}
                                        </p>
                                        <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs text-[#52624C]">
                                          {offer.code}
                                        </span>
                                      </div>
                                      {offer.display_description ? (
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {offer.display_description}
                                        </p>
                                      ) : null}
                                      <p className={`mt-1 text-xs ${offer.is_applicable ? 'text-[#52624C]' : 'text-muted-foreground'}`}>
                                        {offer.message}
                                      </p>
                                    </div>
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleApplyCoupon(offer.code)}
                                      disabled={disableApply}
                                      className="shrink-0"
                                    >
                                      {appliedCoupon?.code === offer.code ? 'Applied' : 'Apply'}
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="border-t border-border pt-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatINR(getCheckoutDiscountSubtotal())}</span>
                    </div>
                    {getCheckoutSaving() > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Savings</span>
                        <span className="text-terracotta font-medium">
                          {formatINR(getCheckoutSaving())} saved
                        </span>
                      </div>
                    )}
                    {appliedCoupon && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Coupon {appliedCoupon.code}</span>
                        <span className="text-[#8B9D83] font-medium">
                          -{formatINR(appliedCoupon.discount_amount)}
                        </span>
                      </div>
                    )}
                    {getGiftPackagingTotal() > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Gift Packaging</span>
                        <span>{formatINR(getGiftPackagingTotal())}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Shipping</span>
                      <span className={getShippingLabel() === 'Free' ? 'text-[#8B9D83]' : shippingPreviewStatus === 'error' ? 'text-red-600' : 'text-muted-foreground'}>
                        {getShippingLabel()}
                      </span>
                    </div>
                    {shippingPreviewError ? (
                      <p className="text-sm text-red-600" data-testid="checkout-shipping-error">
                        {shippingPreviewError}
                      </p>
                    ) : null}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tax</span>
                      <span>Included</span>
                    </div>
                  </div>

                  <div className="border-t border-border mt-4 pt-4">
                    <div className="flex justify-between font-medium">
                      <span>{getShippingLabel() === 'Calculated at checkout' ? 'Total before shipping' : 'Total'}</span>
                      <span className="text-xl" data-testid="checkout-total">
                        {formatINR(getCheckoutPreviewTotal())}
                      </span>
                    </div>
                    {(appliedCoupon || shippingPreviewStatus === 'ready') && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Final payable amount is confirmed securely before payment.
                      </p>
                    )}
                  </div>

                  <Button 
                    type="submit"
                    className="btn-primary w-full mt-6"
                    disabled={loading || (isAuthenticated && needsShippingQuote() && hasValidShippingPincode() && shippingPreviewStatus !== 'ready')}
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
