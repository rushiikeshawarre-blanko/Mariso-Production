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
  - Variant price override
- Inventory-safe cart system:
  - Prevents adding out-of-stock items
  - Quantity limited by live stock
  - Variant-specific stock handling
- Checkout flow with backend validation
- Admin panel for product & inventory management
- Order creation and management

## Inventory Handling

The system ensures stock consistency across:
- Product page
- Cart
- Checkout
- Backend validation

All pricing and stock calculations are validated server-side.

Status

🚧 Production preparation in progress
