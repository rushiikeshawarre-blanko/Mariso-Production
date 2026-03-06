from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import jwt
import bcrypt
import random
import string
import base64

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'mariso-candles-secret-key-2024')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24

# Create the main app
app = FastAPI(title="Mariso Candles API")

# Create router with /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer()

# ==================== MODELS ====================

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class OTPRequest(BaseModel):
    email: EmailStr

class OTPVerify(BaseModel):
    email: EmailStr
    otp: str

class UserResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str
    role: str
    created_at: str

class AddressCreate(BaseModel):
    name: str
    phone: str
    address: str
    city: str
    postal_code: str
    is_default: bool = False

class CategoryCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    image: Optional[str] = ""

class CategoryResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str
    image: str
    created_at: str

class ProductCreate(BaseModel):
    name: str
    description: str
    price: float
    sale_price: Optional[float] = None
    category_id: str
    stock: int = 0
    images: List[str] = []
    is_on_sale: bool = False
    sale_start: Optional[str] = None
    sale_end: Optional[str] = None
    care_instructions: Optional[str] = ""
    shipping_info: Optional[str] = ""

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    sale_price: Optional[float] = None
    category_id: Optional[str] = None
    stock: Optional[int] = None
    images: Optional[List[str]] = None
    is_on_sale: Optional[bool] = None
    sale_start: Optional[str] = None
    sale_end: Optional[str] = None
    care_instructions: Optional[str] = None
    shipping_info: Optional[str] = None

class ProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    description: str
    price: float
    sale_price: Optional[float]
    category_id: str
    category_name: Optional[str] = ""
    stock: int
    images: List[str]
    is_on_sale: bool
    sale_start: Optional[str]
    sale_end: Optional[str]
    care_instructions: str
    shipping_info: str
    created_at: str

class CartItem(BaseModel):
    product_id: str
    quantity: int

class OrderCreate(BaseModel):
    items: List[CartItem]
    billing_name: str
    billing_phone: str
    billing_email: EmailStr
    billing_address: str
    billing_city: str
    billing_postal_code: str
    payment_method: str
    total_price: float

class OrderStatusUpdate(BaseModel):
    status: str

class OrderResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    user_name: Optional[str] = ""
    user_email: Optional[str] = ""
    items: List[dict]
    billing_name: str
    billing_phone: str
    billing_email: str
    billing_address: str
    billing_city: str
    billing_postal_code: str
    payment_method: str
    total_price: float
    status: str
    created_at: str

class WishlistItem(BaseModel):
    product_id: str

# ==================== HELPER FUNCTIONS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, email: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    payload = decode_token(token)
    user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = await get_current_user(credentials)
    if user['role'] != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

def generate_otp() -> str:
    return ''.join(random.choices(string.digits, k=6))

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register", response_model=dict)
async def register(user: UserCreate):
    existing = await db.users.find_one({"email": user.email}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "name": user.name,
        "email": user.email,
        "password": hash_password(user.password),
        "role": "user",
        "addresses": [],
        "wishlist": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    
    token = create_token(user_id, user.email, "user")
    return {
        "token": token,
        "user": {
            "id": user_id,
            "name": user.name,
            "email": user.email,
            "role": "user"
        }
    }

@api_router.post("/auth/login", response_model=dict)
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email}, {"_id": 0})
    if not user or not verify_password(credentials.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    token = create_token(user['id'], user['email'], user['role'])
    return {
        "token": token,
        "user": {
            "id": user['id'],
            "name": user['name'],
            "email": user['email'],
            "role": user['role']
        }
    }

@api_router.post("/auth/request-otp", response_model=dict)
async def request_otp(request: OTPRequest):
    otp = generate_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    await db.otps.update_one(
        {"email": request.email},
        {"$set": {"otp": otp, "expires": expires.isoformat()}},
        upsert=True
    )
    
    # Simulated OTP - in production, send via email
    logging.info(f"OTP for {request.email}: {otp}")
    
    return {"message": "OTP sent successfully", "otp": otp}  # Return OTP for demo

@api_router.post("/auth/verify-otp", response_model=dict)
async def verify_otp(request: OTPVerify):
    otp_doc = await db.otps.find_one({"email": request.email}, {"_id": 0})
    if not otp_doc:
        raise HTTPException(status_code=400, detail="OTP not found")
    
    if otp_doc['otp'] != request.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    expires = datetime.fromisoformat(otp_doc['expires'])
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="OTP expired")
    
    # Check if user exists, create if not
    user = await db.users.find_one({"email": request.email}, {"_id": 0})
    if not user:
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "name": request.email.split('@')[0],
            "email": request.email,
            "password": "",
            "role": "user",
            "addresses": [],
            "wishlist": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user)
    
    await db.otps.delete_one({"email": request.email})
    
    token = create_token(user['id'], user['email'], user['role'])
    return {
        "token": token,
        "user": {
            "id": user['id'],
            "name": user['name'],
            "email": user['email'],
            "role": user['role']
        }
    }

@api_router.get("/auth/me", response_model=dict)
async def get_me(user: dict = Depends(get_current_user)):
    return {
        "id": user['id'],
        "name": user['name'],
        "email": user['email'],
        "role": user['role'],
        "addresses": user.get('addresses', []),
        "wishlist": user.get('wishlist', [])
    }

@api_router.put("/auth/profile", response_model=dict)
async def update_profile(data: dict, user: dict = Depends(get_current_user)):
    update_fields = {}
    if 'name' in data:
        update_fields['name'] = data['name']
    
    if update_fields:
        await db.users.update_one({"id": user['id']}, {"$set": update_fields})
    
    updated_user = await db.users.find_one({"id": user['id']}, {"_id": 0, "password": 0})
    return updated_user

# ==================== ADDRESS ROUTES ====================

@api_router.post("/addresses", response_model=dict)
async def add_address(address: AddressCreate, user: dict = Depends(get_current_user)):
    address_id = str(uuid.uuid4())
    address_doc = {
        "id": address_id,
        **address.model_dump()
    }
    
    if address.is_default:
        await db.users.update_one(
            {"id": user['id']},
            {"$set": {"addresses.$[].is_default": False}}
        )
    
    await db.users.update_one(
        {"id": user['id']},
        {"$push": {"addresses": address_doc}}
    )
    
    return address_doc

@api_router.delete("/addresses/{address_id}", response_model=dict)
async def delete_address(address_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": user['id']},
        {"$pull": {"addresses": {"id": address_id}}}
    )
    return {"message": "Address deleted"}

# ==================== CATEGORY ROUTES ====================

@api_router.get("/categories", response_model=List[CategoryResponse])
async def get_categories():
    categories = await db.categories.find({}, {"_id": 0}).to_list(100)
    return categories

@api_router.get("/categories/{category_id}", response_model=CategoryResponse)
async def get_category(category_id: str):
    category = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category

@api_router.post("/admin/categories", response_model=CategoryResponse)
async def create_category(category: CategoryCreate, admin: dict = Depends(get_admin_user)):
    category_id = str(uuid.uuid4())
    category_doc = {
        "id": category_id,
        "name": category.name,
        "description": category.description or "",
        "image": category.image or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.categories.insert_one(category_doc)
    return category_doc

@api_router.put("/admin/categories/{category_id}", response_model=CategoryResponse)
async def update_category(category_id: str, category: CategoryCreate, admin: dict = Depends(get_admin_user)):
    update_data = category.model_dump(exclude_unset=True)
    await db.categories.update_one({"id": category_id}, {"$set": update_data})
    updated = await db.categories.find_one({"id": category_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Category not found")
    return updated

@api_router.delete("/admin/categories/{category_id}", response_model=dict)
async def delete_category(category_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.categories.delete_one({"id": category_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Category not found")
    return {"message": "Category deleted"}

# ==================== PRODUCT ROUTES ====================

@api_router.get("/products", response_model=List[ProductResponse])
async def get_products(category_id: Optional[str] = None, search: Optional[str] = None, on_sale: Optional[bool] = None):
    query = {}
    if category_id:
        query["category_id"] = category_id
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    if on_sale:
        query["is_on_sale"] = True
    
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    
    # Add category names
    for product in products:
        category = await db.categories.find_one({"id": product.get('category_id')}, {"_id": 0})
        product['category_name'] = category['name'] if category else ""
    
    return products

@api_router.get("/products/featured", response_model=List[ProductResponse])
async def get_featured_products():
    products = await db.products.find({}, {"_id": 0}).to_list(8)
    for product in products:
        category = await db.categories.find_one({"id": product.get('category_id')}, {"_id": 0})
        product['category_name'] = category['name'] if category else ""
    return products

@api_router.get("/products/bestsellers", response_model=List[ProductResponse])
async def get_bestsellers():
    # Get products that have been ordered most
    pipeline = [
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product_id", "count": {"$sum": "$items.quantity"}}},
        {"$sort": {"count": -1}},
        {"$limit": 8}
    ]
    bestseller_ids = await db.orders.aggregate(pipeline).to_list(8)
    
    if not bestseller_ids:
        products = await db.products.find({}, {"_id": 0}).to_list(8)
    else:
        ids = [item['_id'] for item in bestseller_ids]
        products = await db.products.find({"id": {"$in": ids}}, {"_id": 0}).to_list(8)
    
    for product in products:
        category = await db.categories.find_one({"id": product.get('category_id')}, {"_id": 0})
        product['category_name'] = category['name'] if category else ""
    
    return products

@api_router.get("/products/{product_id}", response_model=ProductResponse)
async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    category = await db.categories.find_one({"id": product.get('category_id')}, {"_id": 0})
    product['category_name'] = category['name'] if category else ""
    
    return product

@api_router.post("/admin/products", response_model=ProductResponse)
async def create_product(product: ProductCreate, admin: dict = Depends(get_admin_user)):
    product_id = str(uuid.uuid4())
    product_doc = {
        "id": product_id,
        **product.model_dump(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product_doc)
    
    category = await db.categories.find_one({"id": product.category_id}, {"_id": 0})
    product_doc['category_name'] = category['name'] if category else ""
    
    return product_doc

@api_router.put("/admin/products/{product_id}", response_model=ProductResponse)
async def update_product(product_id: str, product: ProductUpdate, admin: dict = Depends(get_admin_user)):
    update_data = {k: v for k, v in product.model_dump().items() if v is not None}
    await db.products.update_one({"id": product_id}, {"$set": update_data})
    
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Product not found")
    
    category = await db.categories.find_one({"id": updated.get('category_id')}, {"_id": 0})
    updated['category_name'] = category['name'] if category else ""
    
    return updated

@api_router.delete("/admin/products/{product_id}", response_model=dict)
async def delete_product(product_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}

# ==================== ORDER ROUTES ====================

@api_router.post("/orders", response_model=OrderResponse)
async def create_order(order: OrderCreate, user: dict = Depends(get_current_user)):
    order_id = str(uuid.uuid4())
    
    # Get product details for items
    items_with_details = []
    for item in order.items:
        product = await db.products.find_one({"id": item.product_id}, {"_id": 0})
        if product:
            items_with_details.append({
                "product_id": item.product_id,
                "product_name": product['name'],
                "product_image": product['images'][0] if product['images'] else "",
                "price": product['sale_price'] if product['is_on_sale'] and product['sale_price'] else product['price'],
                "quantity": item.quantity
            })
            # Update stock
            await db.products.update_one(
                {"id": item.product_id},
                {"$inc": {"stock": -item.quantity}}
            )
    
    order_doc = {
        "id": order_id,
        "user_id": user['id'],
        "items": items_with_details,
        "billing_name": order.billing_name,
        "billing_phone": order.billing_phone,
        "billing_email": order.billing_email,
        "billing_address": order.billing_address,
        "billing_city": order.billing_city,
        "billing_postal_code": order.billing_postal_code,
        "payment_method": order.payment_method,
        "total_price": order.total_price,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.orders.insert_one(order_doc)
    
    order_doc['user_name'] = user['name']
    order_doc['user_email'] = user['email']
    
    return order_doc

@api_router.get("/orders", response_model=List[OrderResponse])
async def get_user_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user['id']}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return orders

@api_router.get("/orders/{order_id}", response_model=OrderResponse)
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id, "user_id": user['id']}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return order

@api_router.get("/admin/orders", response_model=List[OrderResponse])
async def get_all_orders(status: Optional[str] = None, admin: dict = Depends(get_admin_user)):
    query = {}
    if status:
        query["status"] = status
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    # Add user details
    for order in orders:
        user = await db.users.find_one({"id": order['user_id']}, {"_id": 0})
        if user:
            order['user_name'] = user['name']
            order['user_email'] = user['email']
    
    return orders

@api_router.put("/admin/orders/{order_id}/status", response_model=OrderResponse)
async def update_order_status(order_id: str, status_update: OrderStatusUpdate, admin: dict = Depends(get_admin_user)):
    valid_statuses = ["pending", "confirmed", "packed", "shipped", "delivered"]
    if status_update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")
    
    await db.orders.update_one({"id": order_id}, {"$set": {"status": status_update.status}})
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    user = await db.users.find_one({"id": order['user_id']}, {"_id": 0})
    if user:
        order['user_name'] = user['name']
        order['user_email'] = user['email']
    
    return order

# ==================== WISHLIST ROUTES ====================

@api_router.post("/wishlist", response_model=dict)
async def add_to_wishlist(item: WishlistItem, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": user['id']},
        {"$addToSet": {"wishlist": item.product_id}}
    )
    return {"message": "Added to wishlist"}

@api_router.delete("/wishlist/{product_id}", response_model=dict)
async def remove_from_wishlist(product_id: str, user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"id": user['id']},
        {"$pull": {"wishlist": product_id}}
    )
    return {"message": "Removed from wishlist"}

@api_router.get("/wishlist", response_model=List[ProductResponse])
async def get_wishlist(user: dict = Depends(get_current_user)):
    user_doc = await db.users.find_one({"id": user['id']}, {"_id": 0})
    wishlist_ids = user_doc.get('wishlist', [])
    
    products = await db.products.find({"id": {"$in": wishlist_ids}}, {"_id": 0}).to_list(100)
    
    for product in products:
        category = await db.categories.find_one({"id": product.get('category_id')}, {"_id": 0})
        product['category_name'] = category['name'] if category else ""
    
    return products

# ==================== ADMIN DASHBOARD ROUTES ====================

@api_router.get("/admin/dashboard", response_model=dict)
async def get_dashboard_stats(admin: dict = Depends(get_admin_user)):
    # Total revenue
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$total_price"}}}]
    revenue_result = await db.orders.aggregate(pipeline).to_list(1)
    total_revenue = revenue_result[0]['total'] if revenue_result else 0
    
    # Total orders
    total_orders = await db.orders.count_documents({})
    
    # Total products
    total_products = await db.products.count_documents({})
    
    # Total customers
    total_customers = await db.users.count_documents({"role": "user"})
    
    # Orders by status
    status_pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    status_result = await db.orders.aggregate(status_pipeline).to_list(10)
    orders_by_status = {item['_id']: item['count'] for item in status_result}
    
    # Recent orders
    recent_orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    for order in recent_orders:
        user = await db.users.find_one({"id": order['user_id']}, {"_id": 0})
        if user:
            order['user_name'] = user['name']
            order['user_email'] = user['email']
    
    # Weekly orders (last 7 days)
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)
    weekly_pipeline = [
        {"$match": {"created_at": {"$gte": week_ago.isoformat()}}},
        {"$group": {
            "_id": {"$substr": ["$created_at", 0, 10]},
            "orders": {"$sum": 1},
            "revenue": {"$sum": "$total_price"}
        }},
        {"$sort": {"_id": 1}}
    ]
    weekly_stats = await db.orders.aggregate(weekly_pipeline).to_list(7)
    
    return {
        "total_revenue": total_revenue,
        "total_orders": total_orders,
        "total_products": total_products,
        "total_customers": total_customers,
        "orders_by_status": orders_by_status,
        "recent_orders": recent_orders,
        "weekly_stats": weekly_stats
    }

@api_router.get("/admin/customers", response_model=List[dict])
async def get_customers(admin: dict = Depends(get_admin_user)):
    users = await db.users.find({"role": "user"}, {"_id": 0, "password": 0}).to_list(1000)
    
    # Add order stats for each customer
    for user in users:
        orders = await db.orders.find({"user_id": user['id']}, {"_id": 0}).to_list(1000)
        user['total_orders'] = len(orders)
        user['total_spending'] = sum(order['total_price'] for order in orders)
    
    return users

# ==================== IMAGE UPLOAD ROUTE ====================

@api_router.post("/upload", response_model=dict)
async def upload_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    contents = await file.read()
    encoded = base64.b64encode(contents).decode('utf-8')
    
    # Store in MongoDB
    image_id = str(uuid.uuid4())
    image_doc = {
        "id": image_id,
        "filename": file.filename,
        "content_type": file.content_type,
        "data": encoded,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.images.insert_one(image_doc)
    
    return {"url": f"/api/images/{image_id}", "id": image_id}

@api_router.get("/images/{image_id}")
async def get_image(image_id: str):
    from fastapi.responses import Response
    
    image = await db.images.find_one({"id": image_id}, {"_id": 0})
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    content = base64.b64decode(image['data'])
    return Response(content=content, media_type=image['content_type'])

# ==================== SEED DATA ====================

@api_router.post("/seed", response_model=dict)
async def seed_database():
    # Check if already seeded
    existing_products = await db.products.count_documents({})
    if existing_products > 0:
        return {"message": "Database already seeded"}
    
    # Create admin user
    admin_id = str(uuid.uuid4())
    admin_doc = {
        "id": admin_id,
        "name": "Admin",
        "email": "admin@mariso.com",
        "password": hash_password("admin123"),
        "role": "admin",
        "addresses": [],
        "wishlist": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(admin_doc)
    
    # Create test user
    test_user_id = str(uuid.uuid4())
    test_user_doc = {
        "id": test_user_id,
        "name": "Aisha Sharma",
        "email": "aisha@test.com",
        "password": hash_password("test123"),
        "role": "user",
        "addresses": [{
            "id": str(uuid.uuid4()),
            "name": "Home",
            "phone": "9876543210",
            "address": "123 Main Street",
            "city": "Mumbai",
            "postal_code": "400001",
            "is_default": True
        }],
        "wishlist": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(test_user_doc)
    
    # Create categories
    categories = [
        {"id": str(uuid.uuid4()), "name": "Jesmonite Coasters", "description": "Handcrafted eco-friendly jesmonite coasters.", "image": "https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Ceramic Coasters", "description": "Elegant ceramic coasters for your home.", "image": "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Reusable Containers", "description": "Artistic containers that can be reused as décor or storage.", "image": "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Container Candles", "description": "Hand-poured candles inside reusable containers.", "image": "https://images.pexels.com/photos/9518738/pexels-photo-9518738.jpeg?w=800", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Candle Bouquets", "description": "Customized decorative candle bouquets for gifting.", "image": "https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.categories.insert_many(categories)
    
    # Create products
    products = [
        # Jesmonite Coasters
        {"id": str(uuid.uuid4()), "name": "Sandstone Ripple Coaster Set", "description": "Beautifully crafted jesmonite coasters with a unique ripple pattern. Set of 4 coasters.", "price": 899, "sale_price": None, "category_id": categories[0]['id'], "stock": 25, "images": ["https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800", "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800"], "is_on_sale": False, "sale_start": None, "sale_end": None, "care_instructions": "Clean with a damp cloth. Avoid harsh chemicals.", "shipping_info": "Ships within 3-5 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Terrazzo Jesmonite Coasters", "description": "Modern terrazzo-style coasters with colorful chips embedded in jesmonite.", "price": 1099, "sale_price": 899, "category_id": categories[0]['id'], "stock": 18, "images": ["https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800"], "is_on_sale": True, "sale_start": "2024-01-01", "sale_end": "2024-12-31", "care_instructions": "Wipe clean with soft cloth.", "shipping_info": "Ships within 3-5 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Minimal Arch Coaster", "description": "Minimalist arch-shaped coaster perfect for modern homes.", "price": 799, "sale_price": None, "category_id": categories[0]['id'], "stock": 30, "images": ["https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800"], "is_on_sale": False, "sale_start": None, "sale_end": None, "care_instructions": "Keep dry when not in use.", "shipping_info": "Ships within 3-5 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        
        # Ceramic Coasters
        {"id": str(uuid.uuid4()), "name": "Glazed Marble Ceramic Coasters", "description": "Elegant ceramic coasters with a beautiful marble glaze finish.", "price": 999, "sale_price": None, "category_id": categories[1]['id'], "stock": 20, "images": ["https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800"], "is_on_sale": False, "sale_start": None, "sale_end": None, "care_instructions": "Dishwasher safe.", "shipping_info": "Ships within 3-5 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Nordic Minimal Ceramic Set", "description": "Scandinavian-inspired ceramic coaster set with clean lines.", "price": 1199, "sale_price": None, "category_id": categories[1]['id'], "stock": 15, "images": ["https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800"], "is_on_sale": False, "sale_start": None, "sale_end": None, "care_instructions": "Hand wash recommended.", "shipping_info": "Ships within 3-5 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        
        # Reusable Containers
        {"id": str(uuid.uuid4()), "name": "Matte Jesmonite Trinket Container", "description": "A versatile matte-finish container perfect for jewelry or small items.", "price": 1299, "sale_price": None, "category_id": categories[2]['id'], "stock": 12, "images": ["https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800"], "is_on_sale": False, "sale_start": None, "sale_end": None, "care_instructions": "Dust with soft cloth.", "shipping_info": "Ships within 5-7 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Rustic Ceramic Storage Bowl", "description": "Handcrafted ceramic bowl with rustic charm, perfect for storage.", "price": 1499, "sale_price": 1199, "category_id": categories[2]['id'], "stock": 10, "images": ["https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800"], "is_on_sale": True, "sale_start": "2024-01-01", "sale_end": "2024-12-31", "care_instructions": "Hand wash only.", "shipping_info": "Ships within 5-7 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        
        # Container Candles
        {"id": str(uuid.uuid4()), "name": "Vanilla Sandstone Candle", "description": "Warm vanilla scent in a beautiful sandstone container. Burns for 45+ hours.", "price": 1299, "sale_price": None, "category_id": categories[3]['id'], "stock": 35, "images": ["https://images.pexels.com/photos/9518738/pexels-photo-9518738.jpeg?w=800", "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800"], "is_on_sale": False, "sale_start": None, "sale_end": None, "care_instructions": "Trim wick to 1/4 inch before each burn. Keep away from drafts.", "shipping_info": "Ships within 3-5 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Lavender Clay Candle", "description": "Calming lavender fragrance in a terracotta clay container.", "price": 1399, "sale_price": None, "category_id": categories[3]['id'], "stock": 28, "images": ["https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800"], "is_on_sale": False, "sale_start": None, "sale_end": None, "care_instructions": "Allow wax to melt to edges on first burn.", "shipping_info": "Ships within 3-5 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Oud & Amber Candle", "description": "Luxurious oud and amber scent for a sophisticated ambiance.", "price": 1499, "sale_price": 1299, "category_id": categories[3]['id'], "stock": 22, "images": ["https://images.pexels.com/photos/9518738/pexels-photo-9518738.jpeg?w=800"], "is_on_sale": True, "sale_start": "2024-01-01", "sale_end": "2024-12-31", "care_instructions": "Never leave burning candle unattended.", "shipping_info": "Ships within 3-5 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        
        # Candle Bouquets
        {"id": str(uuid.uuid4()), "name": "Rose Candle Bouquet", "description": "Elegant arrangement of rose-scented candles, perfect for gifting.", "price": 2499, "sale_price": None, "category_id": categories[4]['id'], "stock": 8, "images": ["https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800"], "is_on_sale": False, "sale_start": None, "sale_end": None, "care_instructions": "Display away from direct sunlight.", "shipping_info": "Ships within 5-7 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Luxury Candle Bouquet", "description": "Premium curated bouquet of our finest scented candles.", "price": 3499, "sale_price": None, "category_id": categories[4]['id'], "stock": 5, "images": ["https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800"], "is_on_sale": False, "sale_start": None, "sale_end": None, "care_instructions": "Handle with care.", "shipping_info": "Ships within 5-7 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": str(uuid.uuid4()), "name": "Custom Wedding Candle Bouquet", "description": "Personalized candle bouquet for weddings and special occasions.", "price": 3999, "sale_price": 3499, "category_id": categories[4]['id'], "stock": 3, "images": ["https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800"], "is_on_sale": True, "sale_start": "2024-01-01", "sale_end": "2024-12-31", "care_instructions": "Contact us for customization options.", "shipping_info": "Ships within 7-10 business days.", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.products.insert_many(products)
    
    # Create sample orders
    orders = [
        {
            "id": str(uuid.uuid4()),
            "user_id": test_user_id,
            "items": [
                {"product_id": products[7]['id'], "product_name": "Vanilla Sandstone Candle", "product_image": products[7]['images'][0], "price": 1299, "quantity": 2}
            ],
            "billing_name": "Aisha Sharma",
            "billing_phone": "9876543210",
            "billing_email": "aisha@test.com",
            "billing_address": "123 Main Street",
            "billing_city": "Mumbai",
            "billing_postal_code": "400001",
            "payment_method": "upi",
            "total_price": 2598,
            "status": "shipped",
            "created_at": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": test_user_id,
            "items": [
                {"product_id": products[0]['id'], "product_name": "Sandstone Ripple Coaster Set", "product_image": products[0]['images'][0], "price": 899, "quantity": 1},
                {"product_id": products[8]['id'], "product_name": "Lavender Clay Candle", "product_image": products[8]['images'][0], "price": 1399, "quantity": 1}
            ],
            "billing_name": "Aisha Sharma",
            "billing_phone": "9876543210",
            "billing_email": "aisha@test.com",
            "billing_address": "123 Main Street",
            "billing_city": "Mumbai",
            "billing_postal_code": "400001",
            "payment_method": "card",
            "total_price": 2298,
            "status": "delivered",
            "created_at": (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": test_user_id,
            "items": [
                {"product_id": products[10]['id'], "product_name": "Rose Candle Bouquet", "product_image": products[10]['images'][0], "price": 2499, "quantity": 1}
            ],
            "billing_name": "Aisha Sharma",
            "billing_phone": "9876543210",
            "billing_email": "aisha@test.com",
            "billing_address": "123 Main Street",
            "billing_city": "Mumbai",
            "billing_postal_code": "400001",
            "payment_method": "netbanking",
            "total_price": 2499,
            "status": "pending",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.orders.insert_many(orders)
    
    return {"message": "Database seeded successfully", "admin_email": "admin@mariso.com", "admin_password": "admin123"}

@api_router.get("/")
async def root():
    return {"message": "Mariso Candles API"}

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
