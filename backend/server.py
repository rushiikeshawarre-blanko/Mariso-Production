from fastapi import FastAPI, APIRouter, Response
from starlette.middleware.cors import CORSMiddleware
import logging
from core.db_indexes import create_indexes
from routes.products import router as products_router
from routes.categories import router as categories_router
from routes.orders import router as orders_router
from routes.wishlist import router as wishlists_router
from routes.admin import router as admins_router
from routes.addresses import router as addresses_router
from routes.seed import router as seed_router
from routes.upload import router as upload_router
from routes.auth import router as auth_router
from routes.content import router as content_router
from routes.payments import router as payments_router
from routes.coupons import router as coupons_router
from routes.feedback import router as feedback_router

from core.config import (
    ENVIRONMENT,
    FRONTEND_URL,
)
from core.database import db, close_mongo_connection

logger = logging.getLogger("mariso-backend")
logging.basicConfig(level=logging.INFO)


# Create the main app
app = FastAPI(title="Mariso Candles API")

allowed_origins = []

if ENVIRONMENT == "development":
    allowed_origins.extend([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ])

if FRONTEND_URL:
    allowed_origins.append(FRONTEND_URL)

allowed_origins = list(dict.fromkeys(allowed_origins))

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def startup_db_check():
    logger.info("Allowed CORS origins (%s): %s", ENVIRONMENT, allowed_origins)

    try:
        await db.command("ping")
        logger.info("MongoDB connected successfully")
    except Exception as e:
        logger.error(f"MongoDB connection failed: {e}")
        raise e
    
    await create_indexes(db)


@app.get("/")
async def root():
    return {"message": "Mariso API is running"}

# Create router with /api prefix
api_router = APIRouter(prefix="/api")

@api_router.get("/")
async def api_root():
    return {"message": "Mariso Candles API"}

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.head("/health")
async def health_head():
    return Response(status_code=200)

# Include the routers
app.include_router(content_router)
app.include_router(auth_router)
app.include_router(upload_router)
if ENVIRONMENT == "development":
    app.include_router(seed_router)
app.include_router(addresses_router)
app.include_router(admins_router)
app.include_router(wishlists_router)
app.include_router(orders_router)
app.include_router(payments_router)
app.include_router(categories_router)
app.include_router(products_router)
app.include_router(coupons_router)
app.include_router(feedback_router)
app.include_router(api_router)



@app.on_event("shutdown")
async def shutdown_db_client():
    close_mongo_connection()
