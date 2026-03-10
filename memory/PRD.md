# Mariso Candles - Product Requirements Document

## Original Problem Statement
Build a premium full-stack e-commerce platform for Mariso Candles - a handcrafted home décor brand with:
- Customer Storefront (Home, Shop, Product, Cart, Checkout pages)
- Admin Dashboard (Analytics, Products, Categories, Orders, Customers)
- JWT authentication with email/password and OTP login
- Mock payment checkout flow
- **Dynamic Product Variants** with admin-editable color/flavor options, each with unique images

## Brand Information
- **Brand Name:** Mariso Candles
- **Tagline:** Handcrafted homewares & hand-poured candles designed to elevate everyday living
- **Color Palette:** Ivory (#F8F5F1), Clay Beige (#D7C5B8), Soft Terracotta (#C98E74)
- **Typography:** Playfair Display (headings), Inter (body)

## User Personas
1. **Gift Shoppers** - Looking for unique, handcrafted gifts
2. **Home Decor Enthusiasts** - Interior design lovers, ages 25-45
3. **Eco-conscious Consumers** - Value sustainable, reusable products

## Core Requirements (Static)
- [x] Home page with hero, featured products, categories, testimonials
- [x] Shop page with filters and product grid
- [x] Product detail pages with gallery, description, add to cart
- [x] Shopping cart with quantity management
- [x] Mock checkout flow with billing form
- [x] JWT authentication (email/password + OTP)
- [x] User account (profile, orders, wishlist, addresses)
- [x] Admin dashboard with analytics
- [x] Admin CRUD for products, categories, orders
- [x] **Dynamic Product Variants System**

## What's Been Implemented

### January 2026 - Initial Build
- Complete e-commerce storefront with React + FastAPI + MongoDB
- 5 product categories, seeded products with variants
- JWT authentication with simulated OTP
- Admin dashboard with revenue/order analytics

### January 2026 - Enhancements
- Supporting Our Artisans section on homepage
- Video content section (3 craft process cards)
- Quick action icons on product cards (wishlist, quick add)
- Collapsible accordion for product details/care/shipping
- Gift packaging option in cart (₹149)
- Recommended products section in cart
- "Why Choose Mariso" section in checkout
- @marisocandles Instagram handle in footer

### March 2026 - Product Variants System (COMPLETED)
- **Backend Model Updates:**
  - `ColorOption` with id, name, hex_code, and images array
  - `FlavorOption` with id, name, description, and images array
  - `has_color_options` and `has_flavor_options` flags on products
  - Full CRUD support for variant management via admin API
- **Product Page (Storefront):**
  - Dynamic color swatches from product.color_options
  - Dynamic flavor/fragrance buttons from product.flavor_options
  - Image gallery updates based on selected color/flavor variant
  - Variant info included in cart (selectedColor, selectedFlavor)
- **Admin Dashboard:**
  - Products table shows "Variants" column with color/flavor counts
  - Edit Product dialog has 3 tabs: Basic Info, Variants, Details
  - Variants tab allows adding/removing color options with name, hex code, images
  - Variants tab allows adding/removing flavor options with name, description, images
  - Status tags (Sale, Featured, New) displayed in products table

## Prioritized Backlog

### P0 - Critical (COMPLETED)
- [x] Core shopping flow (browse → cart → checkout)
- [x] User authentication
- [x] Admin product management
- [x] **Dynamic Product Variants System**

### P1 - Important
- [ ] Real video embeds for craft process section
- [ ] Email notification for orders
- [ ] Product reviews/ratings

### P2 - Nice to Have
- [ ] Custom candle order form
- [ ] Advanced search/filtering
- [ ] Promo code system
- [ ] Customer loyalty program

## Technical Architecture
- **Frontend:** React 18, TailwindCSS, ShadCN UI, Framer Motion
- **Backend:** FastAPI, MongoDB, JWT Auth
- **Database:** MongoDB (test_database)
- **Admin:** admin@mariso.com / admin123

## API Endpoints

### Products
- `GET /api/products` - List products (supports filtering)
- `GET /api/products/{id}` - Get product with variants
- `POST /api/admin/products` - Create product with variants
- `PUT /api/admin/products/{id}` - Update product variants
- `DELETE /api/admin/products/{id}` - Delete product

### Categories
- `GET /api/categories`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/{id}`
- `DELETE /api/admin/categories/{id}`

### Orders
- `POST /api/orders` - Create order
- `GET /api/orders` - User's orders
- `GET /api/admin/orders` - All orders
- `PUT /api/admin/orders/{id}/status` - Update status

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `GET /api/auth/me`

## Data Models

### Product (with Variants)
```json
{
  "id": "uuid",
  "name": "Product Name",
  "slug": "product-name",
  "description": "...",
  "short_description": "...",
  "price": 1299,
  "discount_price": 999,
  "category_id": "uuid",
  "stock": 25,
  "images": ["url1", "url2"],
  "has_color_options": true,
  "has_flavor_options": true,
  "color_options": [
    {"id": "uuid", "name": "Natural White", "hex_code": "#F5F0E8", "images": ["url1"]}
  ],
  "flavor_options": [
    {"id": "uuid", "name": "Vanilla", "description": "Warm and comforting", "images": ["url1"]}
  ],
  "is_on_sale": false,
  "is_featured": true,
  "is_bestseller": false,
  "is_new_arrival": true,
  "care_instructions": "...",
  "shipping_info": "...",
  "materials": "...",
  "dimensions": "...",
  "burn_time": "..."
}
```

## Test Coverage
- Backend: 9 pytest tests for variant APIs (100% pass)
- Frontend: E2E tests for product variants and admin variants (100% pass)
- Test files: `/app/backend/tests/test_variants.py`, `/app/tests/e2e/product-variants.spec.ts`, `/app/tests/e2e/admin-variants.spec.ts`

## Next Tasks
1. Implement Order Management UI in admin dashboard
2. Implement Customer Management UI in admin dashboard
3. Add email notifications for orders
4. Implement product reviews/ratings
