import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProductCard } from '../components/products/ProductCard';
import { ProductImageGallery } from '../components/products/ProductImageGallery';
import { Button } from '../components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Heart, Minus, Plus, ChevronLeft, Truck, RotateCcw, Recycle, Gift, Flame, Ruler, Clock, Droplets, ShoppingBag, Zap, AlertCircle } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { getProduct, getProducts, addToWishlist } from '../lib/api';
import { toast } from 'sonner';

const ProductPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedColor, setSelectedColor] = useState(null);
  const [selectedFlavor, setSelectedFlavor] = useState(null);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const { addItem } = useCart();
  const { isAuthenticated } = useAuth();

  // Get variant combination stock
  const getVariantStock = useCallback(() => {
    if (!product) return 0;
    
    const variants = product.variants || [];
    
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
  }, [product, selectedColor, selectedFlavor]);

  // Get current variant info
  const currentVariant = useMemo(() => {
    if (!product?.variants?.length) return null;
    
    const colorId = selectedColor?.id || null;
    const flavorId = selectedFlavor?.id || null;
    
    return product.variants.find(v => 
      v.is_active !== false &&
      v.color_id === colorId && 
      v.flavor_id === flavorId
    ) || null;
  }, [product, selectedColor, selectedFlavor]);

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

  // Ensure we have at least some images to display
  const displayImages = useMemo(() => {
    const images = currentImages.length > 0 ? currentImages : (product?.images || []);
    
    // If still no images, use fallback
    if (images.length === 0) {
      return [
        'https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800',
        'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800',
        'https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800'
      ];
    }
    
    return images;
  }, [currentImages, product]);

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      try {
        const prod = await getProduct(id);
        setProduct(prod);
        
        // Set default selected color if product has color options
        if (prod.has_color_options && prod.color_options?.length > 0) {
          setSelectedColor(prod.color_options[0]);
        } else {
          setSelectedColor(null);
        }
        
        // Set default selected flavor if product has flavor options
        if (prod.has_flavor_options && prod.flavor_options?.length > 0) {
          setSelectedFlavor(prod.flavor_options[0]);
        } else {
          setSelectedFlavor(null);
        }
        
        // Fetch related products from same category
        const related = await getProducts({ category_id: prod.category_id });
        setRelatedProducts(related.filter(p => p.id !== prod.id).slice(0, 4));
      } catch (error) {
        console.error('Error fetching product:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchProduct();
    setQuantity(1);
    window.scrollTo(0, 0);
  }, [id]);

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
    if (!isAuthenticated()) {
      toast.error('Please login to add items to wishlist');
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

  if (loading) {
    return (
      <Layout>
        <div className="pt-32 pb-24 min-h-screen">
          <div className="max-w-[1440px] mx-auto container-padding">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="space-y-4">
                <div className="aspect-[3/4] bg-muted rounded-xl animate-pulse" />
                <div className="flex gap-3">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="w-20 h-24 bg-muted rounded-lg animate-pulse" />
                  ))}
                </div>
              </div>
              <div className="space-y-6">
                <div className="h-8 bg-muted rounded w-1/4 animate-pulse" />
                <div className="h-12 bg-muted rounded w-3/4 animate-pulse" />
                <div className="h-6 bg-muted rounded w-1/3 animate-pulse" />
                <div className="h-32 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  if (!product) {
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
      <div className="pt-32 pb-24" data-testid="product-page">
        <div className="max-w-[1440px] mx-auto container-padding">
          {/* Breadcrumb */}
          <Link 
            to="/shop" 
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
            data-testid="back-to-shop"
          >
            <ChevronLeft className="h-4 w-4 mr-1" strokeWidth={1.5} />
            Back to Shop
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16">
            {/* Left Side - Image Gallery */}
            <div className="relative">
              {/* Sale Badge */}
              {originalPrice && displayPrice < originalPrice && (
                <span className="absolute top-4 left-4 z-20 bg-terracotta text-white text-sm font-medium px-4 py-1.5 rounded-full">
                  {discountPercent}% OFF
                </span>
              )}
              
              {/* Wishlist Button */}
              <button
                onClick={handleAddToWishlist}
                className={`absolute top-4 right-4 z-20 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-all ${
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
                images={displayImages}
                productName={product.name}
              />
            </div>

            {/* Right Side - Product Details */}
            <div className="lg:sticky lg:top-32 lg:self-start space-y-6">
              {/* Category */}
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground">
                {product.category_name}
              </p>
              
              {/* Product Name */}
              <h1 className="font-heading text-4xl md:text-5xl tracking-tight" data-testid="product-title">
                {product.name}
              </h1>
              
              {/* Price */}
              <div className="flex items-center gap-3">
                <span className={`text-3xl font-medium ${product.is_on_sale ? 'text-terracotta' : ''}`} data-testid="product-price">
                  ₹{displayPrice?.toLocaleString()}
                </span>
                {originalPrice && (
                  <>
                    <span className="text-xl text-muted-foreground line-through" data-testid="product-original-price">
                      ₹{originalPrice.toLocaleString()}
                    </span>
                    <span className="bg-terracotta/10 text-terracotta text-sm font-medium px-3 py-1 rounded-full">
                      Save ₹{(originalPrice - displayPrice).toLocaleString()}
                    </span>
                  </>
                )}
              </div>

              {/* Description */}
              <p className="text-muted-foreground leading-relaxed" data-testid="product-description">
                {product.description}
              </p>

              {/* Color Variants - Only show if product has color options */}
              {product.has_color_options && product.color_options?.length > 0 && (
                <div data-testid="color-variants">
                  <p className="text-sm font-medium mb-3">
                    Color: <span className="text-muted-foreground">{selectedColor?.name}</span>
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {product.color_options.map((color) => {
                      const hasDualColor = color.hex_code_secondary && color.hex_code_secondary !== color.hex_code;
                      return (
                        <button
                          key={color.id}
                          onClick={() => setSelectedColor(color)}
                          className={`w-12 h-12 rounded-full border-2 transition-all hover:scale-110 overflow-hidden ${
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
                  <p className="text-sm font-medium mb-3">Fragrance: <span className="text-muted-foreground">{selectedFlavor?.name}</span></p>
                  <div className="flex flex-wrap gap-2">
                    {product.flavor_options.map((flavor) => (
                      <button
                        key={flavor.id}
                        onClick={() => setSelectedFlavor(flavor)}
                        className={`px-4 py-2 rounded-full border transition-all text-sm ${
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
                  {selectedFlavor?.description && (
                    <p className="text-xs text-muted-foreground mt-2 italic">{selectedFlavor.description}</p>
                  )}
                </div>
              )}

              {/* Stock Status - Based on selected variant combination */}
              <div data-testid="stock-status">
                {isAvailable ? (
                  currentStock <= 5 ? (
                    <div className="flex items-center gap-2 text-terracotta" data-testid="product-stock-low">
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
                    <p className="text-sm text-[#8B9D83] font-medium" data-testid="product-stock-available">
                      ✓ In Stock
                    </p>
                  )
                ) : (
                  <div className="flex items-center gap-2 text-destructive" data-testid="product-out-of-stock">
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
                <div className="flex items-center border border-border rounded-full">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 flex items-center justify-center hover:bg-muted rounded-full transition-colors disabled:opacity-50"
                    disabled={quantity <= 1 || !isAvailable}
                    data-testid="quantity-decrease"
                  >
                    <Minus className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <span className="w-12 text-center font-medium" data-testid="quantity-value">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(Math.min(currentStock, quantity + 1))}
                    className="w-10 h-10 flex items-center justify-center hover:bg-muted rounded-full transition-colors disabled:opacity-50"
                    disabled={!isAvailable || currentStock <= 0 || quantity >= currentStock}
                    data-testid="quantity-increase"
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <Button 
                  onClick={handleAddToCart}
                  variant="outline"
                  className={`flex-1 h-14 rounded-full text-base font-medium border-2 transition-all ${
                    isAvailable 
                      ? 'border-foreground hover:bg-foreground hover:text-primary-foreground' 
                      : 'border-muted-foreground/30 text-muted-foreground cursor-not-allowed'
                  }`}
                  disabled={!isAvailable}
                  data-testid="add-to-cart-button"
                >
                  <ShoppingBag className="h-5 w-5 mr-2" strokeWidth={1.5} />
                  {isAvailable ? 'Add to Cart' : 'Out of Stock'}
                </Button>
                <Button 
                  onClick={handleBuyNow}
                  className={`flex-1 h-14 rounded-full text-base font-medium ${
                    isAvailable 
                      ? 'bg-foreground hover:bg-foreground/90' 
                      : 'bg-muted-foreground/30 cursor-not-allowed'
                  }`}
                  disabled={!isAvailable}
                  data-testid="buy-now-button"
                >
                  <Zap className="h-5 w-5 mr-2" strokeWidth={1.5} />
                  {isAvailable ? 'Buy Now' : 'Out of Stock'}
                </Button>
              </div>

              {/* Benefits */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-6 border-y border-border">
                <div className="text-center">
                  <Truck className="h-6 w-6 mx-auto mb-2 text-terracotta" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">Free Shipping<br />Over ₹1500</p>
                </div>
                <div className="text-center">
                  <RotateCcw className="h-6 w-6 mx-auto mb-2 text-terracotta" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">7-Day<br />Returns</p>
                </div>
                <div className="text-center">
                  <Recycle className="h-6 w-6 mx-auto mb-2 text-terracotta" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">Reusable<br />Container</p>
                </div>
                <div className="text-center">
                  <Gift className="h-6 w-6 mx-auto mb-2 text-terracotta" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">Gift<br />Packaging</p>
                </div>
              </div>

              {/* Product Details Accordion */}
              <Accordion type="single" collapsible defaultValue="details" className="w-full">
                <AccordionItem value="details">
                  <AccordionTrigger className="text-base font-medium" data-testid="accordion-details">
                    Product Details
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 text-sm text-muted-foreground">
                      <p>{product.description}</p>
                      
                      <div className="grid grid-cols-2 gap-4 pt-4">
                        {product.materials && (
                          <div className="flex items-center gap-2">
                            <Droplets className="h-4 w-4 text-terracotta" strokeWidth={1.5} />
                            <span>{product.materials}</span>
                          </div>
                        )}
                        {product.burn_time && (
                          <div className="flex items-center gap-2">
                            <Flame className="h-4 w-4 text-terracotta" strokeWidth={1.5} />
                            <span>{product.burn_time}</span>
                          </div>
                        )}
                        {product.dimensions && (
                          <div className="flex items-center gap-2">
                            <Ruler className="h-4 w-4 text-terracotta" strokeWidth={1.5} />
                            <span>{product.dimensions}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-terracotta" strokeWidth={1.5} />
                          <span>Handcrafted</span>
                        </div>
                      </div>

                      <p className="pt-4 border-t border-border">
                        Each Mariso candle container is designed to be reused as décor or storage once the candle has finished.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="care">
                  <AccordionTrigger className="text-base font-medium" data-testid="accordion-care">
                    Care Instructions
                  </AccordionTrigger>
                  <AccordionContent>
                    <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-4">
                      {product.care_instructions ? (
                        <li>{product.care_instructions}</li>
                      ) : (
                        <>
                          <li>Trim wick to 1/4 inch before each burn</li>
                          <li>Allow wax to melt to the edges on first burn</li>
                          <li>Keep away from drafts and vibrations</li>
                          <li>Never leave burning candle unattended</li>
                          <li>Stop burning when 1/2 inch of wax remains</li>
                          <li>Keep out of reach of children and pets</li>
                        </>
                      )}
                    </ul>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="shipping">
                  <AccordionTrigger className="text-base font-medium" data-testid="accordion-shipping">
                    Shipping & Returns
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 text-sm text-muted-foreground">
                      <div>
                        <p className="font-medium text-foreground mb-1">Shipping</p>
                        <ul className="space-y-1 list-disc pl-4">
                          <li>{product.shipping_info || 'Ships within 3-5 business days'}</li>
                          <li>Free shipping on orders over ₹1500</li>
                          <li>Standard shipping: ₹99</li>
                          <li>Express shipping: ₹199 (2-3 days)</li>
                        </ul>
                      </div>
                      <div>
                        <p className="font-medium text-foreground mb-1">Returns</p>
                        <ul className="space-y-1 list-disc pl-4">
                          <li>7-day return policy for unused items</li>
                          <li>Items must be in original packaging</li>
                          <li>Contact us for replacement of damaged items</li>
                        </ul>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>

          {/* Related Products */}
          {relatedProducts.length > 0 && (
            <section className="mt-24" data-testid="related-products">
              <h2 className="font-heading text-3xl mb-8">You May Also Like</h2>
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
