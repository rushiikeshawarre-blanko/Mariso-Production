import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { RadioGroup, RadioGroupItem } from '../components/ui/radio-group';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { createOrder } from '../lib/api';
import { toast } from 'sonner';
import { CreditCard, Smartphone, Building2, Banknote, Lock, ChevronLeft, Gift, Sparkles, Heart, Recycle, Truck, Star } from 'lucide-react';

const CheckoutPage = () => {
  const location = useLocation();
  const { giftPackaging = false, giftNote = '' } = location.state || {};
  const { items, clearCart } = useCart();
  const { user, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('upi');
  
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

  const getFinalTotal = () => {
    return getCheckoutDiscountSubtotal() + (giftPackaging ? GIFT_PACKAGING_PRICE : 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isAuthenticated()) {
      toast.error('Please login to place an order');
      navigate('/login?redirect=/checkout');
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
      const orderData = {
        items: items.map(item => ({
          product_id: item.id,
          quantity: item.quantity
        })),
        billing_name: formData.name,
        billing_phone: formData.phone,
        billing_email: formData.email,
        billing_address: formData.address,
        billing_city: formData.city,
        billing_postal_code: formData.postalCode,
        payment_method: paymentMethod,
        total_price: getFinalTotal()
      };

      const order = await createOrder(orderData);
      clearCart();
      navigate(`/order-success/${order.id}`);
    } catch (error) {
      console.error('Error creating order:', error);
      toast.error('Failed to place order. Please try again.');
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
                  <h2 className="font-heading text-xl mb-6">Payment Method</h2>
                  <RadioGroup value={paymentMethod} onValueChange={setPaymentMethod} className="space-y-4">
                    <label 
                      className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                        paymentMethod === 'upi' ? 'border-foreground bg-muted/30' : 'border-border hover:border-foreground/30'
                      }`}
                    >
                      <RadioGroupItem value="upi" id="upi" data-testid="payment-upi" />
                      <Smartphone className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium">UPI</p>
                        <p className="text-sm text-muted-foreground">Pay using any UPI app</p>
                      </div>
                    </label>

                    <label 
                      className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                        paymentMethod === 'card' ? 'border-foreground bg-muted/30' : 'border-border hover:border-foreground/30'
                      }`}
                    >
                      <RadioGroupItem value="card" id="card" data-testid="payment-card" />
                      <CreditCard className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium">Credit / Debit Card</p>
                        <p className="text-sm text-muted-foreground">Visa, Mastercard, RuPay</p>
                      </div>
                    </label>

                    <label 
                      className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                        paymentMethod === 'netbanking' ? 'border-foreground bg-muted/30' : 'border-border hover:border-foreground/30'
                      }`}
                    >
                      <RadioGroupItem value="netbanking" id="netbanking" data-testid="payment-netbanking" />
                      <Building2 className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium">Net Banking</p>
                        <p className="text-sm text-muted-foreground">All major banks supported</p>
                      </div>
                    </label>

                    <label 
                      className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-colors ${
                        paymentMethod === 'cod' ? 'border-foreground bg-muted/30' : 'border-border hover:border-foreground/30'
                      }`}
                    >
                      <RadioGroupItem value="cod" id="cod" data-testid="payment-cod" />
                      <Banknote className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium">Cash on Delivery</p>
                        <p className="text-sm text-muted-foreground">Pay when you receive</p>
                      </div>
                    </label>
                  </RadioGroup>
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
                        <div key={item.id} className="flex gap-4" data-testid={`checkout-item-${item.id}`}>
                          <img
                            src={item.images?.[0] || 'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=100'}
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
                      <span className="text-xl" data-testid="checkout-total">₹{getFinalTotal().toLocaleString()}</span>
                    </div>
                  </div>

                  <Button 
                    type="submit"
                    className="btn-primary w-full mt-6"
                    disabled={loading}
                    data-testid="place-order-button"
                  >
                    {loading ? 'Processing...' : 'Place Order'}
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
