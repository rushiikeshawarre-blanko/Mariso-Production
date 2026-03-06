import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { ProductCard } from '../components/products/ProductCard';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Heart, Minus, Plus, ChevronLeft, Truck, RotateCcw, Recycle } from 'lucide-react';
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
  const { addItem } = useCart();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const fetchProduct = async () => {
      setLoading(true);
      try {
        const prod = await getProduct(id);
        setProduct(prod);
        
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
    addItem(product, quantity);
    toast.success('Added to cart', {
      description: `${quantity}x ${product.name}`
    });
  };

  const handleAddToWishlist = async () => {
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

  const price = product?.is_on_sale && product?.sale_price ? product.sale_price : product?.price;
  const originalPrice = product?.is_on_sale && product?.sale_price ? product.price : null;

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
            {/* Images */}
            <div className="space-y-4">
              <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-muted">
                {product.is_on_sale && (
                  <span className="sale-badge z-10">Sale</span>
                )}
                <img
                  src={product.images?.[selectedImage] || 'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800'}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  data-testid="product-main-image"
                />
              </div>
              {product.images?.length > 1 && (
                <div className="grid grid-cols-4 gap-4">
                  {product.images.map((img, index) => (
                    <button
                      key={index}
                      onClick={() => setSelectedImage(index)}
                      className={`aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                        selectedImage === index ? 'border-foreground' : 'border-transparent'
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
              
              <div className="flex items-center gap-3 mb-6">
                <span className={`text-2xl font-medium ${product.is_on_sale ? 'text-terracotta' : ''}`} data-testid="product-price">
                  ₹{price?.toLocaleString()}
                </span>
                {originalPrice && (
                  <span className="text-lg text-muted-foreground line-through" data-testid="product-original-price">
                    ₹{originalPrice.toLocaleString()}
                  </span>
                )}
              </div>

              <p className="text-muted-foreground leading-relaxed mb-8" data-testid="product-description">
                {product.description}
              </p>

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
                  className="rounded-full px-4"
                  data-testid="add-to-wishlist-button"
                >
                  <Heart className="h-5 w-5" strokeWidth={1.5} />
                </Button>
              </div>

              {/* Benefits */}
              <div className="grid grid-cols-3 gap-4 py-6 border-y border-border mb-8">
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
              </div>

              {/* Tabs */}
              <Tabs defaultValue="details" className="w-full">
                <TabsList className="grid w-full grid-cols-3 bg-muted/50">
                  <TabsTrigger value="details" data-testid="tab-details">Details</TabsTrigger>
                  <TabsTrigger value="care" data-testid="tab-care">Care</TabsTrigger>
                  <TabsTrigger value="shipping" data-testid="tab-shipping">Shipping</TabsTrigger>
                </TabsList>
                <TabsContent value="details" className="pt-4">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {product.description}
                    <br /><br />
                    Each Mariso candle container is designed to be reused as décor or storage once the candle has finished.
                  </p>
                </TabsContent>
                <TabsContent value="care" className="pt-4">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {product.care_instructions || 'Trim wick to 1/4 inch before each burn. Allow wax to melt to the edges on first burn. Keep away from drafts. Never leave burning candle unattended.'}
                  </p>
                </TabsContent>
                <TabsContent value="shipping" className="pt-4">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {product.shipping_info || 'Ships within 3-5 business days. Free shipping on orders over ₹1500. All orders are carefully packaged to ensure safe delivery.'}
                  </p>
                </TabsContent>
              </Tabs>
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
