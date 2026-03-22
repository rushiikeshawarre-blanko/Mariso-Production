import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProductCard } from '../components/products/ProductCard';
import { Button } from '../components/ui/button';
import { Checkbox } from '../components/ui/checkbox';
import { Textarea } from '../components/ui/textarea';
import { Minus, Plus, X, ShoppingBag, ArrowRight, Gift, Sparkles } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { getProducts } from '../lib/api';

const CartPage = () => {
  const { items, removeItem, updateQuantity, getCartCount } = useCart();
  const navigate = useNavigate();
  const [giftPackaging, setGiftPackaging] = useState(false);
  const [giftNote, setGiftNote] = useState('');
  const [recommendedProducts, setRecommendedProducts] = useState([]);
  const [stockMap, setStockMap] = useState({});

  const GIFT_PACKAGING_PRICE = 149;

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

          if (item.selectedColorId || item.selectedFlavorId) {
            const variants = product.variants || [];
            const variant = variants.find(
              (v) =>
                v.is_active !== false &&
                v.color_id === item.selectedColorId &&
                v.flavor_id === item.selectedFlavorId
            );

            latestStockMap[getCartStockKey(item)] = variant ? (variant.stock || 0) : 0;
          } else {
            latestStockMap[getCartStockKey(item)] = product.stock || 0;
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
  }, [items]);

  const getItemEffectivePrice = (item) => {
    return item.is_on_sale && (item.sale_price || item.discount_price)
      ? (item.sale_price || item.discount_price)
      : item.price;
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

  const getFinalTotal = () => {
    return getDiscountedSubtotal() + (giftPackaging ? GIFT_PACKAGING_PRICE : 0);
  };

  const getCartItemKey = (item) => {
    return `${item.id}-${item.selectedColorId || 'none'}-${item.selectedFlavorId || 'none'}`;
  };

  const getCartStockKey = (item) => getCartItemKey(item);

  const getItemAvailableStock = (item) => {
    return stockMap[getCartStockKey(item)] ?? item.stock ?? item.variantStock ?? 0;
  };

  const isItemAvailable = (item) => {
    return getItemAvailableStock(item) > 0;
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
        <div className="pt-32 pb-24 min-h-screen" data-testid="cart-page-empty">
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

  return (
    <Layout>
      <div className="pt-32 pb-24 min-h-screen" data-testid="cart-page">
        <div className="max-w-[1440px] mx-auto container-padding">
          <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-12">Shopping Cart</h1>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Cart Items */}
            <div className="lg:col-span-2 space-y-6">
              {items.map((item) => {
                const price = getItemEffectivePrice(item);
                const originalPrice = 
                  item.is_on_sale && (item.sale_price || item.discount_price) 
                  ? item.price 
                  : null;
                const discountPercent = originalPrice ? Math.round((1 - price / originalPrice) * 100) : 0;
                
                return (
                  <div 
                    key={getCartItemKey(item)}
                    className="flex gap-6 p-6 bg-white rounded-xl card-shadow"
                    data-testid={`cart-item-${getCartItemKey(item)}`}
                  >
                    {/* Image */}
                    <Link to={`/product/${item.id}`} className="flex-shrink-0">
                      <img
                        src={item.images?.[0] || 'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=200'}
                        alt={item.name}
                        className="w-24 h-32 md:w-32 md:h-40 object-cover rounded-lg"
                      />
                    </Link>

                    {/* Details */}
                    <div className="flex-1 flex flex-col">
                      <div className="flex justify-between items-start">
                        <div>
                          <Link to={`/product/${item.id}`}>
                            <h3 className="font-heading text-lg hover:text-foreground/70 transition-colors" data-testid={`cart-item-name-${item.id}`}>
                              {item.name}
                            </h3>
                          </Link>
                          <p className="text-sm text-muted-foreground">{item.category_name}</p>
                          {item.selectedColor && (
                            <p className="text-sm text-muted-foreground">Color: {item.selectedColor}</p>
                          )}
                          {!isItemAvailable(item) ? (
                            <p className="text-sm text-destructive font-medium">
                              Out of Stock
                            </p>
                          ) : getItemAvailableStock(item) <= 5 ? (
                            <p className="text-sm text-terracotta font-medium">
                              Only {getItemAvailableStock(item)} left
                            </p>
                          ) : null}
                          {isItemAvailable(item) && !isItemQuantityValid(item) && (
                            <p className="text-sm text-destructive font-medium">
                              Quantity exceeds available stock
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => removeItem(getCartItemKey(item))}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          data-testid={`cart-remove-${getCartItemKey(item)}`}
                        >
                          <X className="h-5 w-5" strokeWidth={1.5} />
                        </button>
                      </div>

                      <div className="mt-auto flex items-end justify-between">
                        {/* Quantity */}
                        <div className="flex items-center border-border rounded-full">
                          <button
                            onClick={() => updateQuantity(getCartItemKey(item), item.quantity - 1)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-full transition-colors"
                            data-testid={`cart-decrease-${getCartItemKey(item)}`}
                          >
                            <Minus className="h-3 w-3" strokeWidth={1.5} />
                          </button>

                          <span className="w-8 text-center text-sm" data-testid={`cart-quantity-${getCartItemKey(item)}`}>
                            {item.quantity}
                          </span>

                          <button
                            onClick={() =>
                              updateQuantity(
                                getCartItemKey(item),
                                Math.min(getItemAvailableStock(item), item.quantity + 1)
                              )
                            }
                            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-full transition-colors disabled:opacity-50"
                            disabled={!isItemAvailable(item) || item.quantity >= getItemAvailableStock(item)}
                            data-testid={`cart-increase-${getCartItemKey(item)}`}
                          >
                            <Plus className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                        </div>

                        {/* Price */}
                        <div className="text-right">
                          <p className={`font-medium ${item.is_on_sale ? 'text-terracotta' : ''}`} data-testid={`cart-item-total-${getCartItemKey(item)}`}>
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
                            ₹{price.toLocaleString()} each
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Gift Packaging Option */}
              <div className="bg-white rounded-xl p-6 card-shadow" data-testid="gift-packaging-section">
                <div className="flex items-start gap-4">
                  <Checkbox
                    id="gift-packaging"
                    checked={giftPackaging}
                    onCheckedChange={setGiftPackaging}
                    data-testid="gift-packaging-checkbox"
                  />
                  <div className="flex-1">
                    <label htmlFor="gift-packaging" className="cursor-pointer">
                      <div className="flex items-center gap-2 mb-1">
                        <Gift className="h-5 w-5 text-terracotta" strokeWidth={1.5} />
                        <span className="font-medium">Add Gift Packaging</span>
                        <span className="text-sm text-muted-foreground">+ ₹{GIFT_PACKAGING_PRICE}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Premium gift wrap with ribbon and a custom note card
                      </p>
                    </label>
                    
                    {giftPackaging && (
                      <div className="mt-4">
                        <Textarea
                          placeholder="Add a personal message for the gift recipient..."
                          value={giftNote}
                          onChange={(e) => setGiftNote(e.target.value)}
                          className="resize-none"
                          rows={3}
                          data-testid="gift-note-input"
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl p-8 card-shadow sticky top-32">
                <h2 className="font-heading text-xl mb-6">Order Summary</h2>
                
                <div className="space-y-4 mb-6">
                  {getDiscountAmount() > 0 ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Original Subtotal ({getCartCount()} items)</span>
                      <span className="line-through text-muted-foreground">
                        ₹{getOriginalSubtotal().toLocaleString()}
                      </span>
                    </div>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal ({getCartCount()} items)</span>
                      <span>₹{getOriginalSubtotal().toLocaleString()}</span>
                    </div>
                  )}
                  {getDiscountAmount() > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Discount</span>
                      <span className="text-terracotta font-medium">
                        ₹{getDiscountAmount().toLocaleString()} saved
                      </span>
                    </div>
                  )}
                  {giftPackaging && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Gift Packaging</span>
                      <span>₹{GIFT_PACKAGING_PRICE}</span>
                    </div>
                  )}
                  {getDiscountAmount() > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>₹{getDiscountedSubtotal().toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="text-[#8B9D83]">Free</span>
                  </div>
                </div>

                <div className="border-t border-border pt-4 mb-8">
                  <div className="flex justify-between font-medium">
                    <span>Total</span>
                    <span className="text-xl" data-testid="cart-total">₹{getFinalTotal().toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Including taxes</p>
                </div>

                <Button 
                  onClick={() => navigate('/checkout', { state: { giftPackaging, giftNote } })}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
                {recommendedProducts.map((product) => (
                  <ProductCard key={product.id} product={product} testIdPrefix="recommended" />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default CartPage;
