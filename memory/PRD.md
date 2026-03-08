# Mariso Candles - Product Requirements Document

## Original Problem Statement
Build a premium full-stack e-commerce platform for Mariso Candles - a handcrafted home décor brand with:
- Customer Storefront (Home, Shop, Product, Cart, Checkout pages)
- Admin Dashboard (Analytics, Products, Categories, Orders, Customers)
- JWT authentication with email/password and OTP login
- Mock payment checkout flow

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

## What's Been Implemented
### January 2026 - Initial Build
- Complete e-commerce storefront with React + FastAPI + MongoDB
- 5 product categories, 13 seeded products
- JWT authentication with simulated OTP
- Admin dashboard with revenue/order analytics

### January 2026 - Enhancements
- Supporting Our Artisans section on homepage
- Video content section (3 craft process cards)
- Quick action icons on product cards (wishlist, quick add)
- Color variant selector on product page
- Collapsible accordion for product details/care/shipping
- Gift packaging option in cart (₹149)
- Recommended products section in cart
- "Why Choose Mariso" section in checkout
- @marisocandles Instagram handle in footer

## Prioritized Backlog

### P0 - Critical
- [x] Core shopping flow (browse → cart → checkout)
- [x] User authentication
- [x] Admin product management

### P1 - Important
- [ ] Real video embeds for craft process section
- [ ] Product-specific color variants from database
- [ ] Email notification for orders
- [ ] Product reviews/ratings

### P2 - Nice to Have
- [ ] Custom candle order form
- [ ] Advanced search/filtering
- [ ] Promo code system
- [ ] Customer loyalty program

## Technical Architecture
- **Frontend:** React 18, TailwindCSS, ShadCN UI
- **Backend:** FastAPI, MongoDB, JWT Auth
- **Database:** MongoDB (test_database)
- **Admin:** admin@mariso.com / admin123

## Next Tasks
1. Add video URLs for craft process section
2. Implement product-specific color variants
3. Add email integration for order notifications
4. Build custom candle order form
