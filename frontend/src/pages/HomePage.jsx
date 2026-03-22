import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Star, Sparkles } from 'lucide-react';
import { Layout } from '../components/layout/Layout';
import { ProductCard } from '../components/products/ProductCard';
import { Button } from '../components/ui/button';
import { getCategories, getFeaturedProducts, getBestsellers } from '../lib/api';

const HomePage = () => {
  const [categories, setCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [bestsellers, setBestsellers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeData = async () => {
      try {
        const [cats, featured, best] = await Promise.all([
          getCategories(),
          getFeaturedProducts(),
          getBestsellers()
        ]);
        setCategories(cats);
        setFeaturedProducts(featured);
        setBestsellers(best);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };
    
    initializeData();
  }, []);

  const testimonials = [
    {
      name: "Priya Mehta",
      text: "The Vanilla Sandstone candle has become my go-to for cozy evenings. The scent is divine and the container is now my jewelry holder!",
      rating: 5
    },
    {
      name: "Ananya Singh",
      text: "Gifted the Rose Candle Bouquet to my sister. She absolutely loved it! The packaging was beautiful and arrived in perfect condition.",
      rating: 5
    },
    {
      name: "Riya Sharma",
      text: "The jesmonite coasters are stunning. Each piece feels unique and handcrafted. They've elevated my coffee table beautifully.",
      rating: 5
    }
  ];

  return (
    <Layout>
      {/* Hero Section */}
      <section 
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
        data-testid="hero-section"
      >
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1759157273068-42e6d441f772?crop=entropy&cs=srgb&fm=jpg&q=85"
            alt="Luxury candles"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-[#F8F5F1]/40" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-[1440px] mx-auto px-4 md:px-8 lg:px-12 text-center">
          <div className="max-w-3xl mx-auto animate-fade-up">
            <p className="text-xs tracking-[0.3em] uppercase text-foreground/70 mb-6">
              Handcrafted with Love
            </p>
            <h1 className="font-heading text-5xl md:text-7xl lg:text-8xl tracking-tight text-foreground leading-[1.1] mb-6">
              Handcrafted Candles<br />& Homewares
            </h1>
            <p className="text-lg md:text-xl text-foreground/80 mb-10 font-serif-accent italic">
              Designed to Glow with Your Space
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/shop?category=container-candles">
                <Button className="btn-primary min-w-[200px]" data-testid="hero-shop-candles">
                  Shop Candles
                </Button>
              </Link>
              <Link to="/shop">
                <Button className="btn-secondary min-w-[200px]" data-testid="hero-shop-homewares">
                  Shop Homewares
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce">
          <div className="w-6 h-10 rounded-full border-2 border-foreground/30 flex items-start justify-center p-2">
            <div className="w-1 h-2 bg-foreground/50 rounded-full" />
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="section-padding bg-[#F8F5F1]" data-testid="featured-section">
        <div className="max-w-[1440px] mx-auto container-padding">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12">
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
                New Arrivals
              </p>
              <h2 className="font-heading text-4xl md:text-5xl tracking-tight">Featured Collection</h2>
            </div>
            <Link to="/shop" className="mt-4 md:mt-0">
              <Button variant="ghost" className="group" data-testid="view-all-featured">
                View All
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" strokeWidth={1.5} />
              </Button>
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="space-y-4">
                  <div className="aspect-[3/4] bg-muted rounded-lg animate-pulse" />
                  <div className="h-4 bg-muted rounded w-1/2 animate-pulse" />
                  <div className="h-6 bg-muted rounded w-3/4 animate-pulse" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12 stagger-children">
              {featuredProducts.slice(0, 4).map((product) => (
                <ProductCard key={product.id} product={product} testIdPrefix="featured" />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Shop by Category */}
      <section className="section-padding bg-white" data-testid="categories-section">
        <div className="max-w-[1440px] mx-auto container-padding">
          <div className="text-center mb-12">
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              Explore
            </p>
            <h2 className="font-heading text-4xl md:text-5xl tracking-tight">Shop by Category</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.slice(0, 5).map((category, index) => (
              <Link
                key={category.id}
                to={`/shop?category=${category.id}`}
                className={`group relative overflow-hidden rounded-xl ${
                  index === 0 ? 'md:col-span-2 md:row-span-2' : ''
                }`}
                data-testid={`category-card-${category.id}`}
              >
                <div className={`relative ${index === 0 ? 'aspect-square md:aspect-[16/9]' : 'aspect-[4/3]'}`}>
                  <img
                    src={category.image || 'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800'}
                    alt={category.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                    <h3 className="font-heading text-2xl md:text-3xl text-white mb-2">{category.name}</h3>
                    <p className="text-white/80 text-sm hidden md:block">{category.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Brand Story */}
      <section className="section-padding bg-[#F8F5F1]" data-testid="story-section">
        <div className="max-w-[1440px] mx-auto container-padding">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1662845114342-256fdc45981d?crop=entropy&cs=srgb&fm=jpg&q=85"
                alt="Craftsman hands"
                className="rounded-xl w-full aspect-[4/5] object-cover"
              />
              <div className="absolute -bottom-6 -right-6 bg-white p-6 rounded-xl shadow-lg hidden lg:block">
                <Sparkles className="h-8 w-8 text-terracotta mb-2" strokeWidth={1.5} />
                <p className="font-heading text-2xl">100%</p>
                <p className="text-sm text-muted-foreground">Handcrafted</p>
              </div>
            </div>
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
                Our Story
              </p>
              <h2 className="font-heading text-4xl md:text-5xl tracking-tight mb-6">
                Crafted with Intention
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  At Mariso, we believe in the beauty of imperfection. Each candle is hand-poured with care, 
                  ensuring no two pieces are exactly alike. Our jesmonite coasters and containers are crafted 
                  using eco-friendly materials, designed to be treasured long after the last flame.
                </p>
                <p>
                  Every Mariso container is thoughtfully designed to be reused as décor or storage once 
                  the candle has finished, embodying our commitment to sustainable luxury.
                </p>
              </div>
              <Link to="/about">
                <Button className="btn-secondary mt-8" data-testid="story-learn-more">
                  Learn More
                  <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Bestsellers */}
      <section className="section-padding bg-white" data-testid="bestsellers-section">
        <div className="max-w-[1440px] mx-auto container-padding">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between mb-12">
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
                Most Loved
              </p>
              <h2 className="font-heading text-4xl md:text-5xl tracking-tight">Bestsellers</h2>
            </div>
            <Link to="/shop?bestsellers=true" className="mt-4 md:mt-0">
              <Button variant="ghost" className="group" data-testid="view-all-bestsellers">
                View All
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" strokeWidth={1.5} />
              </Button>
            </Link>
          </div>

          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12 stagger-children">
              {bestsellers.slice(0, 4).map((product) => (
                <ProductCard key={product.id} product={product} testIdPrefix="bestseller" />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Supporting Our Artisans */}
      <section className="section-padding bg-white" data-testid="artisans-section">
        <div className="max-w-[1440px] mx-auto container-padding">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-24 items-center">
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
                Made with Love
              </p>
              <h2 className="font-heading text-4xl md:text-5xl tracking-tight mb-6">
                Supporting Our Artisans
              </h2>
              <div className="space-y-4 text-muted-foreground leading-relaxed">
                <p>
                  At Mariso, every product tells a story. Our candles and handcrafted containers are 
                  created in collaboration with skilled artisans who bring generations of craftsmanship 
                  into every piece.
                </p>
                <p>
                  By choosing Mariso, you are not just purchasing a candle — you are supporting 
                  traditional artistry, sustainable craftsmanship, and the livelihoods of talented makers.
                </p>
                <p>
                  Each terracotta container, handcrafted coaster, and candle bouquet reflects patience, 
                  creativity, and dedication. Your purchase helps keep these crafts alive while bringing 
                  warmth and beauty into your home.
                </p>
              </div>
            </div>
            <div className="relative">
              <img
                src="https://images.unsplash.com/photo-1662845114342-256fdc45981d?crop=entropy&cs=srgb&fm=jpg&q=85"
                alt="Artisan crafting"
                className="rounded-xl w-full aspect-[4/5] object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Video Content - Craftsmanship */}
      <section className="section-padding bg-[#F8F5F1]" data-testid="video-section">
        <div className="max-w-[1440px] mx-auto container-padding">
          <div className="text-center mb-12">
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              Behind the Scenes
            </p>
            <h2 className="font-heading text-4xl md:text-5xl tracking-tight">Our Craft Process</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Candle Making */}
            <div className="bg-white rounded-xl overflow-hidden card-shadow">
              <div className="aspect-video bg-muted relative group cursor-pointer">
                <img
                  src="https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800"
                  alt="Candle making process"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-foreground/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="font-heading text-xl mb-2">Candle Making</h3>
                <p className="text-sm text-muted-foreground">Watch our artisans hand-pour premium soy wax candles with precision and care.</p>
              </div>
            </div>

            {/* Terracotta Craftsmanship */}
            <div className="bg-white rounded-xl overflow-hidden card-shadow">
              <div className="aspect-video bg-muted relative group cursor-pointer">
                <img
                  src="https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800"
                  alt="Terracotta craftsmanship"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-foreground/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="font-heading text-xl mb-2">Terracotta Craft</h3>
                <p className="text-sm text-muted-foreground">Discover how our containers are shaped and finished by skilled clay artisans.</p>
              </div>
            </div>

            {/* Candle Bouquet Guide */}
            <div className="bg-white rounded-xl overflow-hidden card-shadow">
              <div className="aspect-video bg-muted relative group cursor-pointer">
                <img
                  src="https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800"
                  alt="Candle bouquet guide"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-foreground/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                    <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  </div>
                </div>
              </div>
              <div className="p-6">
                <h3 className="font-heading text-xl mb-2">Bouquet Burn Guide</h3>
                <p className="text-sm text-muted-foreground">Learn how to safely burn and enjoy your candle bouquet flowers.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section-padding bg-clay/20" data-testid="testimonials-section">
        <div className="max-w-[1440px] mx-auto container-padding">
          <div className="text-center mb-12">
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              Reviews
            </p>
            <h2 className="font-heading text-4xl md:text-5xl tracking-tight">What Our Customers Say</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {testimonials.map((testimonial, index) => (
              <div 
                key={index}
                className="bg-white p-8 rounded-xl card-shadow"
                data-testid={`testimonial-${index}`}
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-terracotta text-terracotta" />
                  ))}
                </div>
                <p className="text-foreground/80 leading-relaxed mb-6 font-serif-accent text-lg italic">
                  "{testimonial.text}"
                </p>
                <p className="font-medium text-sm">{testimonial.name}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Instagram Section */}
      <section className="section-padding bg-[#F8F5F1]" data-testid="instagram-section">
        <div className="max-w-[1440px] mx-auto container-padding">
          <div className="text-center mb-12">
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              @marisocandles
            </p>
            <h2 className="font-heading text-4xl md:text-5xl tracking-tight">Follow Our Journey</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              'https://images.unsplash.com/photo-1766393030567-2204662b0be2?crop=entropy&cs=srgb&fm=jpg&q=85&w=400',
              'https://images.unsplash.com/photo-1595515106886-43b1443a2e8b?crop=entropy&cs=srgb&fm=jpg&q=85&w=400',
              'https://images.pexels.com/photos/9518738/pexels-photo-9518738.jpeg?auto=compress&cs=tinysrgb&w=400',
              'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?crop=entropy&cs=srgb&fm=jpg&q=85&w=400'
            ].map((img, index) => (
              <a
                key={index}
                href="https://instagram.com"
                target="_blank"
                rel="noopener noreferrer"
                className="group relative aspect-square overflow-hidden rounded-lg"
                data-testid={`instagram-image-${index}`}
              >
                <img
                  src={img}
                  alt={`Instagram ${index + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors duration-300" />
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      <section className="py-24 md:py-32 bg-primary text-primary-foreground" data-testid="newsletter-section">
        <div className="max-w-[1440px] mx-auto container-padding text-center">
          <h2 className="font-heading text-4xl md:text-5xl tracking-tight mb-4">Join the Mariso Family</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">
            Subscribe for exclusive offers, new product launches, and candle care tips.
          </p>
          <form className="flex flex-col sm:flex-row gap-4 justify-center max-w-md mx-auto" onSubmit={(e) => e.preventDefault()}>
            <input
              type="email"
              placeholder="Enter your email"
              className="flex-1 h-12 px-6 rounded-full bg-white/10 border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-white/40"
              data-testid="newsletter-email-home"
            />
            <Button 
              type="submit"
              className="bg-white text-foreground hover:bg-white/90 h-12 px-8 rounded-full"
              data-testid="newsletter-submit-home"
            >
              Subscribe
            </Button>
          </form>
        </div>
      </section>
    </Layout>
  );
};

export default HomePage;
