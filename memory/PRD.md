# Mariso Candles - Product Requirements Document

## Original Problem Statement
Build a premium full-stack e-commerce platform for Mariso Candles - a handcrafted home décor brand with:
- Customer Storefront (Home, Shop, Product, Cart, Checkout pages)
- Admin Dashboard (Analytics, Products, Categories, Orders, Customers)
- JWT authentication with email/password and OTP login
- Mock payment checkout flow
- **Dynamic Product Variants** with admin-editable color/flavor options, each with unique images
- **Variant Combination Stock** - Track stock per color + fragrance combination
- **Dual-Color Support** - Products can have two-tone color swatches

## Brand Information
- **Brand Name:** Mariso Candles
- **Tagline:** Handcrafted homewares & hand-poured candles designed to elevate everyday living
- **Color Palette:** Ivory (#F8F5F1), Clay Beige (#D7C5B8), Soft Terracotta (#C98E74)
- **Typography:** Playfair Display (headings), Inter (body)

## Core Requirements (Static)
- [x] Home page with hero, featured products, categories, testimonials
- [x] Shop page with filters and product grid
- [x] Product detail pages with gallery, description, add to cart
- [x] Shopping cart with quantity management
- [x] Mock checkout flow with billing form
- [x] JWT authentication (email/password + OTP)
- [x] Admin dashboard with analytics
- [x] Admin CRUD for products, categories, orders
- [x] **Dynamic Product Variants System**
- [x] **Variant Combination Stock Management**
- [x] **Dual-Color Swatches (hex_code_secondary)**
- [x] **Simplified Stock Display (In Stock / Last few left! / Out of Stock)**

## What's Been Implemented

### March 2026 - Product Variants System V2
- **Dual-Color Support:**
  - `hex_code_secondary` field on color options
  - Split-circle diagonal gradient display (primary 50% + secondary 50%)
  - Admin can add dual-tone colors with live preview
- **Simplified Stock Display:**
  - "✓ In Stock" when stock > 5 (no exact numbers)
  - "Last few left!" when stock is 1-5
  - "Out of Stock for [Color] + [Fragrance]" when stock = 0
- **Admin UI Enhancements:**
  - Primary + Secondary color inputs with live preview
  - Dual-color swatches shown in variant combination table

### March 2026 - Product Variants System V1
- **Variant Combination Stock:**
  - Track stock per color + fragrance combination (e.g., Pink+Rose=12, Pink+Vanilla=0)
  - Generate Combinations button auto-creates all combos
  - Editable table with SKU, Price Override, Stock, Active toggle
  - Summary showing total combinations, total stock, out-of-stock count
- **Color-Based Image Galleries:**
  - Each color has up to 5 images
  - Image gallery swaps when color is selected
  - Admin can add/edit/reorder images per color

## Prioritized Backlog

### P0 - Critical (PENDING)
- [ ] Razorpay Payment Integration (AWAITING API KEYS)
  - Standard checkout with UPI, Cards, NetBanking, Wallets
  - Order creation with pending → paid status flow
  - Payment verification with signature check
  - Webhook handling for payment.captured events
  - Stock reduction only after successful payment
  - Success/Failure pages
  - Retry payment feature

### P1 - Important
- [ ] Admin Order Management UI
- [ ] Admin Customer Management UI
- [ ] Email notifications for orders

### P2 - Nice to Have
- [ ] Product reviews/ratings
- [ ] Custom candle order form
- [ ] Promo code system
- [ ] COD support

## Technical Architecture
- **Frontend:** React 18, TailwindCSS, ShadCN UI, Framer Motion
- **Backend:** FastAPI, MongoDB, JWT Auth
- **Database:** MongoDB (test_database)
- **Admin:** admin@mariso.com / admin123

## Data Models

### Product (with Variants)
```json
{
  "id": "uuid",
  "name": "Product Name",
  "price": 1299,
  "discount_price": 999,
  "has_color_options": true,
  "has_flavor_options": true,
  "color_options": [
    {
      "id": "uuid",
      "name": "Blush Pink & White",
      "hex_code": "#FFB6C1",
      "hex_code_secondary": "#FFFFFF",
      "images": ["url1", "url2", "url3", "url4", "url5"]
    }
  ],
  "flavor_options": [
    {"id": "uuid", "name": "Vanilla", "description": "Warm and comforting"}
  ],
  "variants": [
    {
      "id": "uuid",
      "color_id": "uuid",
      "color_name": "Blush Pink & White",
      "flavor_id": "uuid",
      "flavor_name": "Vanilla",
      "sku": "CB-PNK-VAN",
      "price_override": null,
      "stock": 12,
      "is_active": true
    }
  ]
}
```

## Next Tasks
1. **WAITING:** Razorpay API credentials to implement payment integration
2. Implement Order Management UI in admin dashboard
3. Implement Customer Management UI in admin dashboard
4. Add email notifications for orders
