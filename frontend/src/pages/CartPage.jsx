import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Button } from '../components/ui/button';
import { Minus, Plus, X, ShoppingBag, ArrowRight } from 'lucide-react';
import { useCart } from '../context/CartContext';

const CartPage = () => {
  const { items, removeItem, updateQuantity, getCartTotal, getCartCount } = useCart();
  const navigate = useNavigate();

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
                const price = item.is_on_sale && item.sale_price ? item.sale_price : item.price;
                
                return (
                  <div 
                    key={item.id}
                    className="flex gap-6 p-6 bg-white rounded-xl card-shadow"
                    data-testid={`cart-item-${item.id}`}
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
                        </div>
                        <button
                          onClick={() => removeItem(item.id)}
                          className="text-muted-foreground hover:text-foreground transition-colors"
                          data-testid={`cart-remove-${item.id}`}
                        >
                          <X className="h-5 w-5" strokeWidth={1.5} />
                        </button>
                      </div>

                      <div className="mt-auto flex items-end justify-between">
                        {/* Quantity */}
                        <div className="flex items-center border border-border rounded-full">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-full transition-colors"
                            data-testid={`cart-decrease-${item.id}`}
                          >
                            <Minus className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                          <span className="w-8 text-center text-sm" data-testid={`cart-quantity-${item.id}`}>
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-8 h-8 flex items-center justify-center hover:bg-muted rounded-full transition-colors"
                            data-testid={`cart-increase-${item.id}`}
                          >
                            <Plus className="h-3 w-3" strokeWidth={1.5} />
                          </button>
                        </div>

                        {/* Price */}
                        <div className="text-right">
                          <p className="font-medium" data-testid={`cart-item-total-${item.id}`}>
                            ₹{(price * item.quantity).toLocaleString()}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            ₹{price.toLocaleString()} each
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Order Summary */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl p-8 card-shadow sticky top-32">
                <h2 className="font-heading text-xl mb-6">Order Summary</h2>
                
                <div className="space-y-4 mb-6">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal ({getCartCount()} items)</span>
                    <span data-testid="cart-subtotal">₹{getCartTotal().toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Shipping</span>
                    <span className="text-[#8B9D83]">Free</span>
                  </div>
                </div>

                <div className="border-t border-border pt-4 mb-8">
                  <div className="flex justify-between font-medium">
                    <span>Total</span>
                    <span className="text-xl" data-testid="cart-total">₹{getCartTotal().toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Including taxes</p>
                </div>

                <Button 
                  onClick={() => navigate('/checkout')}
                  className="btn-primary w-full"
                  data-testid="proceed-to-checkout"
                >
                  Proceed to Checkout
                  <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
                </Button>

                <Link to="/shop" className="block mt-4">
                  <Button variant="ghost" className="w-full" data-testid="continue-shopping">
                    Continue Shopping
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CartPage;
