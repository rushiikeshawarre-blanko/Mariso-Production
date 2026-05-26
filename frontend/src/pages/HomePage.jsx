import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, ChevronRight, Star, Sparkles } from 'lucide-react';
import AutoScroll from 'embla-carousel-auto-scroll';
import { Layout } from '../components/layout/Layout';
import { ProductCard } from '../components/products/ProductCard';
import { Button } from '../components/ui/button';
import MarisoLoader from '../components/ui/MarisoLoader';
import { Carousel, CarouselContent, CarouselItem, CarouselPrevious, CarouselNext } from '../components/ui/carousel';
import { getCategories, getFeaturedProducts, getBestsellers, getHomepageContent, getHomepageFaqs, getHomepageFeedbackReviews } from '../lib/api';
import { createHomePageAdminDefaults } from '../lib/homePageDefaults';

const defaultTestimonials = [
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

const clampRating = (rating) => {
  const numericRating = Number(rating || 5);
  if (Number.isNaN(numericRating)) return 5;
  return Math.min(Math.max(Math.round(numericRating), 1), 5);
};

const carouselArrowClass = 'hidden h-11 w-11 border border-foreground/20 bg-[#FBF8F4] text-foreground shadow-[0_5px_16px_rgba(0,0,0,0.09)] transition-colors hover:border-foreground/35 hover:bg-white disabled:!opacity-35 lg:flex';
const defaultCategoryImage = 'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800';

const createAutoScrollPlugin = () => AutoScroll({
  speed: 0.35,
  startDelay: 800,
  playOnInit: true,
  stopOnInteraction: false,
  stopOnMouseEnter: true,
  stopOnFocusIn: true,
  breakpoints: {
    '(prefers-reduced-motion: reduce)': { active: false },
  },
});

const getVisibleProductCardCount = () => {
  if (typeof window === 'undefined') return 5;
  if (window.matchMedia('(min-width: 1280px)').matches) return 5;
  if (window.matchMedia('(min-width: 1024px)').matches) return 4;
  if (window.matchMedia('(min-width: 768px)').matches) return 3;
  if (window.matchMedia('(min-width: 640px)').matches) return 2;
  return 1;
};

const useProductCarouselAutoScroll = (productCount) => {
  const [visibleCardCount, setVisibleCardCount] = useState(getVisibleProductCardCount);
  const autoScrollRef = useRef(null);

  if (!autoScrollRef.current) {
    autoScrollRef.current = createAutoScrollPlugin();
  }

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const mediaQueries = [
      '(min-width: 640px)',
      '(min-width: 768px)',
      '(min-width: 1024px)',
      '(min-width: 1280px)',
    ].map((query) => window.matchMedia(query));
    const updateVisibleCardCount = () => setVisibleCardCount(getVisibleProductCardCount());

    mediaQueries.forEach((mediaQuery) => mediaQuery.addEventListener('change', updateVisibleCardCount));
    updateVisibleCardCount();

    return () => {
      mediaQueries.forEach((mediaQuery) => mediaQuery.removeEventListener('change', updateVisibleCardCount));
    };
  }, []);

  return {
    autoScrollPlugin: autoScrollRef.current,
    shouldAutoScroll: productCount > visibleCardCount,
  };
};

const CATEGORY_TEMPLATE_OPTIONS = {
  2: ['split', 'feature-side'],
  3: ['feature-two', 'equal-three'],
  4: ['grid-four', 'feature-three'],
  5: ['feature-four'],
  6: ['grid-six', 'feature-five'],
};

const DEFAULT_CATEGORY_TEMPLATE = {
  1: 'split',
  2: 'split',
  3: 'feature-two',
  4: 'grid-four',
  5: 'feature-four',
  6: 'grid-six',
};

const mergeSection = (defaults, content, arrayFields = []) => {
  const definedContent = Object.fromEntries(
    Object.entries(content || {}).filter(([, value]) => value !== undefined)
  );
  const merged = { ...defaults, ...definedContent };

  arrayFields.forEach((field) => {
    merged[field] = Array.isArray(content?.[field]) ? content[field] : defaults[field];
  });

  return merged;
};

const mergeHomepageContent = (content) => {
  const defaults = createHomePageAdminDefaults();
  if (!content) return defaults;

  return {
    hero: mergeSection(defaults.hero, content.hero, ['buttons']),
    featured_collection: mergeSection(defaults.featured_collection, content.featured_collection),
    shop_by_category: mergeSection(defaults.shop_by_category, content.shop_by_category, ['cards']),
    crafted_with_intention: mergeSection(defaults.crafted_with_intention, content.crafted_with_intention, ['paragraphs']),
    bestsellers: mergeSection(defaults.bestsellers, content.bestsellers),
    supporting_artisans: mergeSection(defaults.supporting_artisans, content.supporting_artisans, ['paragraphs']),
    craft_process: mergeSection(defaults.craft_process, content.craft_process, ['cards']),
    faq_section: mergeSection(defaults.faq_section, content.faq_section),
    reviews_section: mergeSection(defaults.reviews_section, content.reviews_section),
    follow_journey: mergeSection(defaults.follow_journey, content.follow_journey, ['cards']),
    newsletter: mergeSection(defaults.newsletter, content.newsletter),
  };
};

const getSafeLink = (value, fallback = null) => {
  const normalized = String(value || '').trim();
  if (
    (normalized.startsWith('/') && !normalized.startsWith('//')) ||
    normalized.startsWith('#') ||
    /^https?:\/\//i.test(normalized)
  ) {
    return normalized;
  }
  return fallback ? getSafeLink(fallback) : null;
};

const getSafeMediaUrl = (value, fallback) => {
  const normalized = String(value || '').trim();
  if ((normalized.startsWith('/') && !normalized.startsWith('//')) || /^https?:\/\//i.test(normalized)) {
    return normalized;
  }
  return fallback;
};

const sortedActiveItems = (items = []) => items
  .filter((item) => item?.is_active !== false)
  .slice()
  .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

const ContentLink = ({ href, children, ...props }) => {
  const safeLink = getSafeLink(href);
  if (!safeLink) return children;

  if (safeLink.startsWith('/') || safeLink.startsWith('#')) {
    return <Link to={safeLink} {...props}>{children}</Link>;
  }

  return (
    <a href={safeLink} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  );
};

const renderMultilineText = (value) => String(value || '').split('\n').map((line, index, lines) => (
  <React.Fragment key={`${line}-${index}`}>
    {line}
    {index < lines.length - 1 ? <br /> : null}
  </React.Fragment>
));

const resolveCategoryTemplate = (template, cardCount) => {
  const cappedCount = Math.min(Math.max(Number(cardCount) || 1, 1), 6);
  if (cappedCount === 1) return DEFAULT_CATEGORY_TEMPLATE[1];
  return CATEGORY_TEMPLATE_OPTIONS[cappedCount]?.includes(template)
    ? template
    : DEFAULT_CATEGORY_TEMPLATE[cappedCount];
};

const getCategoryGridClass = (template, count) => {
  if (count <= 1) return 'grid grid-cols-1 gap-6 lg:gap-8';
  if (template === 'split') return 'grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8';
  if (template === 'feature-side') return 'grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8';
  if (template === 'equal-three') return 'grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8';
  if (template === 'grid-four') return 'grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8';
  if (template === 'grid-six') return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8';
  return 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8';
};

const getCategoryCardClass = (template, index) => {
  if (index !== 0) return '';
  if (['feature-side', 'feature-two', 'feature-three', 'feature-four', 'feature-five'].includes(template)) {
    return 'md:col-span-2 md:row-span-2';
  }
  return '';
};

const HomePage = ({ previewContent = null, isPreview = false }) => {
  const defaults = createHomePageAdminDefaults();
  const [homepageContent, setHomepageContent] = useState(() => mergeHomepageContent(isPreview ? previewContent : null));
  const [categories, setCategories] = useState([]);
  const [featuredProducts, setFeaturedProducts] = useState([]);
  const [bestsellers, setBestsellers] = useState([]);
  const [homepageFaqs, setHomepageFaqs] = useState([]);
  const [homepageReviews, setHomepageReviews] = useState([]);
  const [openFaqId, setOpenFaqId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [hoveredButton, setHoveredButton] = useState(null);
  const [featuredStatus, setFeaturedStatus] = useState('loading');
  const [bestsellerStatus, setBestsellerStatus] = useState('loading');
  const reviewAutoScrollRef = useRef(null);
  const featuredCarousel = useProductCarouselAutoScroll(featuredProducts.length);
  const bestsellerCarousel = useProductCarouselAutoScroll(bestsellers.length);

  if (!reviewAutoScrollRef.current) {
    reviewAutoScrollRef.current = createAutoScrollPlugin();
  }

  const initializeData = useCallback(async () => {
    setLoading(true);
    setFeaturedStatus('loading');
    setBestsellerStatus('loading');

    if (isPreview) {
      setHomepageContent(mergeHomepageContent(previewContent));
    } else {
      getHomepageContent()
        .then((content) => {
          setHomepageContent(mergeHomepageContent(content));
        })
        .catch(() => {
          setHomepageContent(mergeHomepageContent(null));
        });
    }

    try {
      const [catsResult, featuredResult, bestResult, homepageFaqsResult, homepageReviewsResult] = await Promise.allSettled([
        getCategories(),
        getFeaturedProducts(),
        getBestsellers(),
        getHomepageFaqs(),
        getHomepageFeedbackReviews()
      ]);

      if (catsResult.status === 'fulfilled') {
        setCategories(catsResult.value || []);
      }

      if (featuredResult.status === 'fulfilled') {
        const items = featuredResult.value || [];
        setFeaturedProducts(items);
        setFeaturedStatus(items.length > 0 ? 'success' : 'empty');
      } else {
        console.error('Error fetching featured products:', featuredResult.reason);
        setFeaturedProducts([]);
        setFeaturedStatus('error');
      }

      if (bestResult.status === 'fulfilled') {
        const items = bestResult.value || [];
        setBestsellers(items);
        setBestsellerStatus(items.length > 0 ? 'success' : 'empty');
      } else {
        console.error('Error fetching bestsellers:', bestResult.reason);
        setBestsellers([]);
        setBestsellerStatus('error');
      }

      if (homepageFaqsResult.status === 'fulfilled') {
        const faqItems = homepageFaqsResult.value || [];
        setHomepageFaqs(faqItems);
        setOpenFaqId(null);
      }

      if (homepageReviewsResult.status === 'fulfilled') {
        const reviewItems = homepageReviewsResult.value || [];
        setHomepageReviews(
          reviewItems
            .filter((review) => review?.text)
            .map((review) => ({
              name: review.name || 'Mariso Customer',
              text: review.text,
              rating: clampRating(review.rating),
            }))
        );
      } else {
        console.error('Error fetching homepage reviews:', homepageReviewsResult.reason);
        setHomepageReviews([]);
      }

    } catch (error) {
      console.error('Error fetching data:', error);
      setFeaturedStatus((current) => (current === 'loading' ? 'error' : current));
      setBestsellerStatus((current) => (current === 'loading' ? 'error' : current));
    } finally {
      setLoading(false);
    }
  }, [isPreview, previewContent]);

  useEffect(() => {
    initializeData();
  }, [initializeData]);

  const toggleFaq = (faqId) => {
    setOpenFaqId((current) => (current === faqId ? null : faqId));
  };

  const testimonials = [...homepageReviews, ...defaultTestimonials].slice(0, 10);
  const marqueeTestimonials = testimonials.length > 0 ? testimonials : defaultTestimonials;
  const reviewCarouselTestimonials = marqueeTestimonials.length < 6
    ? [...marqueeTestimonials, ...marqueeTestimonials]
    : marqueeTestimonials;
  const heroButtons = sortedActiveItems(homepageContent.hero.buttons);
  const configuredCategoryCards = Array.isArray(homepageContent.shop_by_category.cards)
    ? homepageContent.shop_by_category.cards
    : [];
  const usesCmsCategoryCards = configuredCategoryCards.length > 0;
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const activeCategoryCards = sortedActiveItems(configuredCategoryCards)
    .map((card) => {
      const category = categoryById.get(card.category_id);
      if (category) {
        return {
          ...card,
          title: category.name,
          subtitle: category.description,
          image: category.image,
          link: `/shop?category=${encodeURIComponent(category.id)}`,
        };
      }

      if (card.title || card.subtitle || card.image || card.link) return card;
      return null;
    })
    .filter(Boolean)
    .slice(0, Math.min(Math.max(Number(homepageContent.shop_by_category.card_count) || 2, 2), 6));
  const effectiveCategoryCount = activeCategoryCards.length;
  const categoryTemplate = resolveCategoryTemplate(homepageContent.shop_by_category.template, effectiveCategoryCount);
  const craftProcessCards = sortedActiveItems(homepageContent.craft_process.cards);
  const journeyCards = sortedActiveItems(homepageContent.follow_journey.cards);
  const badgeText = String(homepageContent.crafted_with_intention.floating_badge_text || '').trim();
  const [badgeTitle, ...badgeSubtitleParts] = badgeText.split(/\s+/);
  const badgeSubtitle = badgeSubtitleParts.join(' ');

  return (
    <Layout>
      {isPreview ? (
        <div className="fixed left-0 right-0 top-20 z-40 bg-amber-100 px-4 py-3 text-center text-sm font-medium text-amber-950 shadow-sm" data-testid="homepage-preview-banner">
          Preview mode — changes are not saved
        </div>
      ) : null}
      {/* Hero Section */}
      <section 
        className="relative min-h-[76vh] md:min-h-[92vh] flex items-center justify-center overflow-hidden pt-20"
        data-testid="hero-section"
      >
        {/* Background Image */}
        <div className="absolute inset-0">
          <img
            src={getSafeMediaUrl(homepageContent.hero.background_image, defaults.hero.background_image)}
            alt="Luxury candles"
            className="w-full h-full object-cover object-center"
            loading="eager"
            decoding="async"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#F8F5F1]/35 via-[#F8F5F1]/45 to-[#F8F5F1]/70" />
        </div>

        {/* Content */}
        <div className="relative z-10 max-w-[1280px] mx-auto px-6 md:px-10 lg:px-12 text-center">
          <div className="max-w-4xl mx-auto animate-fade-up">
            <p className="text-[11px] md:text-xs tracking-[0.38em] uppercase text-foreground/65 mb-6">
              {homepageContent.hero.eyebrow}
            </p>
            <h1 className="font-heading text-5xl md:text-7xl lg:text-[7rem] tracking-[-0.03em] text-foreground leading-[0.98] mb-7">
              {renderMultilineText(homepageContent.hero.heading)}
            </h1>
            <p className="text-lg md:text-[1.35rem] text-foreground/75 mb-12 font-serif-accent italic">
              {homepageContent.hero.subheading}
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
              {heroButtons.map((button, index) => {
                const defaultFilledIndex = heroButtons.findIndex((item) => item?.style !== 'secondary');
                const activeFilledIndex = hoveredButton ?? (defaultFilledIndex >= 0 ? defaultFilledIndex : 0);
                const isFilled = activeFilledIndex === index;

                return (
                  <ContentLink key={button.id || `${button.label}-${index}`} href={button.link}>
                    <Button
                      className={`min-w-[215px] h-12 rounded-full transition-all duration-300 text-[12px] tracking-[0.22em] px-8 shadow-sm ${
                        isFilled
                          ? 'bg-black text-white hover:bg-black/90'
                          : 'border border-black/80 text-black bg-transparent hover:bg-[#F3ECE4] hover:text-black hover:border-black hover:shadow-md'
                      }`}
                      onMouseEnter={() => setHoveredButton(index)}
                      onMouseLeave={() => setHoveredButton(null)}
                      onFocus={() => setHoveredButton(index)}
                      onBlur={() => setHoveredButton(null)}
                      data-testid={index === 0 ? 'hero-shop-candles' : index === 1 ? 'hero-shop-homewares' : `hero-button-${index}`}
                    >
                      {button.label}
                    </Button>
                  </ContentLink>
                );
              })}
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce hidden md:block">
          <div className="w-6 h-10 rounded-full border-2 border-foreground/30 flex items-start justify-center p-2">
            <div className="w-1 h-2 bg-foreground/50 rounded-full" />
          </div>
        </div>
      </section>

      {/* Featured Products */}
      {homepageContent.featured_collection.is_active !== false && (
      <section className="select-none py-14 md:py-28 bg-[#F8F5F1]" data-testid="featured-section">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
          <div className="mb-8 md:mb-14">
            <div>
              <p className="text-[11px] tracking-[0.24em] uppercase text-muted-foreground mb-3">
                {homepageContent.featured_collection.eyebrow}
              </p>
              <h2 className="font-heading text-4xl md:text-5xl tracking-[-0.02em]">{homepageContent.featured_collection.heading}</h2>
            </div>
          </div>

          {loading && featuredStatus === 'loading' ? (
            <MarisoLoader label="Loading products..." />
          ) : featuredStatus === 'error' ? (
            <div className="rounded-[1.25rem] border border-black/5 bg-white px-6 py-10 text-center shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
              <p className="text-base font-medium text-foreground">Unable to load featured products right now.</p>
              <p className="mt-2 text-sm text-muted-foreground">Please try again.</p>
              <Button className="mt-5" onClick={initializeData} data-testid="retry-featured-products">
                Retry
              </Button>
            </div>
          ) : featuredStatus === 'empty' ? (
            <div className="rounded-[1.25rem] border border-black/5 bg-white px-6 py-10 text-center shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
              <p className="text-base font-medium text-foreground">No featured products available right now.</p>
            </div>
          ) : (
            <>
              <Carousel
                opts={{ align: 'start', dragFree: true, loop: featuredCarousel.shouldAutoScroll }}
                plugins={featuredCarousel.shouldAutoScroll ? [featuredCarousel.autoScrollPlugin] : []}
                className="w-full select-none"
              >
                <CarouselContent className="-ml-5 select-none">
                  {featuredProducts.map((product) => (
                    <CarouselItem key={product.id} className="select-none basis-[84%] pl-5 sm:basis-[46%] md:basis-1/3 lg:basis-1/4 xl:basis-1/5">
                      <ProductCard product={product} testIdPrefix="featured" />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {featuredProducts.length > 4 && (
                  <>
                    <CarouselPrevious className={`${carouselArrowClass} left-auto right-14 -top-[4.9rem] translate-y-0`} />
                    <CarouselNext className={`${carouselArrowClass} right-0 -top-[4.9rem] translate-y-0`} />
                  </>
                )}
              </Carousel>
              <div className="mt-10 flex justify-center md:mt-14">
                <ContentLink href={getSafeLink(homepageContent.featured_collection.view_all_link, defaults.featured_collection.view_all_link)}>
                  <Button className="h-12 rounded-full bg-black px-10 text-[12px] tracking-[0.22em] text-white hover:bg-black/90" data-testid="view-all-featured">
                    {homepageContent.featured_collection.view_all_label}
                  </Button>
                </ContentLink>
              </div>
            </>
          )}
        </div>
      </section>
      )}

      {/* Shop by Category */}
      <section className="py-14 md:py-28 bg-white" data-testid="categories-section">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
          <div className="text-center mb-8 md:mb-14">
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              {homepageContent.shop_by_category.eyebrow}
            </p>
            <h2 className="font-heading text-4xl md:text-5xl tracking-tight">{homepageContent.shop_by_category.heading}</h2>
          </div>

          {usesCmsCategoryCards ? (
            activeCategoryCards.length > 0 ? (
              <div className={getCategoryGridClass(categoryTemplate, effectiveCategoryCount)}>
                {activeCategoryCards.map((card, index) => {
                  const target = getSafeLink(card.link);
                  const cardClass = `group relative overflow-hidden rounded-[1.25rem] shadow-[0_8px_30px_rgba(0,0,0,0.06)] ${getCategoryCardClass(categoryTemplate, index)}`;
                  const content = (
                    <div className={`relative ${getCategoryCardClass(categoryTemplate, index) ? 'aspect-square md:aspect-[16/9]' : 'aspect-[4/3]'}`}>
                      <img
                        src={getSafeMediaUrl(card.image, defaultCategoryImage)}
                        alt={card.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                        loading="lazy"
                        decoding="async"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                        <h3 className="font-heading text-2xl md:text-[2rem] tracking-[-0.02em] text-white mb-2">{card.title}</h3>
                        {card.subtitle ? <p className="text-white/80 text-sm hidden md:block">{card.subtitle}</p> : null}
                      </div>
                    </div>
                  );

                  return target ? (
                    <ContentLink key={card.id || index} href={target} className={cardClass} data-testid={`category-card-${card.id || index}`}>
                      {content}
                    </ContentLink>
                  ) : (
                    <div key={card.id || index} className={cardClass} data-testid={`category-card-${card.id || index}`}>
                      {content}
                    </div>
                  );
                })}
              </div>
            ) : null
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {categories.slice(0, 5).map((category, index) => (
                <Link
                  key={category.id}
                  to={`/shop?category=${category.id}`}
                  className={`group relative overflow-hidden rounded-[1.25rem] shadow-[0_8px_30px_rgba(0,0,0,0.06)] ${
                    index === 0 ? 'md:col-span-2 md:row-span-2' : ''
                  }`}
                  data-testid={`category-card-${category.id}`}
                >
                  <div className={`relative ${index === 0 ? 'aspect-square md:aspect-[16/9]' : 'aspect-[4/3]'}`}>
                    <img
                      src={category.image || defaultCategoryImage}
                      alt={category.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                      <h3 className="font-heading text-2xl md:text-[2rem] tracking-[-0.02em] text-white mb-2">{category.name}</h3>
                      <p className="text-white/80 text-sm hidden md:block">{category.description}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Brand Story */}
      {homepageContent.crafted_with_intention.is_active !== false && (
      <section className="py-24 md:py-28 bg-[#F8F5F1]" data-testid="story-section">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-24 items-center">
            <div className="relative">
              <img
                src={getSafeMediaUrl(homepageContent.crafted_with_intention.image, defaults.crafted_with_intention.image)}
                alt="Craftsman hands"
                className="rounded-[1.5rem] w-full aspect-[4/5] object-cover shadow-[0_18px_60px_rgba(0,0,0,0.08)]"
                loading="lazy"
                decoding="async"
              />
              <div className="absolute -bottom-6 -right-6 bg-white/95 backdrop-blur-sm p-6 rounded-[1.25rem] shadow-[0_18px_40px_rgba(0,0,0,0.12)] hidden lg:block">
                <Sparkles className="h-8 w-8 text-terracotta mb-2" strokeWidth={1.5} />
                {badgeTitle ? <p className="font-heading text-2xl">{badgeTitle}</p> : null}
                {badgeSubtitle ? <p className="text-sm text-muted-foreground">{badgeSubtitle}</p> : null}
              </div>
            </div>
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
                {homepageContent.crafted_with_intention.eyebrow}
              </p>
              <h2 className="font-heading text-4xl md:text-5xl tracking-[-0.02em] mb-6">
                {homepageContent.crafted_with_intention.heading}
              </h2>
              <div className="space-y-4 text-muted-foreground leading-8">
                {homepageContent.crafted_with_intention.paragraphs.map((paragraph, index) => (
                  <p key={`story-paragraph-${index}`}>{paragraph}</p>
                ))}
              </div>
              {getSafeLink(homepageContent.crafted_with_intention.button_link, defaults.crafted_with_intention.button_link) ? (
              <ContentLink href={getSafeLink(homepageContent.crafted_with_intention.button_link, defaults.crafted_with_intention.button_link)}>
                <Button className="btn-secondary mt-8" data-testid="story-learn-more">
                  {homepageContent.crafted_with_intention.button_label}
                  <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.5} />
                </Button>
              </ContentLink>
              ) : null}
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Bestsellers */}
      {homepageContent.bestsellers.is_active !== false && (
      <section className="select-none py-14 md:py-28 bg-white" data-testid="bestsellers-section">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
          <div className="mb-8 md:mb-12">
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
                {homepageContent.bestsellers.eyebrow}
              </p>
              <h2 className="font-heading text-4xl md:text-5xl tracking-tight">{homepageContent.bestsellers.heading}</h2>
            </div>
          </div>
          {loading && bestsellerStatus === 'loading' ? (
            <MarisoLoader label="Loading products..." />
          ) : bestsellerStatus === 'error' ? (
            <div className="rounded-[1.25rem] border border-black/5 bg-white px-6 py-10 text-center shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
              <p className="text-base font-medium text-foreground">Unable to load bestsellers right now.</p>
              <p className="mt-2 text-sm text-muted-foreground">Please try again.</p>
              <Button className="mt-5" onClick={initializeData} data-testid="retry-bestsellers">
                Retry
              </Button>
            </div>
          ) : bestsellerStatus === 'empty' ? (
            <div className="rounded-[1.25rem] border border-black/5 bg-white px-6 py-10 text-center shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
              <p className="text-base font-medium text-foreground">No bestsellers available right now.</p>
            </div>
          ) : (
            <>
              <Carousel
                opts={{ align: 'start', dragFree: true, loop: bestsellerCarousel.shouldAutoScroll }}
                plugins={bestsellerCarousel.shouldAutoScroll ? [bestsellerCarousel.autoScrollPlugin] : []}
                className="w-full select-none"
              >
                <CarouselContent className="-ml-5 select-none">
                  {bestsellers.map((product) => (
                    <CarouselItem key={product.id} className="select-none basis-[84%] pl-5 sm:basis-[46%] md:basis-1/3 lg:basis-1/4 xl:basis-1/5">
                      <ProductCard product={product} testIdPrefix="bestseller" />
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {bestsellers.length > 4 && (
                  <>
                    <CarouselPrevious className={`${carouselArrowClass} left-auto right-14 -top-[4.9rem] translate-y-0`} />
                    <CarouselNext className={`${carouselArrowClass} right-0 -top-[4.9rem] translate-y-0`} />
                  </>
                )}
              </Carousel>
              <div className="mt-10 flex justify-center md:mt-14">
                <ContentLink href={getSafeLink(homepageContent.bestsellers.view_all_link, defaults.bestsellers.view_all_link)}>
                  <Button className="h-12 rounded-full bg-black px-10 text-[12px] tracking-[0.22em] text-white hover:bg-black/90" data-testid="view-all-bestsellers">
                    {homepageContent.bestsellers.view_all_label}
                  </Button>
                </ContentLink>
              </div>
            </>
          )}
        </div>
      </section>
      )}

      {/* Supporting Our Artisans */}
      {homepageContent.supporting_artisans.is_active !== false && (
      <section className="py-24 md:py-28 bg-white" data-testid="artisans-section">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 lg:gap-24 items-center">
            <div>
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
                {homepageContent.supporting_artisans.eyebrow}
              </p>
              <h2 className="font-heading text-4xl md:text-5xl tracking-[-0.02em] mb-6">
                {homepageContent.supporting_artisans.heading}
              </h2>
              <div className="space-y-4 text-muted-foreground leading-8">
                {homepageContent.supporting_artisans.paragraphs.map((paragraph, index) => (
                  <p key={`artisan-paragraph-${index}`}>{paragraph}</p>
                ))}
              </div>
            </div>
            <div className="relative">
              <img
                src={getSafeMediaUrl(homepageContent.supporting_artisans.image, defaults.supporting_artisans.image)}
                alt="Artisan crafting"
                className="rounded-[1.5rem] w-full aspect-[4/5] object-cover shadow-[0_18px_60px_rgba(0,0,0,0.08)]"
                loading="lazy"
                decoding="async"
              />
            </div>
          </div>
        </div>
      </section>
      )}

      {/* Video Content - Craftsmanship */}
      <section className="py-24 md:py-28 bg-[#F8F5F1]" data-testid="video-section">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              {homepageContent.craft_process.eyebrow}
            </p>
            <h2 className="font-heading text-4xl md:text-5xl tracking-tight">{homepageContent.craft_process.heading}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
            {craftProcessCards.map((card, index) => {
              const videoTarget = card.show_play_icon ? getSafeMediaUrl(card.video, null) : null;
              const linkTarget = getSafeLink(card.link);
              const content = (
                <>
                  <div className="aspect-video bg-muted relative group cursor-pointer">
                    <img
                      src={getSafeMediaUrl(card.image, defaults.craft_process.cards[index]?.image || defaultCategoryImage)}
                      alt={card.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                      decoding="async"
                    />
                    {card.show_play_icon ? (
                      <div className="absolute inset-0 bg-foreground/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-16 h-16 bg-white/90 rounded-full flex items-center justify-center">
                          <svg className="w-6 h-6 ml-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                        </div>
                      </div>
                    ) : null}
                  </div>
                  <div className="p-6 md:p-7">
                    <h3 className="font-heading text-xl mb-2">{card.title}</h3>
                    <p className="text-sm text-muted-foreground">{card.description}</p>
                  </div>
                </>
              );
              const className = "block bg-white rounded-[1.25rem] overflow-hidden shadow-[0_10px_30px_rgba(0,0,0,0.06)] border border-black/5";

              if (videoTarget) {
                return (
                  <a key={card.id || index} href={videoTarget} target="_blank" rel="noopener noreferrer" className={className}>
                    {content}
                  </a>
                );
              }
              if (linkTarget) {
                return (
                  <ContentLink key={card.id || index} href={linkTarget} className={className}>
                    {content}
                  </ContentLink>
                );
              }
              return <div key={card.id || index} className={className}>{content}</div>;
            })}
          </div>
        </div>
      </section>

      {/* Homepage FAQs */}
      {homepageContent.faq_section.is_active !== false && homepageFaqs.length > 0 && (
        <section className="py-24 md:py-28 bg-[#F8F5F1]" data-testid="homepage-faqs-section">
          <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
            <div className="text-center mb-12">
              <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
                {homepageContent.faq_section.eyebrow}
              </p>
              <h2 className="font-heading text-4xl md:text-5xl tracking-tight">{homepageContent.faq_section.heading}</h2>
              <p className="mt-4 text-sm md:text-base text-muted-foreground max-w-2xl mx-auto leading-7">
                {homepageContent.faq_section.subheading}
              </p>
            </div>

            <div className="max-w-4xl mx-auto space-y-4">
              {homepageFaqs
                .slice()
                .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                .map((faq) => {
                  const isOpen = openFaqId === faq.id;

                  return (
                    <div
                      key={faq.id}
                      className="overflow-hidden rounded-[1.25rem] border border-black/5 bg-[#C7A88A] shadow-[0_10px_30px_rgba(0,0,0,0.06)]"
                    >
                      <button
                        type="button"
                        onClick={() => toggleFaq(faq.id)}
                        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-[#BE9D7C] md:px-6"
                      >
                        <span className="text-sm md:text-base font-medium leading-6 text-white">
                          {faq.question}
                        </span>
                        <span className="shrink-0 text-white">
                          {isOpen ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                        </span>
                      </button>

                      {isOpen ? (
                        <div className="border-t border-white/20 bg-[#F8F5F1] px-5 py-5 md:px-6">
                          <p className="whitespace-pre-line text-sm md:text-base leading-7 text-muted-foreground">
                            {faq.answer}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
            </div>

            <div className="text-center mt-10">
              <ContentLink href={getSafeLink(homepageContent.faq_section.view_all_link, defaults.faq_section.view_all_link)}>
                <Button variant="ghost" className="group text-foreground/80 hover:text-foreground px-0" data-testid="view-all-homepage-faqs">
                  {homepageContent.faq_section.view_all_label}
                  <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" strokeWidth={1.5} />
                </Button>
              </ContentLink>
            </div>
          </div>
        </section>
      )}
      {/* Testimonials */}
      {homepageContent.reviews_section.is_active !== false && (
      <section className="py-24 md:py-28 bg-clay/20" data-testid="testimonials-section">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              {homepageContent.reviews_section.eyebrow}
            </p>
            <h2 className="font-heading text-4xl md:text-5xl tracking-tight">{homepageContent.reviews_section.heading}</h2>
          </div>
          <div>
            <Carousel
              opts={{ align: 'start', loop: true }}
              plugins={homepageContent.reviews_section.auto_scroll_enabled !== false ? [reviewAutoScrollRef.current] : []}
              className="w-full select-none"
              aria-label="Customer reviews"
            >
              <CarouselContent className="-ml-5 py-1">
                {reviewCarouselTestimonials.map((testimonial, index) => {
                  const rating = clampRating(testimonial.rating);
                  const isRepeatedSlide = index >= marqueeTestimonials.length;

                  return (
                    <CarouselItem key={`${testimonial.name}-${index}`} className="basis-[88%] pl-5 sm:basis-[68%] md:basis-1/2 lg:basis-1/3">
                      <article
                        className="flex min-h-[18rem] h-full flex-col rounded-[1.25rem] border border-black/5 bg-white p-8 shadow-[0_12px_30px_rgba(0,0,0,0.06)]"
                        data-testid={`testimonial-${index % marqueeTestimonials.length}`}
                        aria-hidden={isRepeatedSlide ? 'true' : undefined}
                      >
                        <div className="mb-4 flex gap-1">
                          {[...Array(rating)].map((_, i) => (
                            <Star key={i} className="h-4 w-4 fill-terracotta text-terracotta" />
                          ))}
                        </div>
                        <p className="mb-6 line-clamp-5 text-lg italic leading-8 text-foreground/80 font-serif-accent">
                          "{testimonial.text}"
                        </p>
                        <p className="mt-auto text-sm font-medium">{testimonial.name || 'Mariso Customer'}</p>
                      </article>
                    </CarouselItem>
                  );
                })}
              </CarouselContent>
              {marqueeTestimonials.length > 3 && (
                <>
                  <CarouselPrevious className={`${carouselArrowClass} left-auto right-14 -top-[4.9rem] translate-y-0`} />
                  <CarouselNext className={`${carouselArrowClass} right-0 -top-[4.9rem] translate-y-0`} />
                </>
              )}
            </Carousel>
          </div>
        </div>
      </section>
      )}

      {/* Instagram Section */}
      <section className="py-24 md:py-28 bg-[#F8F5F1]" data-testid="instagram-section">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
          <div className="text-center mb-12">
            <p className="text-xs tracking-[0.2em] uppercase text-muted-foreground mb-3">
              {homepageContent.follow_journey.eyebrow}
            </p>
            <h2 className="font-heading text-4xl md:text-5xl tracking-tight">{homepageContent.follow_journey.heading}</h2>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
            {journeyCards.map((card, index) => {
              const target = getSafeLink(card.link);
              const className = "group relative aspect-square overflow-hidden rounded-[1rem] shadow-[0_8px_24px_rgba(0,0,0,0.06)]";
              const content = (
                <>
                <img
                  src={getSafeMediaUrl(card.image, defaults.follow_journey.cards[index]?.image || defaultCategoryImage)}
                  alt={card.alt_text || `Instagram ${index + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                  decoding="async"
                />
                <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/20 transition-colors duration-300" />
                </>
              );

              return target ? (
                <ContentLink key={card.id || index} href={target} className={className} data-testid={`instagram-image-${index}`}>
                  {content}
                </ContentLink>
              ) : (
                <div key={card.id || index} className={className} data-testid={`instagram-image-${index}`}>
                  {content}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Newsletter */}
      {homepageContent.newsletter.is_active !== false && (
      <section className="py-24 md:py-32 bg-primary text-primary-foreground relative overflow-hidden" data-testid="newsletter-section">
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute -top-20 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full border border-white/20" />
          <div className="absolute bottom-[-120px] right-[-40px] h-64 w-64 rounded-full border border-white/10" />
        </div>
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8 text-center">
          <h2 className="font-heading text-4xl md:text-5xl tracking-[-0.02em] mb-4">{homepageContent.newsletter.heading}</h2>
          <p className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">
            {homepageContent.newsletter.subheading}
          </p>
          <form className="flex flex-col sm:flex-row gap-4 justify-center max-w-xl mx-auto" onSubmit={(e) => e.preventDefault()}>
            <input
              type="email"
              placeholder={homepageContent.newsletter.input_placeholder}
              className="flex-1 h-12 px-6 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 text-white placeholder:text-white/50 focus:outline-none focus:border-white/40"
              data-testid="newsletter-email-home"
            />
            <Button 
              type="submit"
              className="bg-white text-foreground hover:bg-white/90 h-12 px-8 rounded-full shadow-sm"
              data-testid="newsletter-submit-home"
            >
              {homepageContent.newsletter.button_label}
            </Button>
          </form>
        </div>
      </section>
      )}
    </Layout>
  );
};

export default HomePage;
