import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, ShoppingBag } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { useAuth0 } from '@auth0/auth0-react';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { addToWishlist, removeFromWishlist } from '../../lib/api';
import { getProductCardImage, getProductPath } from '../../lib/utils';


const hasActiveOptions = (options) => Array.isArray(options) && options.some((option) => option?.is_active !== false);

const requiresProductOptions = (product) => {
  const hasActiveVariants = Array.isArray(product.variants) && product.variants.some((variant) => variant?.is_active !== false);
  const hasColorOptions = Boolean(product.has_color_options && hasActiveOptions(product.color_options));
  const hasFlavorOptions = Boolean(product.has_flavor_options && hasActiveOptions(product.flavor_options));
  const hasFragranceOptions = hasActiveOptions(product.fragrance_options);

  return hasActiveVariants || hasColorOptions || hasFlavorOptions || hasFragranceOptions;
};

export const ProductCard = ({
  product,
  testIdPrefix = 'product',
  initialIsWishlisted = false,
  onWishlistStateChange,
}) => {
  const { addItem } = useCart();
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();

  const [isWishlisted, setIsWishlisted] = useState(initialIsWishlisted);
  const [isWishlistAnimating, setIsWishlistAnimating] = useState(false);
  const [isWishlistBusy, setIsWishlistBusy] = useState(false);


  const price = product.is_on_sale && product.discount_price ? product.discount_price : product.price;
  const originalPrice = product.is_on_sale && product.discount_price ? product.price : null;
  const discountPercent = originalPrice ? Math.round((1 - price / originalPrice) * 100) : 0;

  const activeVariants = Array.isArray(product.variants)
    ? product.variants.filter((variant) => variant?.is_active !== false)
    : [];
  const totalVariantStock = activeVariants.reduce((sum, variant) => sum + (Number(variant.stock) || 0), 0);

  const hasVariants = activeVariants.length > 0;
  const shouldChooseOptions = requiresProductOptions(product);
  const effectiveStock = hasVariants ? totalVariantStock : (Number(product.stock) || 0);
  const isOutOfStock = effectiveStock <= 0;
  const productPath = getProductPath(product);

  const productCardImage = getProductCardImage(product);

  useEffect(() => {
    setIsWishlisted(initialIsWishlisted);
  }, [initialIsWishlisted, product.id]);

  const handleAddToCart = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (shouldChooseOptions) {
      if (productPath) {
        navigate(productPath);
      }
      return;
    }

    addItem(product);
    toast.success('Added to cart', {
      description: product.name
    });
  };

  const handleAddToWishlist = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isAuthenticated) {
      toast.error('Please sign in to add items to wishlist');
      loginWithRedirect();
      return;
    }

    if (isWishlistBusy) return;

    if (isWishlisted) {
      try {
        setIsWishlistBusy(true);
        setIsWishlistAnimating(true);
        await removeFromWishlist(product.id);
        setIsWishlisted(false);
        if (typeof onWishlistStateChange === 'function') {
          onWishlistStateChange(product.id, false);
        }
        toast.success('Removed from wishlist');
      } catch (error) {
        setIsWishlisted(true);
        toast.error('Failed to remove from wishlist');
      } finally {
        setTimeout(() => {
          setIsWishlistAnimating(false);
        }, 220);
        setIsWishlistBusy(false);
      }
      return;
    }

    try {
      setIsWishlistBusy(true);
      setIsWishlistAnimating(true);
      await addToWishlist(product.id);
      setIsWishlisted(true);
      if (typeof onWishlistStateChange === 'function') {
        onWishlistStateChange(product.id, true);
      }
      toast.success('Added to wishlist');
    } catch (error) {
      setIsWishlisted(false);
      toast.error('Failed to add to wishlist');
    } finally {
      setTimeout(() => {
        setIsWishlistAnimating(false);
      }, 260);
      setIsWishlistBusy(false);
    }
  };

  return (
    <>
      <style>{wishlistAnimationStyle}</style>
      <Link 
      to={productPath || '/shop'}
      className="group flex h-full flex-col transition-transform duration-300 hover:-translate-y-0.5"
      data-testid={`${testIdPrefix}-card-${product.id}`}
    >
      {/* Image */}
      <div className="relative aspect-[3/4] overflow-hidden rounded-[1.1rem] bg-[#F3EEE8]">
        
        <img
          src={productCardImage}
          alt={product.name}
          className="block h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03]"
          loading="lazy"
        />
        
        {/* Quick Action Icons - Top Right */}
        <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <button
            onClick={handleAddToWishlist}
            className={`w-10 h-10 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg transition-all duration-300 ${
              isWishlisted
                ? 'bg-[#F6E7E1] text-terracotta scale-105'
                : 'bg-white/90 text-foreground hover:bg-white hover:scale-105'
            } ${isWishlistBusy ? 'opacity-80 cursor-wait' : ''} ${
              isWishlistAnimating
                ? isWishlisted
                  ? 'animate-[wishlist-pop_0.26s_ease-out]'
                  : 'animate-[wishlist-release_0.22s_ease-out]'
                : ''
            }`}
            title={isWishlisted ? 'Remove from Wishlist' : 'Add to Wishlist'}
            aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
            data-testid={`${testIdPrefix}-wishlist-icon-${product.id}`}
            disabled={isWishlistBusy}
            aria-pressed={isWishlisted}
          >
            <Heart
              className={`h-4 w-4 transition-all duration-300 ${isWishlisted ? 'fill-current scale-110' : 'scale-100'} ${isWishlistBusy ? 'opacity-90' : ''}`}
              strokeWidth={1.5}
            />
          </button>
          <button
            onClick={handleAddToCart}
            className="w-10 h-10 bg-white/90 backdrop-blur-sm rounded-full flex items-center justify-center shadow-lg hover:bg-white hover:scale-110 transition-all"
            title={shouldChooseOptions ? 'Choose Options' : 'Quick Add to Cart'}
            aria-label={shouldChooseOptions ? `Choose options for ${product.name}` : `Add ${product.name} to cart`}
            data-testid={`${testIdPrefix}-quick-cart-icon-${product.id}`}
          >
            <ShoppingBag className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        {/* Hover Add to Cart Button */}
        <div className="absolute inset-x-3 bottom-3 z-20 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <Button
            onClick={handleAddToCart}
            className="w-full bg-white/95 backdrop-blur-sm text-foreground hover:bg-white h-11 rounded-full text-sm font-medium shadow-lg"
            disabled={isOutOfStock}
            data-testid={`${testIdPrefix}-add-to-cart`}
          >
            <ShoppingBag className="h-4 w-4 mr-2" strokeWidth={1.5} />
            {isOutOfStock ? 'Out of Stock' : shouldChooseOptions ? 'Choose Options' : 'Add to Cart'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 flex-col pt-3.5 mt-3">
        <p className="mb-1 text-[10px] uppercase tracking-[0.24em] text-foreground/60 transition-colors duration-300">
          {product.category_name}
        </p>
        <h3 className="mt-1 font-heading text-[1.08rem] leading-[1.3] tracking-[-0.01em] text-foreground group-hover:text-foreground/80 transition-colors duration-300" data-testid={`${testIdPrefix}-name`}>
          {product.name}
        </h3>
        <div className="mt-1 space-y-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={`text-[1.08rem] font-semibold tracking-[-0.01em] transition-colors duration-300 ${product.is_on_sale ? 'text-terracotta' : 'text-foreground'}`} data-testid={`${testIdPrefix}-price`}>
              ₹{price.toLocaleString()}
            </span>
            {originalPrice && (
              <span className="text-[0.72rem] font-medium uppercase tracking-[0.12em] text-terracotta/90">
                {discountPercent}% off
              </span>
            )}
            {effectiveStock <= 5 && effectiveStock > 0 && (
              <span className="text-[11px] text-[#9C6B5B]/90">Only {effectiveStock} left</span>
            )}
            {isOutOfStock && (
              <span className="text-[11px] text-[#9C6B5B]/90">Out of stock</span>
            )}
          </div>
          {originalPrice && (
            <span className="block text-[0.88rem] text-foreground/35 line-through" data-testid={`${testIdPrefix}-original-price`}>
              ₹{originalPrice.toLocaleString()}
            </span>
          )}
        </div>
      </div>
      </Link>
    </>
  );
};

export default ProductCard;

const wishlistAnimationStyle = `
@keyframes wishlist-pop {
  0% { transform: scale(1); }
  45% { transform: scale(1.18); }
  100% { transform: scale(1.05); }
}

@keyframes wishlist-release {
  0% { transform: scale(1.05); }
  50% { transform: scale(0.92); }
  100% { transform: scale(1); }
}
`;
