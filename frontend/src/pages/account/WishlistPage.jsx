import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { getWishlist, removeFromWishlist } from '../../lib/api';
import { useCart } from '../../context/CartContext';
import { Button } from '../../components/ui/button';
import { Heart, ShoppingBag, X } from 'lucide-react';
import { toast } from 'sonner';

const WishlistPage = () => {
  const [wishlist, setWishlist] = useState([]);
  const [loading, setLoading] = useState(true);
  const { addItem } = useCart();

  useEffect(() => {
    fetchWishlist();
  }, []);

  const fetchWishlist = async () => {
    try {
      const data = await getWishlist();
      setWishlist(data);
    } catch (error) {
      console.error('Error fetching wishlist:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async (productId) => {
    try {
      await removeFromWishlist(productId);
      setWishlist(wishlist.filter(item => item.id !== productId));
      toast.success('Removed from wishlist');
    } catch (error) {
      toast.error('Failed to remove item');
    }
  };

  const handleAddToCart = (product) => {
    addItem(product);
    toast.success('Added to cart');
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-xl p-4 card-shadow animate-pulse">
            <div className="flex gap-4">
              <div className="w-24 h-32 bg-muted rounded-lg" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (wishlist.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl card-shadow" data-testid="empty-wishlist">
        <Heart className="h-12 w-12 mx-auto text-muted-foreground mb-4" strokeWidth={1} />
        <h2 className="font-heading text-xl mb-2">Your wishlist is empty</h2>
        <p className="text-muted-foreground mb-6">Save items you love for later.</p>
        <Link to="/shop">
          <Button className="btn-primary">Browse Products</Button>
        </Link>
      </div>
    );
  }

  return (
    <div data-testid="wishlist-page">
      <h2 className="font-heading text-2xl mb-6">Your Wishlist</h2>
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {wishlist.map((product) => {
          const price = product.is_on_sale && product.sale_price ? product.sale_price : product.price;
          
          return (
            <div 
              key={product.id} 
              className="bg-white rounded-xl p-4 card-shadow"
              data-testid={`wishlist-item-${product.id}`}
            >
              <div className="flex gap-4">
                <Link to={`/product/${product.id}`}>
                  <img
                    src={product.images?.[0] || 'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=200'}
                    alt={product.name}
                    className="w-24 h-32 object-cover rounded-lg"
                  />
                </Link>
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between">
                    <Link to={`/product/${product.id}`}>
                      <h3 className="font-heading hover:text-foreground/70 transition-colors">
                        {product.name}
                      </h3>
                    </Link>
                    <button
                      onClick={() => handleRemove(product.id)}
                      className="text-muted-foreground hover:text-foreground"
                      data-testid={`remove-wishlist-${product.id}`}
                    >
                      <X className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>
                  <p className="text-sm text-muted-foreground">{product.category_name}</p>
                  <p className="font-medium mt-1">₹{price.toLocaleString()}</p>
                  
                  <div className="mt-auto">
                    <Button
                      onClick={() => handleAddToCart(product)}
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={product.stock === 0}
                      data-testid={`add-to-cart-wishlist-${product.id}`}
                    >
                      <ShoppingBag className="h-4 w-4 mr-2" strokeWidth={1.5} />
                      {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default WishlistPage;
