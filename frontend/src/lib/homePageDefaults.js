export const HOMEPAGE_PREVIEW_STORAGE_KEY = 'mariso.homepage.previewDraft';

const HOME_PAGE_ADMIN_DEFAULTS = {
  announcement: {
    announcement_enabled: true,
    announcement_text: 'Use code MARISO10 for 10% off on selected candles',
    announcement_link: '',
    announcement_bg_color: '#8A6F55',
    announcement_text_color: '#FFFFFF',
  },
  hero: {
    eyebrow: 'Handcrafted with Love',
    heading: 'Handcrafted Candles\n& Homewares',
    subheading: 'Designed to Glow with Your Space',
    background_image: 'https://images.unsplash.com/photo-1759157273068-42e6d441f772?crop=entropy&cs=srgb&fm=jpg&q=85',
    hero_overlay_opacity: 55,
    hero_eyebrow_color: '#5F554F',
    hero_title_color: '#1C1917',
    hero_subtitle_color: '#4A403A',
    buttons: [
      {
        id: 'default-hero-candles',
        label: 'SHOP CANDLES',
        link: '/shop?parent=candles',
        style: 'primary',
        is_active: true,
        sort_order: 0,
      },
      {
        id: 'default-hero-homewares',
        label: 'SHOP HOMEWARES',
        link: '/shop?parent=homewares',
        style: 'secondary',
        is_active: true,
        sort_order: 1,
      },
    ],
  },
  featured_collection: {
    eyebrow: 'New Arrivals',
    heading: 'Featured Collection',
    view_all_label: 'VIEW ALL',
    view_all_link: '/shop?featured=true',
    is_active: true,
  },
  shop_by_category: {
    eyebrow: 'Explore',
    heading: 'Shop by Category',
    card_count: 5,
    template: 'feature-four',
    cards: [],
  },
  crafted_with_intention: {
    eyebrow: 'Our Story',
    heading: 'Crafted with Intention',
    paragraphs: [
      'At Mariso, we believe in the beauty of imperfection. Each candle is hand-poured with care, ensuring no two pieces are exactly alike. Our jesmonite coasters and containers are crafted using eco-friendly materials, designed to be treasured long after the last flame.',
      'Every Mariso container is thoughtfully designed to be reused as décor or storage once the candle has finished, embodying our commitment to sustainable luxury.',
    ],
    button_label: 'Read Our Story',
    button_link: '/about',
    image: 'https://images.unsplash.com/photo-1662845114342-256fdc45981d?crop=entropy&cs=srgb&fm=jpg&q=85',
    floating_badge_text: '100% Handcrafted',
    is_active: true,
  },
  bestsellers: {
    eyebrow: 'Most Loved',
    heading: 'Bestsellers',
    view_all_label: 'VIEW ALL',
    view_all_link: '/shop?bestsellers=true',
    is_active: true,
  },
  supporting_artisans: {
    eyebrow: 'Made with Love',
    heading: 'Supporting Our Artisans',
    paragraphs: [
      'At Mariso, every product tells a story. Our candles and handcrafted containers are created in collaboration with skilled artisans who bring generations of craftsmanship into every piece.',
      'By choosing Mariso, you are not just purchasing a candle — you are supporting traditional artistry, sustainable craftsmanship, and the livelihoods of talented makers.',
      'Each terracotta container, handcrafted coaster, and candle bouquet reflects patience, creativity, and dedication. Your purchase helps keep these crafts alive while bringing warmth and beauty into your home.',
    ],
    image: 'https://images.unsplash.com/photo-1662845114342-256fdc45981d?crop=entropy&cs=srgb&fm=jpg&q=85',
    is_active: true,
  },
  craft_process: {
    eyebrow: 'Behind the Scenes',
    heading: 'Our Craft Process',
    cards: [
      {
        id: 'default-process-candle',
        title: 'Candle Making',
        description: 'Watch our artisans hand-pour premium soy wax candles with precision and care.',
        image: 'https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800',
        video: '',
        show_play_icon: true,
        link: '',
        is_active: true,
        sort_order: 0,
      },
      {
        id: 'default-process-terracotta',
        title: 'Terracotta Craft',
        description: 'Discover how our containers are shaped and finished by skilled clay artisans.',
        image: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800',
        video: '',
        show_play_icon: true,
        link: '',
        is_active: true,
        sort_order: 1,
      },
      {
        id: 'default-process-bouquet',
        title: 'Bouquet Burn Guide',
        description: 'Learn how to safely burn and enjoy your candle bouquet flowers.',
        image: 'https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800',
        video: '',
        show_play_icon: true,
        link: '',
        is_active: true,
        sort_order: 2,
      },
    ],
  },
  faq_section: {
    eyebrow: 'Help Center',
    heading: 'Frequently Asked Questions',
    subheading: 'Quick answers to the most common questions about shopping, shipping, returns, and support.',
    view_all_label: 'View All FAQs',
    view_all_link: '/faq',
    is_active: true,
  },
  reviews_section: {
    eyebrow: 'Reviews',
    heading: 'What Our Customers Say',
    auto_scroll_enabled: true,
    is_active: true,
  },
  follow_journey: {
    eyebrow: '@marisocandles',
    heading: 'Follow Our Journey',
    cards: [
      {
        id: 'default-journey-1',
        image: 'https://images.unsplash.com/photo-1766393030567-2204662b0be2?crop=entropy&cs=srgb&fm=jpg&q=85&w=400',
        alt_text: 'Instagram 1',
        link: 'https://instagram.com',
        is_active: true,
        sort_order: 0,
      },
      {
        id: 'default-journey-2',
        image: 'https://images.unsplash.com/photo-1595515106886-43b1443a2e8b?crop=entropy&cs=srgb&fm=jpg&q=85&w=400',
        alt_text: 'Instagram 2',
        link: 'https://instagram.com',
        is_active: true,
        sort_order: 1,
      },
      {
        id: 'default-journey-3',
        image: 'https://images.pexels.com/photos/9518738/pexels-photo-9518738.jpeg?auto=compress&cs=tinysrgb&w=400',
        alt_text: 'Instagram 3',
        link: 'https://instagram.com',
        is_active: true,
        sort_order: 2,
      },
      {
        id: 'default-journey-4',
        image: 'https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?crop=entropy&cs=srgb&fm=jpg&q=85&w=400',
        alt_text: 'Instagram 4',
        link: 'https://instagram.com',
        is_active: true,
        sort_order: 3,
      },
    ],
  },
  newsletter: {
    heading: 'Join the Mariso Family',
    subheading: 'Subscribe for exclusive offers, new product launches, and candle care tips.',
    input_placeholder: 'Enter your email',
    button_label: 'Subscribe',
    is_active: true,
  },
};

export const clampHeroOverlayOpacity = (value) => {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return 55;
  return Math.min(Math.max(Math.round(numericValue), 0), 80);
};

export const isValidHeroHexColor = (value) => /^#[0-9a-fA-F]{6}$/.test(String(value || '').trim());

export const getSafeHeroHexColor = (value, fallback) => (
  isValidHeroHexColor(value) ? String(value).trim() : fallback
);

export const getHeroOverlayGradient = (opacity) => {
  const opacityRatio = clampHeroOverlayOpacity(opacity) / 100;
  const stopAlpha = (multiplier) => Math.min(Math.max(opacityRatio * multiplier, 0), 0.96).toFixed(3);

  return `linear-gradient(to bottom, rgba(248, 245, 241, ${stopAlpha(0.64)}), rgba(248, 245, 241, ${stopAlpha(0.82)}), rgba(248, 245, 241, ${stopAlpha(1.27)}))`;
};

export const createHomePageAdminDefaults = () => JSON.parse(JSON.stringify(HOME_PAGE_ADMIN_DEFAULTS));
