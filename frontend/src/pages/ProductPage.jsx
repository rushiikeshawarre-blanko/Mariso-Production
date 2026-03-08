import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProductCard } from '../components/products/ProductCard';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../components/ui/accordion';
import { Heart, Minus, Plus, ChevronLeft, ChevronRight, Truck, RotateCcw, Recycle, Gift, Flame, Ruler, Clock, Droplets } from 'lucide-react';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { getProduct, getProducts, addToWishlist } from '../lib/api';
import { toast } from 'sonner';

const ProductPage = () => {
  const { id } = useParams();
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [selectedImage, setSelectedImage] = useState(0);
  const [selectedColor, setSelectedColor] = useState(null);
  const [isWishlisted, setIsWishlisted] = useState(false);
  const { addItem } = useCart();
  const { isAuthenticated } = useAuth();

  // Color variants (can be extended based on product data)
  const colorVariants = [
    { name: 'Natural', color: '#F5F0E8' },
    { name: 'Ivory', color: '#FFFFF0' },
    { name: 'Sandstone', color: '#D7C5B8' },
    { name: 'Terracotta', color: '#C98E74' },
  ];

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      try {
        const prod = await getProduct(id);
        setProduct(prod);
        setSelectedColor(colorVariants[0]);
        
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
    setSelectedImage(0);
    window.scrollTo(0, 0);
  }, [id]);

  const handleAddToCart = () => {
    if (product.stock === 0) {
      toast.error('This product is out of stock');
      return;
    }
    addItem({ ...product, selectedColor: selectedColor?.name }, quantity);
    toast.success('Added to cart', {
      description: `${quantity}x ${product.name}${selectedColor ? ` (${selectedColor.name})` : ''}`
    });
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
      toast.error('Failed to add to wishlist');
    }
  };

  const nextImage = () => {
    if (product?.images?.length > 1) {
      setSelectedImage((prev) => (prev + 1) % product.images.length);
    }
  };

  const prevImage = () => {
    if (product?.images?.length > 1) {
      setSelectedImage((prev) => (prev - 1 + product.images.length) % product.images.length);
    }
  };

  const price = product?.is_on_sale && product?.sale_price ? product.sale_price : product?.price;
  const originalPrice = product?.is_on_sale && product?.sale_price ? product.price : null;
  const discountPercent = originalPrice ? Math.round((1 - price / originalPrice) * 100) : 0;

  if (loading) {
    return (
      <Layout>
        <div className="pt-32 pb-24 min-h-screen">
          <div className="max-w-[1440px] mx-auto container-padding">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
              <div className="aspect-[3/4] bg-muted rounded-lg animate-pulse" />
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
            {/* Images - Swipeable Gallery */}
            <div className="space-y-4">
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted group">
                {product.is_on_sale && (
                  <span className="sale-badge z-10">{discountPercent}% OFF</span>
                )}
                
                {/* Wishlist Icon on Image */}
                <button
                  onClick={handleAddToWishlist}
                  className={`absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all ${
                    isWishlisted ? 'bg-terracotta text-white' : 'bg-white/90 hover:bg-white'
                  }`}
                  data-testid="product-wishlist-icon"
                >
                  <Heart className={`h-5 w-5 ${isWishlisted ? 'fill-current' : ''}`} strokeWidth={1.5} />
                </button>

                <img
                  src={product.images?.[selectedImage] || 'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800'}
                  alt={product.name}
                  className="w-full h-full object-cover transition-transform duration-500"
                  data-testid="product-main-image"
                />
                
                {/* Navigation Arrows */}
                {product.images?.length > 1 && (
                  <>
                    <button
                      onClick={prevImage}
                      className="absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-white"
                      data-testid="prev-image"
                    >
                      <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={nextImage}
                      className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-white"
                      data-testid="next-image"
                    >
                      <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
                    </button>
                  </>
                )}

                {/* Image Dots Indicator */}
                {product.images?.length > 1 && (
                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                    {product.images.map((_, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedImage(index)}
                        className={`w-2 h-2 rounded-full transition-all ${
                          selectedImage === index ? 'bg-foreground w-6' : 'bg-foreground/30'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
              
              {/* Thumbnail Gallery */}
              {product.images?.length > 1 && (
                <div className="grid grid-cols-4 gap-4">
                  {product.images.map((img, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedImage(index)}
                      className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                        selectedImage === index ? 'border-foreground' : 'border-transparent hover:border-foreground/30'
                      }`}
                      data-testid={`product-thumbnail-${index}`}
                    >
                      <img src={img} alt={`${product.name} ${index + 1}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Details */}
            <div className="lg:sticky lg:top-32 lg:self-start">
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
                {product.category_name}
              </p>
              <h1 className="font-heading text-4xl md:text-5xl tracking-tight mb-4" data-testid="product-title">
                {product.name}
              </h1>
              
              {/* Price with Discount */}
              <div className="flex items-center gap-3 mb-6">
                <span className={`text-2xl font-medium ${product.is_on_sale ? 'text-terracotta' : ''}`} data-testid="product-price">
                  ₹{price?.toLocaleString()}
                </span>
                {originalPrice && (
                  <>
                    <span className="text-lg text-muted-foreground line-through" data-testid="product-original-price">
                      ₹{originalPrice.toLocaleString()}
                    </span>
                    <span className="bg-terracotta/10 text-terracotta text-sm font-medium px-2 py-1 rounded">
                      {discountPercent}% OFF
                    </span>
                  </>
                )}
              </div>

              <p className="text-muted-foreground leading-relaxed mb-6" data-testid="product-description">
                {product.description}
              </p>

              {/* Color Variants */}
              <div className="mb-6">
                <p className="text-sm font-medium mb-3">Color: {selectedColor?.name}</p>
                <div className="flex gap-3">
                  {colorVariants.map((variant) => (
                    <button
                      key={variant.name}
                      onClick={() => setSelectedColor(variant)}
                      className={`w-10 h-10 rounded-full border-2 transition-all ${
                        selectedColor?.name === variant.name 
                          ? 'border-foreground scale-110' 
                          : 'border-border hover:border-foreground/50'
                      }`}
                      style={{ backgroundColor: variant.color }}
                      title={variant.name}
                      data-testid={`color-${variant.name.toLowerCase()}`}
                    />
                  ))}
                </div>
              </div>

              {/* Stock */}
              <div className="mb-6">
                {product.stock > 0 ? (
                  product.stock <= 5 ? (
                    <p className="text-sm text-terracotta" data-testid="product-stock-low">
                      Only {product.stock} left in stock
                    </p>
                  ) : (
                    <p className="text-sm text-[#8B9D83]" data-testid="product-stock-available">
                      In Stock
                    </p>
                  )
                ) : (
                  <p className="text-sm text-destructive" data-testid="product-out-of-stock">
                    Out of Stock
                  </p>
                )}
              </div>

              {/* Quantity & Add to Cart */}
              <div className="flex flex-col sm:flex-row gap-4 mb-8">
                <div className="flex items-center border border-border rounded-full">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="qty-btn"
                    disabled={quantity <= 1}
                    data-testid="quantity-decrease"
                  >
                    <Minus className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                  <span className="w-12 text-center font-medium" data-testid="quantity-value">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                    className="qty-btn"
                    disabled={quantity >= product.stock}
                    data-testid="quantity-increase"
                  >
                    <Plus className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
                <Button 
                  onClick={handleAddToCart}
                  className="btn-primary flex-1"
                  disabled={product.stock === 0}
                  data-testid="add-to-cart-button"
                >
                  {product.stock === 0 ? 'Out of Stock' : 'Add to Cart'}
                </Button>
                <Button
                  onClick={handleAddToWishlist}
                  variant="outline"
                  className={`rounded-full px-4 ${isWishlisted ? 'bg-terracotta/10 border-terracotta text-terracotta' : ''}`}
                  data-testid="add-to-wishlist-button"
                >
                  <Heart className={`h-5 w-5 ${isWishlisted ? 'fill-current' : ''}`} strokeWidth={1.5} />
                </Button>
              </div>

              {/* Benefits */}
              <div className="grid grid-cols-4 gap-4 py-6 border-y border-border mb-6">
                <div className="text-center">
                  <Truck className="h-5 w-5 mx-auto mb-2 text-muted-foreground" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">Free Shipping<br />Over ₹1500</p>
                </div>
                <div className="text-center">
                  <RotateCcw className="h-5 w-5 mx-auto mb-2 text-muted-foreground" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">Easy<br />Returns</p>
                </div>
                <div className="text-center">
                  <Recycle className="h-5 w-5 mx-auto mb-2 text-muted-foreground" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">Reusable<br />Container</p>
                </div>
                <div className="text-center">
                  <Gift className="h-5 w-5 mx-auto mb-2 text-muted-foreground" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground">Gift<br />Packaging</p>
                </div>
              </div>

              {/* Product Details Accordion */}
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="details">
                  <AccordionTrigger className="text-base font-medium" data-testid="accordion-details">
                    Product Details
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-4 text-sm text-muted-foreground">
                      <p>{product.description}</p>
                      
                      <div className="grid grid-cols-2 gap-4 pt-4">
                        <div className="flex items-center gap-2">
                          <Droplets className="h-4 w-4" strokeWidth={1.5} />
                          <span>Premium Soy Wax</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Flame className="h-4 w-4" strokeWidth={1.5} />
                          <span>45+ Hour Burn Time</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Ruler className="h-4 w-4" strokeWidth={1.5} />
                          <span>8cm × 10cm</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" strokeWidth={1.5} />
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
                      <li>Trim wick to 1/4 inch before each burn</li>
                      <li>Allow wax to melt to the edges on first burn</li>
                      <li>Keep away from drafts and vibrations</li>
                      <li>Never leave burning candle unattended</li>
                      <li>Stop burning when 1/2 inch of wax remains</li>
                      <li>Keep out of reach of children and pets</li>
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
                          <li>Ships within 3-5 business days</li>
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
