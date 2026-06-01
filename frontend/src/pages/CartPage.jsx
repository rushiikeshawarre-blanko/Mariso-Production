import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProductCard } from '../components/products/ProductCard';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '../components/ui/dialog';
import { useAuth0 } from '@auth0/auth0-react';
import { Minus, Plus, X, ShoppingBag, ArrowRight, Gift, Sparkles, CheckCircle2 } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { getAvailableCoupons, getProducts, validateCoupon } from '../lib/api';
import { formatINR } from '../lib/currency';
import { getFirstImageUrl, getProductPath, getThumbImage } from '../lib/utils';

const getLegacyGiftOption = (item) => ({
  id: null,
  title: item.gift_packaging_title || 'Add Gift Packaging',
  description: item.gift_packaging_description || 'Premium gift wrap with ribbon and a custom note card',
  price: item.gift_packaging_price ?? 149,
  message_enabled: item.gift_message_enabled !== false,
});

const getActiveGiftOptions = (item) => {
  if (item.show_gift_packaging !== true) return [];
  if (!Array.isArray(item.gift_packaging_options) || item.gift_packaging_options.length === 0) {
    return [getLegacyGiftOption(item)];
  }
  return item.gift_packaging_options
    .filter((option) => option.is_active !== false)
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
};

const getSelectedGiftOption = (item, activeOptions = getActiveGiftOptions(item)) => {
  if (item.gift_packaging?.selected !== true) return null;
  if (!item.gift_packaging.option_id) return getLegacyGiftOption(item);
  return activeOptions.find((option) => option.id === item.gift_packaging.option_id) || null;
};

const isPackItem = (item) => item.sell_as_pack === true;
const CART_FREE_SHIPPING_THRESHOLD = 3000;
const getPackSize = (item) => Math.max(Number(item.pack_size) || 1, 1);
const getPackLabel = (item) => item.selectedPackLabel || item.pack_label || (getPackSize(item) === 1 ? 'Single' : `Pack of ${getPackSize(item)}`);
const getPiecesPerPack = (item) => Math.max(Number(item.pieces_per_pack) || getPackSize(item) || 1, 1);
const getTotalUnits = (item) => isPackItem(item) ? item.quantity * getPiecesPerPack(item) : item.quantity;
const getPriceNumber = (value) => {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};
const getItemPricing = (item) => {
  const regularPrice = getPriceNumber(item.price) ?? 0;
  const salePrice = getPriceNumber(item.sale_price) ?? getPriceNumber(item.discount_price);
  const isOnSale = salePrice != null && salePrice < regularPrice;

  return {
    price: isOnSale ? salePrice : regularPrice,
    originalPrice: isOnSale ? regularPrice : null,
  };
};

const CartPage = () => {
  const { items, removeItem, updateQuantity, updateGiftPackaging, getCartCount } = useCart();
  const { user } = useAuth0();
  const navigate = useNavigate();
  const [checkoutDialogOpen, setCheckoutDialogOpen] = useState(false);
  const [recommendedProducts, setRecommendedProducts] = useState([]);
  const [stockMap, setStockMap] = useState({});
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [availableCouponsLoading, setAvailableCouponsLoading] = useState(false);
  const [availableCouponsError, setAvailableCouponsError] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponLoading, setCouponLoading] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponMessage, setCouponMessage] = useState('');
  const [couponError, setCouponError] = useState('');
  const [appliedCouponCartSignature, setAppliedCouponCartSignature] = useState('');

  const getCartItemKey = useCallback((item) => {
    if (item.variantId) {
      return `${item.id}-${item.variantId}`;
    }
    return `${item.id}-${item.selectedColorId || 'none'}-${item.selectedFlavorId || 'none'}-${item.selectedPackId || 'none'}`;
  }, []);

  const getCartStockKey = useCallback((item) => getCartItemKey(item), [getCartItemKey]);

  const normalizeVariantId = (value) => value ?? null;

  const cartSignature = items
    .map((item) => [
      item.id,
      item.variantId || '',
      item.selectedColorId || '',
      item.selectedFlavorId || '',
      item.selectedPackId || '',
      item.quantity,
      getItemPricing(item).price,
    ].join(':'))
    .join('|');

  const getCartItemImage = (item) => {
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
      'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=200'
    );
  };  

  useEffect(() => {
    const fetchRecommendations = async () => {
      try {
        const products = await getProducts();
        // Get products not in cart
        const cartIds = items.map(item => item.id);
        const recommendations = products
          .filter(p => !cartIds.includes(p.id))
          .slice(0, 4);
        setRecommendedProducts(recommendations);
      } catch (error) {
        console.error('Error fetching recommendations:', error);
      }
    };

    if (items.length > 0) {
      fetchRecommendations();
    }
  }, [items]);

  useEffect(() => {
    const fetchStock = async () => {
      try {
        const products = await getProducts();
        const latestStockMap = {};

        items.forEach((item) => {
          const product = products.find((p) => p.id === item.id);

          if (!product) {
            latestStockMap[getCartStockKey(item)] = 0;
            return;
          }

          if (item.variantId || item.selectedColorId || item.selectedFlavorId) {
            const variants = product.variants || [];
            const variant = variants.find((v) => {
              if (item.variantId) {
                return v.is_active !== false && v.id === item.variantId;
              }

              return (
                v.is_active !== false &&
                normalizeVariantId(v.color_id) === normalizeVariantId(item.selectedColorId) &&
                normalizeVariantId(v.flavor_id) === normalizeVariantId(item.selectedFlavorId)
              );
            });

            const stock = variant ? (variant.stock || 0) : 0;
            latestStockMap[getCartStockKey(item)] = stock;
          } else {
            const stock = product.stock || 0;
            latestStockMap[getCartStockKey(item)] = stock;
          }
        });

        setStockMap(latestStockMap);
      } catch (error) {
        console.error('Error fetching stock:', error);
      }
    };

    if (items.length > 0) {
      fetchStock();
    } else {
      setStockMap({});
    }
  }, [items, getCartStockKey]);

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
          price: getItemPricing(item).price,
        }));

        const result = await getAvailableCoupons({
          items: couponItems,
          surface: 'cart',
          user_id: user?.sub || user?.id || undefined,
          email: user?.email || undefined,
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
  }, [cartSignature, items, user?.email, user?.id, user?.sub]);

  const getItemEffectivePrice = (item) => {
    return getItemPricing(item).price;
  };

  const getOriginalSubtotal = () => {
    return items.reduce((total, item) => total + (item.price * item.quantity), 0);
  };

  const getDiscountedSubtotal = () => {
    return items.reduce((total, item) => total + (getItemEffectivePrice(item) * item.quantity), 0);
  };

  const getDiscountAmount = () => {
    return getOriginalSubtotal() - getDiscountedSubtotal();
  };

  const buildCouponValidationItems = () => {
    return items.map((item) => ({
      product_id: item.product_id || item.id || item.product?.id || '',
      category_id: item.category_id || item.categoryId || item.product?.category_id || '',
      quantity: item.quantity,
      price: getItemEffectivePrice(item),
    }));
  };

  const getCouponDiscountAmount = () => {
    return appliedCoupon ? Number(appliedCoupon.discount_amount || 0) : 0;
  };

  const getPayableItemsTotal = () => {
    return Math.max(getDiscountedSubtotal() - getCouponDiscountAmount(), 0);
  };

  const getShippingLabel = () => {
    const allItemsFreeShipping = items.length > 0 && items.every((item) => (
      item.free_shipping === true || item.show_free_shipping === true
    ));
    return allItemsFreeShipping || getPayableItemsTotal() >= CART_FREE_SHIPPING_THRESHOLD
      ? 'Free'
      : 'Calculated at checkout';
  };

  const getGiftPackagingUnitPrice = (item) => {
    const price = Number(getSelectedGiftOption(item)?.price);
    return Number.isFinite(price) && price >= 0 ? price : 149;
  };

  const getItemGiftPackagingAmount = (item) => {
    if (item.gift_packaging?.selected !== true) {
      return 0;
    }

    return getGiftPackagingUnitPrice(item) * item.gift_packaging.quantity;
  };

  const getGiftPackagingTotal = () => {
    return items.reduce((total, item) => total + getItemGiftPackagingAmount(item), 0);
  };

  const getFinalTotal = () => {
    return getPayableItemsTotal() + getGiftPackagingTotal();
  };

  const getWordCount = (message) => {
    const trimmedMessage = String(message || '').trim();
    return trimmedMessage ? trimmedMessage.split(/\s+/).length : 0;
  };

  const limitGiftMessage = (message) => {
    const words = String(message || '').trim().split(/\s+/).filter(Boolean);
    return words.length > 150 ? words.slice(0, 150).join(' ') : message;
  };

  const selectGiftOption = (item, option) => {
    updateGiftPackaging(getCartItemKey(item), {
      selected: true,
      option_id: option.id || null,
      quantity: item.quantity,
      message: '',
    });
  };

  const handleGiftPackagingChange = (item, checked, option) => {
    updateGiftPackaging(
      getCartItemKey(item),
      checked === true
        ? { selected: true, option_id: option.id || null, quantity: item.quantity, message: '' }
        : null
    );
  };

  const handleGiftQuantityChange = (item, quantity) => {
    updateGiftPackaging(getCartItemKey(item), {
      ...item.gift_packaging,
      selected: true,
      quantity: Number(quantity),
    });
  };

  const handleGiftMessageChange = (item, message) => {
    updateGiftPackaging(getCartItemKey(item), {
      ...item.gift_packaging,
      selected: true,
      message: limitGiftMessage(message),
    });
  };

  const formatCouponDiscount = (coupon) => {
    if (!coupon) return '';
    if (coupon.discount_type === 'percentage') {
      return `${coupon.discount_value}% off`;
    }
    return `${formatINR(coupon.discount_value)} off`;
  };

  const formatCouponDate = (dateValue) => {
    if (!dateValue) return '';
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const feedbackReward = availableCoupons.find((offer) => offer.source === 'feedback_reward');
  const visibleAvailableCoupons = feedbackReward
    ? availableCoupons.filter((offer) => offer.code !== feedbackReward.code)
    : availableCoupons;
  const isFeedbackRewardApplied = Boolean(
    appliedCoupon
    && feedbackReward
    && appliedCoupon.code === feedbackReward.code
  );

  useEffect(() => {
    if (appliedCoupon && appliedCouponCartSignature && appliedCouponCartSignature !== cartSignature) {
      setAppliedCoupon(null);
      setCouponMessage('');
      setCouponError('Cart changed. Please apply the coupon again.');
      setAppliedCouponCartSignature('');
    }
  }, [appliedCoupon, appliedCouponCartSignature, cartSignature]);

  useEffect(() => {
    if (!appliedCoupon || availableCouponsLoading) return;

    const refreshedCoupon = availableCoupons.find((offer) => offer.code === appliedCoupon.code);
    if (!refreshedCoupon) return;

    if (!refreshedCoupon.is_applicable) {
      setAppliedCoupon(null);
      setCouponMessage('');
      setCouponError('Coupon is no longer available for this cart.');
      setAppliedCouponCartSignature('');
      return;
    }

    if (refreshedCoupon.discount_amount !== appliedCoupon.discount_amount) {
      setAppliedCoupon(refreshedCoupon);
    }
  }, [appliedCoupon, availableCoupons, availableCouponsLoading]);

  const handleApplyCoupon = async (codeOverride = '') => {
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
        email: user?.email || undefined,
      });

      if (!result?.valid) {
        setAppliedCoupon(null);
        setCouponError(result?.message || 'Coupon could not be applied.');
        return;
      }

      const sourceOffer = availableCoupons.find((offer) => offer.code === (result.code || normalizedCode));
      setAppliedCoupon({
        ...result,
        source: result?.coupon_snapshot?.source || sourceOffer?.source,
      });
      setCouponCode(result.code || normalizedCode);
      setAppliedCouponCartSignature(cartSignature);
      setCouponMessage(`${result.code || normalizedCode} applied — You saved ${formatINR(result.discount_amount)}`);
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
    setAppliedCouponCartSignature('');
  };

  const confirmCheckout = () => {
    setCheckoutDialogOpen(false);
    navigate('/checkout', { state: { couponCode: appliedCoupon?.code } });
  };

  const continueShoppingFromDialog = () => {
    setCheckoutDialogOpen(false);
    navigate('/shop');
  };


  const getItemAvailableStock = (item) => {
    return stockMap[getCartStockKey(item)] ?? item.variantStock ?? item.stock ?? 0;
  };

  const isItemAvailable = (item) => {
    return getItemAvailableStock(item) > 0;
  };

  const getRemainingAddableStock = (item) => {
    return Math.max(0, getItemAvailableStock(item) - item.quantity);
  };

  const isItemQuantityValid = (item) => {
    return item.quantity <= getItemAvailableStock(item);
  };

  const hasInvalidCartItems = () => {
    return items.some((item) => !isItemAvailable(item) || !isItemQuantityValid(item));
  };

  if (items.length === 0) {
    return (
      <Layout>
        <div className="pt-8 pb-24 min-h-screen md:pt-10" data-testid="cart-page-empty">
          <div className="max-w-[1440px] mx-auto container-padding text-center">
            <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-6" strokeWidth={1} />
            <h1 className="font-heading text-3xl md:text-4xl mb-4">Your Cart is Empty</h1>
            <p className="text-muted-foreground mb-8">Looks like you haven't added anything yet.</p>
            <Link to="/shop">
              <Button className="btn-primary" data-testid="continue-shopping-empty">
                Continue Shopping
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const shippingLabel = getShippingLabel();
  const isShippingNotCalculated = shippingLabel === 'Calculated at checkout';

  return (
    <Layout>
      <div className="pt-8 pb-24 min-h-screen md:pt-10" data-testid="cart-page">
        <div className="max-w-[1440px] mx-auto container-padding">
          <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-12">Shopping Cart</h1>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-6">
              {items.map((item) => {
                const productPath = getProductPath(item) || '/shop';
                const { price, originalPrice } = getItemPricing(item);
                const discountPercent = originalPrice ? Math.round((1 - price / originalPrice) * 100) : 0;
                const cartItemKey = getCartItemKey(item);
                const giftSelected = item.gift_packaging?.selected === true;
                const activeGiftOptions = getActiveGiftOptions(item);
                const selectedGiftOption = getSelectedGiftOption(item, activeGiftOptions);
                const giftUnitPrice = getGiftPackagingUnitPrice(item);
                
                return (
                  <div 
                    key={cartItemKey}
                    className="flex flex-col gap-4 rounded-xl bg-white p-4 card-shadow sm:flex-row sm:gap-6 sm:p-6"
                    data-testid={`cart-item-${cartItemKey}`}
                  >
                    {/* Image */}
                    <Link to={productPath} className="flex-shrink-0">
                      <img
                        src={getCartItemImage(item)}
                        alt={item.name}
                        className="h-32 w-24 rounded-lg object-cover sm:h-36 sm:w-28 md:h-40 md:w-32"
                      />
                    </Link>

                    {/* Details */}
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <Link to={productPath}>
                            <h3 className="font-heading text-lg hover:text-foreground/70 transition-colors" data-testid={`cart-item-name-${item.id}`}>
                              {item.name}
                            </h3>
                          </Link>
                          <p className="text-sm text-muted-foreground">{item.category_name}</p>
                          {item.selectedColor && (
                            <p className="text-sm text-muted-foreground">Color: {item.selectedColor}</p>
                          )}
                          {isPackItem(item) && (
                            <>
                              <p className="text-sm text-muted-foreground">
                                {getPackLabel(item)} × {item.quantity}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Includes {getPiecesPerPack(item)} pieces each
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Total pieces: {getTotalUnits(item)}
                              </p>
                            </>
                          )}
                          {!isItemAvailable(item) ? (
                            <p className="text-sm text-destructive font-medium">
                              Out of Stock
                            </p>
                          ) : getRemainingAddableStock(item) === 0 ? (
                            <p className="text-sm text-muted-foreground font-medium">
                              No more {isPackItem(item) ? 'packs' : 'available'}
                            </p>
                          ) : getRemainingAddableStock(item) <= 5 ? (
                            <p className="text-sm text-terracotta font-medium">
                              Only {getRemainingAddableStock(item)} more {isPackItem(item) ? 'packs' : 'available'}
                            </p>
                          ) : null}
                          {isItemAvailable(item) && !isItemQuantityValid(item) && (
                            <p className="text-sm text-destructive font-medium">
                              Quantity exceeds available {isPackItem(item) ? 'packs' : 'stock'}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeItem(cartItemKey)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          data-testid={`cart-remove-${cartItemKey}`}
                          aria-label={`Remove ${item.name} from cart`}
                        >
                          <X className="h-5 w-5" strokeWidth={1.5} />
                        </button>
                      </div>

                      <div className="mt-4 flex flex-col gap-4 sm:mt-auto sm:flex-row sm:items-end sm:justify-between">
                        {/* Quantity */}
                        <div className="flex items-center rounded-full border border-border">
                          <button
                            onClick={() => updateQuantity(cartItemKey, item.quantity - 1)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-full transition-colors"
                            data-testid={`cart-decrease-${cartItemKey}`}
                            aria-label={`Decrease quantity of ${item.name}`}
                          >
                            <Minus className="h-3 w-3" strokeWidth={1.5} />
                          </button>

                          <span className="w-8 text-center text-sm" data-testid={`cart-quantity-${cartItemKey}`}>
                            {item.quantity}
                          </span>

                          <button
                            onClick={() =>
                              updateQuantity(
                                cartItemKey,
                                Math.min(getItemAvailableStock(item), item.quantity + 1)
                              )
                            }
                            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-full transition-colors disabled:opacity-50"
                            disabled={!isItemAvailable(item) || item.quantity >= getItemAvailableStock(item)}
                            data-testid={`cart-increase-${cartItemKey}`}
                            aria-label={`Increase quantity of ${item.name}`}
                          >
                            <Plus className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                        </div>

                        {/* Price */}
                        <div className="text-left sm:text-right">
                          <p className={`font-medium ${item.is_on_sale ? 'text-terracotta' : ''}`} data-testid={`cart-item-total-${cartItemKey}`}>
                            ₹{(price * item.quantity).toLocaleString()}
                          </p>
                          {originalPrice && (
                            <div className="flex items-center gap-2 justify-end">
                              <p className="text-sm text-muted-foreground line-through">
                                ₹{(originalPrice * item.quantity).toLocaleString()}
                              </p>
                              <span className="text-xs text-terracotta">-{discountPercent}%</span>
                            </div>
                          )}
                          <p className="text-xs text-muted-foreground">
                            ₹{price.toLocaleString()} {isPackItem(item) ? 'per pack' : 'each'}
                          </p>
                        </div>
                      </div>
                      {activeGiftOptions.length > 0 && (
                        <div className="mt-5 border-t border-border pt-4" data-testid={`cart-item-gift-section-${cartItemKey}`}>
                          {activeGiftOptions.length === 1 ? (
                            <div className="flex items-start gap-3">
                              <Checkbox
                                id={`gift-packaging-${cartItemKey}`}
                                checked={giftSelected}
                                onCheckedChange={(checked) => handleGiftPackagingChange(item, checked, activeGiftOptions[0])}
                                data-testid={`cart-item-gift-checkbox-${cartItemKey}`}
                              />
                              <label htmlFor={`gift-packaging-${cartItemKey}`} className="min-w-0 flex-1 cursor-pointer">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <Gift className="h-4 w-4 text-terracotta" strokeWidth={1.5} />
                                  <span className="font-medium">
                                    {activeGiftOptions[0].title}
                                  </span>
                                  <span className="text-sm text-muted-foreground">+ {formatINR(activeGiftOptions[0].price)} each</span>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {activeGiftOptions[0].description}
                                </p>
                              </label>
                            </div>
                          ) : (
                            <div>
                              <div className="mb-3 flex items-center gap-2">
                                <Gift className="h-4 w-4 text-terracotta" strokeWidth={1.5} />
                                <p className="font-medium">Choose gift packaging</p>
                              </div>
                              <div className="space-y-2">
                                {activeGiftOptions.map((option) => {
                                  const optionSelected = giftSelected && item.gift_packaging.option_id === option.id;
                                  return (
                                    <button
                                      type="button"
                                      key={option.id}
                                      onClick={() => selectGiftOption(item, option)}
                                      className={`w-full rounded-lg border p-3 text-left transition-colors ${optionSelected ? 'border-terracotta bg-terracotta/10' : 'border-border hover:bg-muted/40'}`}
                                      data-testid={`cart-item-gift-option-${option.id}`}
                                    >
                                      <span className="flex items-center justify-between gap-3">
                                        <span className="font-medium">{option.title}</span>
                                        <span className="text-sm">+ {formatINR(option.price)} each</span>
                                      </span>
                                      {option.description && (
                                        <span className="mt-1 block text-sm text-muted-foreground">{option.description}</span>
                                      )}
                                    </button>
                                  );
                                })}
                              </div>
                              {giftSelected && (
                                <button
                                  type="button"
                                  onClick={() => updateGiftPackaging(cartItemKey, null)}
                                  className="mt-2 text-sm text-muted-foreground underline"
                                >
                                  Remove gift packaging
                                </button>
                              )}
                            </div>
                          )}
                          {giftSelected && selectedGiftOption && (
                            <div className="mt-4 space-y-4 pl-0 sm:pl-7">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <Label htmlFor={`gift-quantity-${cartItemKey}`} className="text-sm">
                                      quantity
                                    </Label>
                                    <div className="flex items-center rounded-full border border-border">
                                      <button
                                        type="button"
                                        onClick={() => handleGiftQuantityChange(item, item.gift_packaging.quantity - 1)}
                                        className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted disabled:opacity-50"
                                        disabled={item.gift_packaging.quantity <= 1}
                                        data-testid={`cart-item-gift-decrease-${cartItemKey}`}
                                        aria-label={`Decrease gift packaging quantity for ${item.name}`}
                                      >
                                        <Minus className="h-3 w-3" strokeWidth={1.5} />
                                      </button>
                                      <span className="w-8 text-center text-sm" data-testid={`cart-item-gift-quantity-${cartItemKey}`}>
                                        {item.gift_packaging.quantity}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleGiftQuantityChange(item, item.gift_packaging.quantity + 1)}
                                        className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted disabled:opacity-50"
                                        disabled={item.gift_packaging.quantity >= item.quantity}
                                        data-testid={`cart-item-gift-increase-${cartItemKey}`}
                                        aria-label={`Increase gift packaging quantity for ${item.name}`}
                                      >
                                        <Plus className="h-3 w-3" strokeWidth={1.5} />
                                      </button>
                                    </div>
                                    <span className="text-sm text-muted-foreground">
                                      {formatINR(getItemGiftPackagingAmount(item))}
                                    </span>
                                  </div>
                                  {selectedGiftOption.message_enabled !== false && (
                                    <div>
                                      <Textarea
                                        aria-label={`Gift message for ${item.name}`}
                                        placeholder="Add a personal message for the gift recipient..."
                                        value={item.gift_packaging.message}
                                        onChange={(event) => handleGiftMessageChange(item, event.target.value)}
                                        className="resize-none"
                                        rows={3}
                                        data-testid={`cart-item-gift-message-${cartItemKey}`}
                                      />
                                      <p className="mt-1 text-right text-xs text-muted-foreground">
                                        {getWordCount(item.gift_packaging.message)}/150 words
                                      </p>
                                    </div>
                                  )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="sticky top-32 rounded-xl bg-white p-5 card-shadow sm:p-8">
                <h2 className="font-heading text-xl mb-6">Order Summary</h2>
                
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">Original Subtotal ({getCartCount()} items)</span>
                    <span className={getDiscountAmount() > 0 ? 'text-muted-foreground line-through' : ''}>
                      {formatINR(getOriginalSubtotal())}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">Product Discount / Savings</span>
                    <span className="font-medium text-terracotta">
                      -{formatINR(getDiscountAmount())}
                    </span>
                  </div>
                  {appliedCoupon && (
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">Coupon {appliedCoupon.code}</span>
                      <span className="font-medium text-[#52624C]">
                        -{formatINR(getCouponDiscountAmount())}
                      </span>
                    </div>
                  )}
                  {getGiftPackagingTotal() > 0 && (
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">Gift Packaging</span>
                      <span>{formatINR(getGiftPackagingTotal())}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className={shippingLabel === 'Free' ? 'text-[#8B9D83]' : 'text-muted-foreground'}>
                      {shippingLabel}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">Tax</span>
                    <span>Included</span>
                  </div>
                </div>

                <div className="border-t border-border pt-4 mb-8">
                  <div className="flex items-end justify-between gap-4 font-medium">
                    <span>{isShippingNotCalculated ? 'Total before shipping' : 'Total Payable'}</span>
                    <span className="text-2xl text-[#52624C]" data-testid="cart-total">{formatINR(getFinalTotal())}</span>
                  </div>
                  {isShippingNotCalculated && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Final payable amount may change after shipping is calculated.
                    </p>
                  )}
                </div>

                <div className="mb-8 border-t border-border pt-5">
                  <Label htmlFor="cart-coupon-code" className="text-sm font-medium">Have a coupon?</Label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <Input
                      id="cart-coupon-code"
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
                      data-testid="cart-coupon-input"
                    />
                    {appliedCoupon ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRemoveCoupon}
                        className="shrink-0"
                        data-testid="cart-remove-coupon-button"
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
                        data-testid="cart-apply-coupon-button"
                      >
                        {couponLoading ? 'Applying...' : 'Apply'}
                      </Button>
                    )}
                  </div>
                  {appliedCoupon && couponMessage && appliedCoupon.source !== 'feedback_reward' ? (
                    <div className="mt-3 rounded-lg border border-[#8B9D83]/30 bg-[#8B9D83]/10 px-3 py-2 text-sm">
                      <p className="font-medium text-[#52624C]">{couponMessage}</p>
                    </div>
                  ) : null}
                  {couponError ? (
                    <p className="mt-2 text-sm text-red-600" data-testid="cart-coupon-error">
                      {couponError}
                    </p>
                  ) : null}
                </div>

                {feedbackReward && (
                  <div
                    className="mb-8 overflow-hidden rounded-xl border border-[#D6B47A]/45 bg-[#FFF8EA] shadow-sm"
                    data-testid="cart-feedback-reward-card"
                  >
                    <div className="bg-[#52624C] px-4 py-3 text-white">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15">
                          {isFeedbackRewardApplied ? (
                            <CheckCircle2 className="h-4 w-4" strokeWidth={1.7} />
                          ) : (
                            <Gift className="h-4 w-4" strokeWidth={1.7} />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">You have a Mariso reward waiting 🎁</p>
                          <p className="mt-0.5 text-xs text-white/80">
                            {feedbackReward.display_description || feedbackReward.description || 'A thank-you for sharing your feedback.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-heading text-2xl text-[#52624C]">
                            {formatCouponDiscount(feedbackReward)}
                          </p>
                          {feedbackReward.discount_amount ? (
                            <p className="text-xs font-medium text-[#52624C]">
                              Save {formatINR(feedbackReward.discount_amount)} on this cart
                            </p>
                          ) : null}
                        </div>
                        <span className="rounded-full border border-[#D6B47A]/60 bg-white px-3 py-1 font-mono text-xs text-[#52624C]">
                          {feedbackReward.code}
                        </span>
                      </div>

                      <div className="flex flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                        <span>
                          {feedbackReward.end_date || feedbackReward.expiry_date
                            ? `Valid until ${formatCouponDate(feedbackReward.end_date || feedbackReward.expiry_date)}`
                            : 'Available for a limited time'}
                        </span>
                        {feedbackReward.minimum_order_amount ? (
                          <span>Minimum order {formatINR(feedbackReward.minimum_order_amount)}</span>
                        ) : null}
                      </div>

                      {isFeedbackRewardApplied ? (
                        <div className="flex items-center justify-between gap-3 rounded-lg border border-[#8B9D83]/30 bg-white/70 px-3 py-2 text-sm">
                          <span className="font-medium text-[#52624C]">Reward applied</span>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleRemoveCoupon}
                            className="shrink-0"
                          >
                            Remove
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          className="btn-primary w-full"
                          onClick={() => handleApplyCoupon(feedbackReward.code)}
                          disabled={Boolean(appliedCoupon) || couponLoading || !feedbackReward.is_applicable}
                          data-testid="cart-apply-feedback-reward"
                        >
                          {couponLoading ? 'Applying...' : 'Apply Reward'}
                        </Button>
                      )}

                      {!feedbackReward.is_applicable ? (
                        <p className="text-xs text-muted-foreground">{feedbackReward.message}</p>
                      ) : null}
                    </div>
                  </div>
                )}

                {(availableCouponsLoading || visibleAvailableCoupons.length > 0 || availableCouponsError) && (
                  <div className="mb-8 border-t border-border pt-5">
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
                        {visibleAvailableCoupons.map((offer) => {
                          const isApplied = appliedCoupon?.code === offer.code;
                          const isRewardOffer = offer.source === 'feedback_reward';
                          const offerFinalTotal = Math.max(
                            getDiscountedSubtotal() - Number(offer.discount_amount || 0),
                            0
                          ) + getGiftPackagingTotal();

                          return (
                          <div
                            key={offer.coupon_id || offer.code}
                            className="rounded-lg border border-border bg-muted/20 p-3"
                            data-testid={`cart-available-coupon-${offer.code}`}
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-sm font-medium">
                                {isRewardOffer ? 'Mariso feedback reward' : (offer.display_title || offer.code)}
                              </p>
                              <span className="rounded-full bg-white px-2 py-0.5 font-mono text-xs text-[#52624C]">
                                {offer.code}
                              </span>
                            </div>
                            {offer.display_description && !isRewardOffer ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                {offer.display_description}
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <p className={`text-xs ${offer.is_applicable ? 'text-[#52624C]' : 'text-muted-foreground'}`}>
                                {offer.message}
                              </p>
                              {offer.is_applicable && offer.discount_amount ? (
                                <span className="text-xs font-medium text-[#52624C]">
                                  Save {formatINR(offer.discount_amount)}
                                </span>
                              ) : null}
                            </div>
                            {offer.is_applicable ? (
                              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-xs text-muted-foreground">
                                  You pay {formatINR(offerFinalTotal)} with this offer
                                </p>
                                {isApplied ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRemoveCoupon}
                                    className="shrink-0"
                                  >
                                    Remove
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleApplyCoupon(offer.code)}
                                    disabled={Boolean(appliedCoupon) || couponLoading}
                                    className="shrink-0"
                                  >
                                    {isRewardOffer ? 'Apply Reward' : 'Apply'}
                                  </Button>
                                )}
                              </div>
                            ) : null}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                <Button 
                  onClick={() => setCheckoutDialogOpen(true)}
                  className="btn-primary w-full"
                  disabled={hasInvalidCartItems()}
                  data-testid="proceed-to-checkout"
                >
                  {hasInvalidCartItems() ? 'Cart Has Stock Issues' : 'Proceed to Checkout'}
                  <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
                </Button>

                <Link to="/shop" className="block mt-4">
                  <Button variant="ghost" className="w-full" data-testid="continue-shopping">
                    Continue Shopping
                  </Button>
                </Link>

                {/* Why Choose Mariso */}
                <div className="mt-8 pt-6 border-t border-border">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="h-4 w-4 text-terracotta" strokeWidth={1.5} />
                    <span className="text-sm font-medium">Why Choose Mariso?</span>
                  </div>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Handcrafted with care</li>
                    <li>• Premium quality soy wax</li>
                    <li>• Unique candle bouquet designs</li>
                    <li>• Sustainable containers</li>
                    <li>• Supporting traditional craftsmanship</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Recommended Products */}
          {recommendedProducts.length > 0 && (
            <section className="mt-16" data-testid="recommended-products-section">
              <div className="flex items-center gap-2 mb-8">
                <Sparkles className="h-5 w-5 text-terracotta" strokeWidth={1.5} />
                <h2 className="font-heading text-2xl">You Might Also Like</h2>
              </div>
              <div className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-y-12">
                {recommendedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} testIdPrefix="recommended" />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      <Dialog open={checkoutDialogOpen} onOpenChange={setCheckoutDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ready to checkout?</DialogTitle>
            <DialogDescription>
              You can proceed to checkout or continue shopping if you want to add more items.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={confirmCheckout}
              data-testid="confirm-checkout-button"
            >
              Proceed to Checkout
            </Button>

            <Button
              className="flex-1"
              onClick={continueShoppingFromDialog}
              data-testid="continue-shopping-button"
            >
              Shop More
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
};

export default CartPage;
