import React from 'react';
import { Link } from 'react-router-dom';
import { Heart } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { addToWishlist } from '../../lib/api';

export const ProductCard = ({ product, testIdPrefix = 'product' }) => {
  const { addItem } = useCart();
  const { isAuthenticated } = useAuth();

  const price = product.is_on_sale && product.sale_price ? product.sale_price : product.price;
  const originalPrice = product.is_on_sale && product.sale_price ? product.price : null;

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();
    addItem(product);
    toast.success('Added to cart', {
      description: product.name
    });
  };

  const handleAddToWishlist = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated()) {
      toast.error('Please login to add items to wishlist');
      return;
    }
    try {
      await addToWishlist(product.id);
      toast.success('Added to wishlist');
    } catch (error) {
      toast.error('Failed to add to wishlist');
    }
  };

  return (
    <Link 
      to={`/product/${product.id}`}
      className="product-card group block"
      data-testid={`${testIdPrefix}-card-${product.id}`}
    >
      {/* Image */}
      <div className="product-image-wrapper relative">
        {product.is_on_sale && (
          <span className="sale-badge" data-testid={`${testIdPrefix}-sale-badge`}>
            Sale
          </span>
        )}
        <img
          src={product.images?.[0] || 'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800'}
          alt={product.name}
          className="product-image"
          loading="lazy"
        />
        {/* Hover Actions */}
        <div className="absolute inset-0 bg-foreground/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6 gap-2">
          <Button
            onClick={handleAddToCart}
            className="bg-white/90 backdrop-blur-sm text-foreground hover:bg-white px-6 h-10 rounded-full text-sm font-medium shadow-lg"
            data-testid={`${testIdPrefix}-add-to-cart`}
          >
            Add to Cart
          </Button>
          <Button
            onClick={handleAddToWishlist}
            variant="ghost"
            size="icon"
            className="bg-white/90 backdrop-blur-sm hover:bg-white rounded-full shadow-lg"
            data-testid={`${testIdPrefix}-add-to-wishlist`}
          >
            <Heart className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="mt-4 space-y-1">
        <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
          {product.category_name}
        </p>
        <h3 className="font-heading text-lg text-foreground group-hover:text-foreground/80 transition-colors" data-testid={`${testIdPrefix}-name`}>
          {product.name}
        </h3>
        <div className="flex items-center gap-2">
          <span className={`font-medium ${product.is_on_sale ? 'text-terracotta' : 'text-foreground'}`} data-testid={`${testIdPrefix}-price`}>
            ₹{price.toLocaleString()}
          </span>
          {originalPrice && (
            <span className="price-original" data-testid={`${testIdPrefix}-original-price`}>
              ₹{originalPrice.toLocaleString()}
            </span>
          )}
        </div>
        {product.stock <= 5 && product.stock > 0 && (
          <p className="text-xs text-terracotta">Only {product.stock} left</p>
        )}
        {product.stock === 0 && (
          <p className="text-xs text-destructive">Out of stock</p>
        )}
      </div>
    </Link>
  );
};

export default ProductCard;
