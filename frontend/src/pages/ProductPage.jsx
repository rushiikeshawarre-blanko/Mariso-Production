import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProductCard } from '../components/products/ProductCard';
import { ProductImageGallery } from '../components/products/ProductImageGallery';
import { Button } from '../components/ui/button';
import MarisoLoader from '../components/ui/MarisoLoader';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Heart, Minus, Plus, ChevronLeft, Truck, RotateCcw, Package, Gift, ShoppingBag, Zap, AlertCircle } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth0 } from '@auth0/auth0-react';
import { getProduct, getProductBySlug, getProducts, addToWishlist } from '../lib/api';
import { htmlToPlainText, sanitizeRichContent } from '../lib/richContent';
import { toast } from 'sonner';

const ProductPage = () => {
  const { id, slug } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productStatus, setProductStatus] = useState('loading');
  const [retryNonce, setRetryNonce] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedFlavor, setSelectedFlavor] = useState(null);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const { addItem } = useCart();
  const { isAuthenticated, loginWithRedirect } = useAuth0();
  const requiresColorSelection = Boolean(product?.has_color_options && product?.color_options?.length > 0);
  const requiresFlavorSelection = Boolean(product?.has_flavor_options && product?.flavor_options?.length > 0);

  const isVariantSelectionComplete =
    (!requiresColorSelection ||  Boolean(selectedColor)) &&
    (!requiresFlavorSelection || Boolean(selectedFlavor));

  // Get variant combination stock
  const getVariantStock = useCallback(() => {
    if (!product) return 0;
    
    const variants = product.variants || [];

    if (!isVariantSelectionComplete && variants.length > 0) {
      return 0;
    } 
    
    // If no variants exist, use base product stock
    if (variants.length === 0) {
      return product.stock || 0;
    }
    
    // Find matching variant for the selected combination
    const colorId = selectedColor?.id || null;
    const flavorId = selectedFlavor?.id || null;
    
    for (const variant of variants) {
      if (
        variant.is_active !== false &&
        variant.color_id === colorId && 
        variant.flavor_id === flavorId
      ) {
        return variant.stock ?? 0;
      }
    }
    
    // If variants exist but no active matching combination is found, treat as unavailable
    return 0;
  }, [product, selectedColor, selectedFlavor, isVariantSelectionComplete]);

  // Get current variant info
  const currentVariant = useMemo(() => {
    if (!product?.variants?.length) return null;
    if (!isVariantSelectionComplete) return null;
    
    const colorId = selectedColor?.id || null;
    const flavorId = selectedFlavor?.id || null;
    
    return product.variants.find(v => 
      v.is_active !== false &&
      v.color_id === colorId && 
      v.flavor_id === flavorId
    ) || null;
  }, [product, selectedColor, selectedFlavor, isVariantSelectionComplete]);

  // Current stock based on selected variant combination
  const currentStock = useMemo(() => getVariantStock(), [getVariantStock]);
  
  // Is current combination available?
  const isAvailable = currentStock > 0;

  // Get current images based on selected color (color-based gallery switching)
  const currentImages = useMemo(() => {
    if (!product) return [];
    
    // Priority: selected color's images (up to 5)
    if (selectedColor?.images?.length > 0) {
      return selectedColor.images.slice(0, 5);
    }
    
    // Fallback to default product images
    return product.images || [];
  }, [product, selectedColor]);

  // Build gallery media with images plus optional product video
  const galleryMedia = useMemo(() => {
    const images = currentImages.length > 0 ? currentImages : (product?.images || []);
    const filteredImages = images.filter(Boolean).map((url) => ({
      type: 'image',
      url,
    }));

    // If still no images, use fallback placeholders
    const fallbackImages = filteredImages.length === 0
      ? [
          'https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800',
          'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800',
          'https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800'
        ].map((url) => ({ type: 'image', url }))
      : filteredImages;

    const selectedVideo = selectedColor?.video || product?.video || '';

    if (selectedVideo) {
      return [
        ...fallbackImages,
        { type: 'video', url: selectedVideo },
      ];
    }

    return fallbackImages;
  }, [currentImages, product, selectedColor]);


  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      setProductStatus('loading');
      setProduct(null);
      setRelatedProducts([]);
      try {
        const prod = slug ? await getProductBySlug(slug) : await getProduct(id);
        setProduct(prod);
        setProductStatus(prod ? 'success' : 'not-found');
        
        // Fetch related products from same category
        if (prod?.category_id) {
          try {
            const related = await getProducts({ category_id: prod.category_id });
            setRelatedProducts(related.filter(p => p.id !== prod.id).slice(0, 4));
          } catch (error) {
            console.error('Error fetching related products:', error);
            setRelatedProducts([]);
          }
        }
      } catch (error) {
        console.error('Error fetching product:', error);
        setProductStatus('error');
      } finally {
        setLoading(false);
      }
    };
    
    fetchProduct();
    setQuantity(1);
    window.scrollTo(0, 0);
  }, [id, slug, retryNonce]);

  useEffect(() => {
    if (!product) return;

    const colors = product.color_options || [];
    const flavors = product.flavor_options || [];
    const variants = product.variants || [];

    const hasColors = product.has_color_options && colors.length > 0;
    const hasFlavors = product.has_flavor_options && flavors.length > 0;

    if (!hasColors && !hasFlavors) return;

    if (variants.length > 0) {
      const firstAvailableVariant = variants.find((variant) => {
        if (variant.is_active === false) return false;
        if ((variant.stock ?? 0) <= 0) return false;

        const colorOk = !hasColors || colors.some((color) => color.id === variant.color_id);
        const flavorOk = !hasFlavors || flavors.some((flavor) => flavor.id === variant.flavor_id);

        return colorOk && flavorOk;
      });

      if (firstAvailableVariant) {
        if (hasColors) {
          const matchedColor = colors.find((color) => color.id === firstAvailableVariant.color_id) || null;
          setSelectedColor(matchedColor);
        } else {
          setSelectedColor(null);
        }

        if (hasFlavors) {
          const matchedFlavor = flavors.find((flavor) => flavor.id === firstAvailableVariant.flavor_id) || null;
          setSelectedFlavor(matchedFlavor);
        } else {
          setSelectedFlavor(null);
        }
        return;
      }
    }

    setSelectedColor(hasColors ? colors[0] : null);
    setSelectedFlavor(hasFlavors ? flavors[0] : null);
  }, [product]);

  // Reset quantity when variant changes
  useEffect(() => {
    setQuantity(1);
  }, [selectedColor, selectedFlavor]);

  // Clamp quantity if current stock changes
  useEffect(() => {
    if (!isAvailable) {
      setQuantity(1);
      return;
    }

    if (quantity > currentStock) {
      setQuantity(currentStock);
    }
  }, [currentStock, isAvailable, quantity]);

  const handleAddToCart = () => {
    if (!isVariantSelectionComplete) {
      const missingSelections = [
        !selectedColor && requiresColorSelection ? 'color' : null,
        !selectedFlavor && requiresFlavorSelection ? 'fragrance' : null
      ].filter(Boolean);

      toast.error(`Please select ${missingSelections.join(' and ')}`);
      return;
    }

    if (!isAvailable) {
      toast.error('This combination is out of stock');
      return;
    }
    
    const variantInfo = [];
    if (selectedColor) variantInfo.push(selectedColor.name);
    if (selectedFlavor) variantInfo.push(selectedFlavor.name);
    
    // Get variant-specific price if exists
   
    addItem({ 
      ...product,
      price: product.price,
      discount_price: currentVariant?.price_override ?? product.discount_price ?? null,
      sale_price: currentVariant?.price_override ?? product.discount_price ?? product.sale_price ?? null,
      is_on_sale: Boolean((currentVariant?.price_override ?? product.discount_price ?? product.sale_price ?? product.price) < product.price),
      selectedColor: selectedColor?.name,
      selectedColorId: selectedColor?.id,
      selectedFlavor: selectedFlavor?.name,
      selectedFlavorId: selectedFlavor?.id,
      variantId: currentVariant?.id ?? null,
      variantStock: currentStock
    }, quantity);
    
    toast.success('Added to cart', {
      description: `${quantity}x ${product.name}${variantInfo.length > 0 ? ` (${variantInfo.join(', ')})` : ''}`
    });
  };

  const handleBuyNow = () => {
    if (!isVariantSelectionComplete) {
      const missingSelections = [
        !selectedColor && requiresColorSelection ? 'color' : null,
        !selectedFlavor && requiresFlavorSelection ? 'fragrance' : null
      ].filter(Boolean);

      toast.error(`Please select ${missingSelections.join(' and ')}`);
      return;
    }

    if (!isAvailable) {
      toast.error('This combination is out of stock');
      return;
    }
    
    addItem({ 
      ...product,
      price: product.price,
      discount_price: currentVariant?.price_override ?? product.discount_price ?? null,
      sale_price: currentVariant?.price_override ?? product.discount_price ?? product.sale_price ?? null,
      is_on_sale: Boolean((currentVariant?.price_override ?? product.discount_price ?? product.sale_price ?? product.price) < product.price),
      selectedColor: selectedColor?.name,
      selectedColorId: selectedColor?.id,
      selectedFlavor: selectedFlavor?.name,
      selectedFlavorId: selectedFlavor?.id,
      variantId: currentVariant?.id ?? null,
      variantStock: currentStock
    }, quantity);
    
    navigate('/checkout');
  };

  const handleAddToWishlist = async () => {
    if (!isAuthenticated) {
      toast.error('Please sign in to add items to wishlist');
      loginWithRedirect();
      return;
    }
    try {
      await addToWishlist(product.id);
      setIsWishlisted(true);
      toast.success('Added to wishlist');
    } catch (error) {
      const message = error.response?.data?.message || 'Failed to add to wishlist';
      toast.error(message);
    }
  };

  // Calculate price (considering variant price override)
  const displayPrice = useMemo(() => {
    if (!product) return 0;
    
    // Check for variant-specific price
    if (currentVariant?.price_override != null) {
      return currentVariant.price_override;
    }
    
    // Use sale price if on sale
    if (product.is_on_sale && product.discount_price) {
      return product.discount_price;
    }
    
    return product.price;
  }, [product, currentVariant]);

  const originalPrice = useMemo(() => {
    if (!product) return null;

    if (currentVariant?.price_override != null) {
      return product.price;
    }

    if (product.is_on_sale && product.discount_price) {
      return product.price;
    }

    return null;
  }, [product, currentVariant]);

  const discountPercent = originalPrice
    ? Math.round((1 - displayPrice / originalPrice) * 100)
    : 0;
  const summaryDescription = product?.short_description || htmlToPlainText(product?.description || '');
  const enabledBenefits = useMemo(() => {
    if (!product) return [];

    return [
      {
        enabled: product.show_free_shipping !== false,
        icon: Truck,
        title: 'Free Shipping',
        subtitle: 'Over ₹1500',
      },
      {
        enabled: product.show_returns !== false,
        icon: RotateCcw,
        title: '7-Day Returns',
        subtitle: 'Easy returns',
      },
      {
        enabled: product.show_reusable_container !== false,
        icon: Package,
        title: 'Reusable Container',
        subtitle: 'Eco-friendly',
      },
      {
        enabled: product.show_gift_packaging !== false,
        icon: Gift,
        title: 'Gift Packaging',
        subtitle: 'Available',
      },
    ].filter((benefit) => benefit.enabled);
  }, [product]);

  if (loading) {
    return (
      <Layout>
        <div className="pt-32 pb-24 min-h-screen flex items-center justify-center">
          <MarisoLoader label="Loading product..." />
        </div>
      </Layout>
    );
  }

  if (productStatus === 'error') {
    return (
      <Layout>
        <div className="pt-32 pb-24 min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="font-heading text-3xl mb-4">Unable to Load Product</h1>
            <p className="mb-6 text-muted-foreground">Please try again in a moment.</p>
            <Button className="btn-primary" onClick={() => setRetryNonce((current) => current + 1)}>
              Retry
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  if (!product || productStatus === 'not-found') {
    return (
      <Layout>
        <div className="pt-32 pb-24 min-h-screen flex items-center justify-center">
          <div className="text-center">
            <h1 className="font-heading text-3xl mb-4">Product Not Found</h1>
            <Link to="/shop">
              <Button className="btn-primary">Back to Shop</Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="pt-28 pb-20 md:pt-32 md:pb-24" data-testid="product-page">
        <div className="mx-auto w-full max-w-[1440px] px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <Link 
            to="/shop" 
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
            data-testid="back-to-shop"
          >
            <ChevronLeft className="h-4 w-4 mr-1" strokeWidth={1.5} />
            Back to Shop
          </Link>

          <div className="grid w-full grid-cols-1 gap-8 md:gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 xl:gap-24">
            {/* Left Side - Image Gallery */}
            <div className="relative w-full min-w-0 md:pl-4 xl:pl-0">
              
              {/* Wishlist Button */}
              <button
                onClick={handleAddToWishlist}
                aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Add ${product.name} to wishlist`}
                className={`absolute top-4 right-4 md:top-6 md:right-7 xl:top-4 xl:right-4 z-20 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${
                  isWishlisted 
                    ? 'bg-terracotta text-white' 
                    : 'bg-white/90 backdrop-blur-sm hover:bg-white hover:scale-110'
                }`}
                data-testid="product-wishlist-icon"
              >
                <Heart className={`h-5 w-5 ${isWishlisted ? 'fill-current' : ''}`} strokeWidth={1.5} />
              </button>

              {/* Image Gallery Component */}
              <ProductImageGallery 
                media={galleryMedia}
                productName={product.name}
              />
            </div>

            {/* Right Side - Product Details */}
            <div className="w-full min-w-0 space-y-6 px-0 lg:sticky lg:top-32 lg:self-start">
              {/* Category */}
              <p className="text-[11px] tracking-[0.24em] uppercase text-foreground/45">
                {product.category_name}
              </p>
              
              {/* Product Name */}
              <h1 className="font-heading text-3xl sm:text-4xl md:text-5xl lg:text-[3.4rem] tracking-[-0.03em] leading-[1.06] break-words" data-testid="product-title">
                {product.name}
              </h1>
              
              {/* Price */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span
                    className={`text-[2rem] md:text-[2.2rem] font-medium tracking-[-0.02em] ${originalPrice ? 'text-terracotta' : 'text-foreground'}`}
                    data-testid="product-price"
                  >
                    ₹{displayPrice?.toLocaleString()}
                  </span>

                  {originalPrice && (
                    <span className="text-sm font-medium text-terracotta/90 uppercase tracking-[0.12em]">
                      {discountPercent}% off
                    </span>
                  )}
                </div>

                {originalPrice && (
                  <span
                    className="block text-base text-foreground/40 line-through"
                    data-testid="product-original-price"
                  >
                    ₹{originalPrice.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Short Description */}
              {summaryDescription && (
                <p className="text-foreground/70 leading-8 max-w-xl" data-testid="product-description">
                  {summaryDescription}
                </p>
              )}

              {/* Color Variants - Only show if product has color options */}
              {product.has_color_options && product.color_options?.length > 0 && (
                <div data-testid="color-variants">
                  <p className="text-sm font-medium mb-3 tracking-[0.01em]">
                    Color: <span className="text-muted-foreground">{selectedColor?.name || 'Select a Color'}</span>
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {product.color_options.map((color) => {
                      const hasDualColor = color.hex_code_secondary && color.hex_code_secondary !== color.hex_code;
                      return (
                        <button
                          key={color.id}
                          onClick={() => setSelectedColor(color)}
                          className={`w-12 h-12 rounded-full border-2 transition-all duration-300 hover:scale-105 overflow-hidden shadow-sm ${
                            selectedColor?.id === color.id 
                              ? 'border-foreground scale-110 shadow-lg' 
                              : 'border-border hover:border-foreground/50'
                          }`}
                          title={color.name}
                          data-testid={`color-${color.name.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {hasDualColor ? (
                            /* Dual color swatch - split diagonally */
                            <div className="w-full h-full relative">
                              <div 
                                className="absolute inset-0"
                                style={{ 
                                  background: `linear-gradient(135deg, ${color.hex_code} 50%, ${color.hex_code_secondary} 50%)`
                                }}
                              />
                            </div>
                          ) : (
                            /* Single color swatch */
                            <div 
                              className="w-full h-full"
                              style={{ backgroundColor: color.hex_code }}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Flavor/Fragrance Variants - Only show if product has flavor options */}
              {product.has_flavor_options && product.flavor_options?.length > 0 && (
                <div data-testid="flavor-variants">
                  <p className="text-sm font-medium mb-3 tracking-[0.01em]">
                    Fragrance:{' '}
                    <span className="text-foreground/55">
                      {selectedFlavor?.name || 'Select a Fragrance'}
                      {selectedFlavor?.description ? (
                        <span className="text-foreground/40"> ({selectedFlavor.description})</span>
                      ) : null}
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {product.flavor_options.map((flavor) => (
                      <button
                        key={flavor.id}
                        onClick={() => setSelectedFlavor(flavor)}
                        className={`px-4 py-2 rounded-full border transition-all duration-300 text-sm ${
                          selectedFlavor?.id === flavor.id 
                            ? 'border-foreground bg-foreground text-primary-foreground' 
                            : 'border-border hover:border-foreground/50'
                        }`}
                        title={flavor.description || flavor.name}
                        data-testid={`flavor-${flavor.name.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {flavor.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Stock Status - Based on selected variant combination */}
              <div data-testid="stock-status">
                {!isVariantSelectionComplete && (requiresColorSelection || requiresFlavorSelection) ? (
                  <div className="flex items-center gap-2 text-[#9C6B5B]" data-testid="product-variant-selection-required">
                    <AlertCircle className="h-4 w-4" />
                    <p className="text-sm font-medium">
                      Please select
                        {requiresColorSelection ? ' a color' : ''}
                        {requiresColorSelection && requiresFlavorSelection ? ' and' : ''}
                        {requiresFlavorSelection ? ' a fragrance' : ''}
                        {' '}to check availability
                    </p>
                  </div>
                ) : isAvailable ? (
                  currentStock <= 5 ? (
                    <div className="flex items-center gap-2 text-terracotta/90" data-testid="product-stock-low">
                      <AlertCircle className="h-4 w-4" />
                      <p className="text-sm font-medium">
                        Only {currentStock} left
                        {(selectedColor || selectedFlavor) && (
                          <span className="text-muted-foreground font-normal">
                            {' '}for {[selectedColor?.name, selectedFlavor?.name].filter(Boolean).join(' + ')}
                          </span>
                        )}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-[#7C8F73] font-medium tracking-[0.01em]" data-testid="product-stock-available">
                      ✓ In Stock
                    </p>
                  )
                ) : (
                  <div className="flex items-center gap-2 text-[#9C6B5B]" data-testid="product-out-of-stock">
                    <AlertCircle className="h-4 w-4" />
                    <p className="text-sm font-medium">
                      Out of Stock
                      {(selectedColor || selectedFlavor) && (
                        <span className="text-muted-foreground font-normal">
                          {' '}for {[selectedColor?.name, selectedFlavor?.name].filter(Boolean).join(' + ')}
                        </span>
                      )}
                    </p>
                  </div>
                )}
              </div> 
              {/* Quantity Selector */}
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">Quantity:</span>
                <div className="flex items-center border border-border/80 rounded-full bg-[#FBF8F4] shadow-sm">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    aria-label={`Decrease quantity of ${product.name}`}
                    className="w-10 h-10 flex items-center justify-center hover:bg-muted rounded-full transition-colors disabled:opacity-50"
                    disabled={quantity <= 1 || !isAvailable || !isVariantSelectionComplete}
                    data-testid="quantity-decrease"
                  >
                    <Minus className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <span className="w-12 text-center font-medium" data-testid="quantity-value">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(Math.min(currentStock, quantity + 1))}
                    aria-label={`Increase quantity of ${product.name}`}
                    className="w-10 h-10 flex items-center justify-center hover:bg-muted rounded-full transition-colors disabled:opacity-50"
                    disabled={!isAvailable || !isVariantSelectionComplete || currentStock <= 0 || quantity >= currentStock}
                    data-testid="quantity-increase"
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex w-full flex-col gap-4 sm:flex-row">
                <Button 
                  onClick={handleAddToCart}
                  variant="outline"
                  className={`flex-1 h-14 rounded-full text-[15px] font-medium border-2 transition-all duration-300 shadow-sm ${
                    isAvailable 
                      ? 'border-foreground hover:bg-foreground hover:text-primary-foreground' 
                      : 'border-muted-foreground/30 text-muted-foreground cursor-not-allowed'
                  }`}
                  disabled={!isAvailable || !isVariantSelectionComplete}
                  data-testid="add-to-cart-button"
                >
                  <ShoppingBag className="h-5 w-5 mr-2" strokeWidth={1.5} />
                  {!isVariantSelectionComplete ? 'Select Options' : isAvailable ? 'Add to Cart' : 'Out of Stock'}
                </Button>
                <Button 
                  onClick={handleBuyNow}
                  className={`flex-1 h-14 rounded-full text-[15px] font-medium shadow-sm transition-all duration-300 ${
                    isAvailable 
                      ? 'bg-foreground hover:bg-foreground/90' 
                      : 'bg-muted-foreground/30 cursor-not-allowed'
                  }`}
                  disabled={!isAvailable || !isVariantSelectionComplete}
                  data-testid="buy-now-button"
                >
                  <Zap className="h-5 w-5 mr-2" strokeWidth={1.5} />
                  {!isVariantSelectionComplete ? 'Select Options' : isAvailable ? 'Buy Now' : 'Out of Stock'}
                </Button>
              </div>

              {enabledBenefits.length > 0 && (
                <div
                  className={`grid gap-4 py-6 border-y border-border/70 ${
                    enabledBenefits.length === 1
                      ? 'grid-cols-1'
                      : enabledBenefits.length === 2
                        ? 'grid-cols-2'
                        : enabledBenefits.length === 3
                          ? 'grid-cols-3'
                          : 'grid-cols-2 sm:grid-cols-4'
                  }`}
                >
                  {enabledBenefits.map(({ icon: Icon, title, subtitle }) => (
                    <div key={title} className="text-center">
                      <Icon className="h-6 w-6 mx-auto mb-2 text-terracotta" strokeWidth={1.5} />
                      <p className="text-[11px] text-foreground/55 leading-5">
                        {title}<br />{subtitle}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              {/* Product Details Accordion */}
              <Accordion type="single" collapsible defaultValue="details" className="w-full pt-2">
                <AccordionItem value="details">
                  <AccordionTrigger className="text-[15px] font-medium tracking-[0.01em]" data-testid="accordion-details">
                    Product Details
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-5 text-sm text-muted-foreground">
                      {product.description && (
                        <section>
                          <div
                            className="product-rich-text leading-7 [&_p]:my-3 [&_p]:leading-7 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-terracotta [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground [&_b]:font-semibold [&_b]:text-foreground [&_em]:italic [&_i]:italic [&_u]:underline"
                            dangerouslySetInnerHTML={{ __html: sanitizeRichContent(product.description || '') }}
                          />
                        </section>
                      )}

                      {product.materials && (
                        <section className="border-t border-border pt-4">
                          <h4 className="mb-2 text-sm font-semibold text-foreground">Materials Used</h4>
                          <div
                            className="product-rich-text leading-7 [&_p]:my-3 [&_p]:leading-7 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-terracotta [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground [&_b]:font-semibold [&_b]:text-foreground [&_em]:italic [&_i]:italic [&_u]:underline"
                            dangerouslySetInnerHTML={{ __html: sanitizeRichContent(product.materials || '') }}
                          />
                        </section>
                      )}

                      {product.dimensions && (
                        <section className="border-t border-border pt-4">
                          <h4 className="mb-2 text-sm font-semibold text-foreground">Dimensions</h4>
                          <p className="leading-7">{product.dimensions}</p>
                        </section>
                      )}

                      {product.burn_time && (
                        <section className="border-t border-border pt-4">
                          <h4 className="mb-2 text-sm font-semibold text-foreground">Burn Time</h4>
                          <p className="leading-7">{product.burn_time}</p>
                        </section>
                      )}

                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="care">
                  <AccordionTrigger className="text-[15px] font-medium tracking-[0.01em]" data-testid="accordion-care">
                    Care Instructions
                  </AccordionTrigger>
                  <AccordionContent>
                    {product.care_instructions ? (
                      <div
                        className="product-rich-text text-sm text-muted-foreground leading-7 [&_p]:my-3 [&_p]:leading-7 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-terracotta [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground [&_b]:font-semibold [&_b]:text-foreground [&_em]:italic [&_i]:italic [&_u]:underline"
                        dangerouslySetInnerHTML={{ __html: sanitizeRichContent(product.care_instructions || '') }}
                      />
                    ) : (
                      <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-4">
                        <li>Trim wick to 1/4 inch before each burn</li>
                        <li>Allow wax to melt to the edges on first burn</li>
                        <li>Keep away from drafts and vibrations</li>
                        <li>Never leave burning candle unattended</li>
                        <li>Stop burning when 1/2 inch of wax remains</li>
                        <li>Keep out of reach of children and pets</li>
                      </ul>
                    )}
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="shipping">
                  <AccordionTrigger className="text-[15px] font-medium tracking-[0.01em]" data-testid="accordion-shipping">
                    Shipping & Returns
                  </AccordionTrigger>
                  <AccordionContent>
                    {product.shipping_info ? (
                      <div
                        className="product-rich-text text-sm text-muted-foreground leading-7 [&_p]:my-3 [&_p]:leading-7 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1 [&_a]:text-terracotta [&_a]:underline [&_strong]:font-semibold [&_strong]:text-foreground [&_b]:font-semibold [&_b]:text-foreground [&_em]:italic [&_i]:italic [&_u]:underline"
                        dangerouslySetInnerHTML={{ __html: sanitizeRichContent(product.shipping_info || '') }}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground leading-7">
                        Shipping information will be updated soon.
                      </p>
                    )}
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>

          {/* Related Products */}
          {relatedProducts.length > 0 && (
            <section className="mt-24" data-testid="related-products">
              <h2 className="font-heading text-3xl md:text-[2.5rem] tracking-[-0.02em] mb-8">You May Also Like</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12">
                {relatedProducts.map((prod) => (
                  <ProductCard key={prod.id} product={prod} testIdPrefix="related" />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default ProductPage;
