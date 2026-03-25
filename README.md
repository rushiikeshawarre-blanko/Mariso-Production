Mariso Production

Full-stack e-commerce platform for handcrafted candles and home décor.

Tech Stack
	•	Frontend: React (CRACO)
	•	Backend: FastAPI
	•	Database: MongoDB (assumed)

Setup

Frontend

cd frontend
npm install
npm start

Backend

cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn server:app -–reload

## Features

- Product catalog with variant support (color + fragrance)

- Dynamic pricing system:
  - Base price
  - Discount price
  - Variant-level price override

- Variant-based inventory system:
  - Stock managed per combination (color + fragrance)
  - Active/inactive variant control
  - Base stock disabled when variants exist

- Storefront variant selection:
  - Users select color and fragrance
  - Price and availability update dynamically
  - Prevents selection of inactive or unavailable combinations

- Inventory-safe cart system:
  - Variant-specific stock validation
  - Quantity limited by live variant stock
  - Prevents adding out-of-stock combinations

- Checkout flow with backend validation

- Admin panel for product & inventory management:
  - Generate variant combinations
  - Edit SKU, stock, and price per variant
  - Real-time stock summary

- Order creation and management

- Email notifications:
  - Order placed confirmation
  - Order status updates

## Inventory Handling

The system ensures stock consistency across:

- Product page (variant-aware availability)
- Cart (variant-level quantity validation)
- Checkout (final backend verification)
- Admin inventory management

All pricing and stock calculations are validated server-side, ensuring accurate handling of variant-based inventory.

Status

🚧 Production preparation in progress

Latest updates:
- Variant-based inventory system implemented
- Storefront variant selection completed
- Email notification system integrated
