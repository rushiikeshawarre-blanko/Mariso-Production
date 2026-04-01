from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File
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
from email_service import send_order_status_email
from whatsapp_service import send_order_status_whatsapp

from bson import ObjectId

def serialize_mongo_value(order_doc):
    if isinstance(order_doc, ObjectId):
        return str(order_doc)
    if isinstance(order_doc, list):
        return [serialize_mongo_value(item) for item in order_doc]
    if isinstance(order_doc, dict):
        return {key: serialize_mongo_value(val) for key, val in order_doc.items()}
    return order_doc

def format_phone(phone: str) -> str:
    phone = phone.strip()
    phone = phone.replace(" ", "").replace("-", "")

    if phone.startswith("+"):
        return phone
    
    if phone.startswith("0"):
        return "+91" + phone[1:]
    
    return f"+91{phone}"

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT Configuration
JWT_SECRET = os.environ['JWT_SECRET']
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

class ProfileUpdate(BaseModel):
    name: Optional[str] = None

# ==================== VARIANT MODELS ====================

class ColorOption(BaseModel):
    id: str = ""
    name: str
    hex_code: str
    images: List[str] = []

class FlavorOption(BaseModel):
    id: str = ""
    name: str
    description: Optional[str] = ""
    images: List[str] = []

class ProductVariant(BaseModel):
    id: str = ""
    color_id: Optional[str] = None
    flavor_id: Optional[str] = None
    sku: Optional[str] = None
    price_override: Optional[float] = None
    stock: Optional[int] = None
    images: List[str] = []
    is_active: bool = True

class ProductCreate(BaseModel):
    name: str
    slug: Optional[str] = ""
    description: str
    short_description: Optional[str] = ""
    price: float = Field(..., gt=0)
    discount_price: Optional[float] = None
    category_id: str
    subcategory: Optional[str] = ""
    sku: Optional[str] = ""
    stock: int = Field(0, ge=0)
    images: List[str] = []
    # Variant options
    has_color_options: bool = False
    has_flavor_options: bool = False
    color_options: List[ColorOption] = []
    flavor_options: List[FlavorOption] = []
    variants: List[ProductVariant] = []
    # Status flags
    is_active: bool = True
    is_featured: bool = False
    is_bestseller: bool = False
    is_new_arrival: bool = False
    is_on_sale: bool = False
    sale_start: Optional[str] = None
    sale_end: Optional[str] = None
    # Additional details
    care_instructions: Optional[str] = ""
    shipping_info: Optional[str] = ""
    materials: Optional[str] = ""
    dimensions: Optional[str] = ""
    burn_time: Optional[str] = ""

class ProductUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    short_description: Optional[str] = None
    price: Optional[float] = Field(None, gt=0)
    discount_price: Optional[float] = Field(None, gt=0)
    category_id: Optional[str] = None
    subcategory: Optional[str] = None
    sku: Optional[str] = None
    stock: Optional[int] = Field(None, ge=0)
    images: Optional[List[str]] = None
    has_color_options: Optional[bool] = None
    has_flavor_options: Optional[bool] = None
    color_options: Optional[List[ColorOption]] = None
    flavor_options: Optional[List[FlavorOption]] = None
    variants: Optional[List[ProductVariant]] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    is_bestseller: Optional[bool] = None
    is_new_arrival: Optional[bool] = None
    is_on_sale: Optional[bool] = None
    sale_start: Optional[str] = None
    sale_end: Optional[str] = None
    care_instructions: Optional[str] = None
    shipping_info: Optional[str] = None
    materials: Optional[str] = None
    dimensions: Optional[str] = None
    burn_time: Optional[str] = None

class ProductResponse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    slug: str
    description: str
    short_description: str
    price: float
    discount_price: Optional[float]
    category_id: str
    category_name: Optional[str] = ""
    subcategory: str
    sku: str
    stock: int
    images: List[str]
    has_color_options: bool
    has_flavor_options: bool
    color_options: List[dict]
    flavor_options: List[dict]
    variants: List[dict]
    is_active: bool
    is_featured: bool
    is_bestseller: bool
    is_new_arrival: bool
    is_on_sale: bool
    sale_start: Optional[str]
    sale_end: Optional[str]
    care_instructions: str
    shipping_info: str
    materials: str
    dimensions: str
    burn_time: str
    created_at: str

class CartItem(BaseModel):
    product_id: str
    quantity: int = Field(..., gt=0)
    variant_id: Optional[str] = None
    color_id: Optional[str] = None
    flavor_id: Optional[str] = None

class OrderCreate(BaseModel):
    items: List[CartItem]
    billing_name: str
    billing_phone: str
    billing_email: EmailStr
    billing_address: str
    billing_city: str
    billing_postal_code: str
    payment_method: str
    gift_packaging: bool = False

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
    gift_packaging: bool = False
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

def generate_slug(name: str) -> str:
    return name.lower().replace(' ', '-').replace('&', 'and')

def ensure_product_defaults(product: dict) -> dict:
    """Ensure all product fields have default values"""
    defaults = {
        'slug': '',
        'short_description': '',
        'discount_price': None,
        'subcategory': '',
        'sku': '',
        'has_color_options': False,
        'has_flavor_options': False,
        'color_options': [],
        'flavor_options': [],
        'variants': [],
        'is_active': True,
        'is_featured': False,
        'is_bestseller': False,
        'is_new_arrival': False,
        'is_on_sale': False,
        'sale_start': None,
        'sale_end': None,
        'care_instructions': '',
        'shipping_info': '',
        'materials': '',
        'dimensions': '',
        'burn_time': '',
        'category_name': ''
    }
    for key, value in defaults.items():
        if key not in product:
            product[key] = value
    return product

def generate_variant_combinations(color_options: list, flavor_options: list, existing_variants: list = None) -> list:
    """Generate all possible variant combinations from colors and flavors"""
    existing_variants = existing_variants or []
    existing_combos = {(v.get('color_id'), v.get('flavor_id')) for v in existing_variants}
    
    new_variants = []
    
    # Case 1: Both colors and flavors exist
    if color_options and flavor_options:
        for color in color_options:
            for flavor in flavor_options:
                combo = (color.get('id'), flavor.get('id'))
                if combo not in existing_combos:
                    new_variants.append({
                        'id': str(uuid.uuid4()),
                        'color_id': color.get('id'),
                        'color_name': color.get('name'),
                        'flavor_id': flavor.get('id'),
                        'flavor_name': flavor.get('name'),
                        'sku': '',
                        'price_override': None,
                        'stock': 0,
                        'is_active': True
                    })
    # Case 2: Only colors exist
    elif color_options:
        for color in color_options:
            combo = (color.get('id'), None)
            if combo not in existing_combos:
                new_variants.append({
                    'id': str(uuid.uuid4()),
                    'color_id': color.get('id'),
                    'color_name': color.get('name'),
                    'flavor_id': None,
                    'flavor_name': None,
                    'sku': '',
                    'price_override': None,
                    'stock': 0,
                    'is_active': True
                })
    # Case 3: Only flavors exist
    elif flavor_options:
        for flavor in flavor_options:
            combo = (None, flavor.get('id'))
            if combo not in existing_combos:
                new_variants.append({
                    'id': str(uuid.uuid4()),
                    'color_id': None,
                    'color_name': None,
                    'flavor_id': flavor.get('id'),
                    'flavor_name': flavor.get('name'),
                    'sku': '',
                    'price_override': None,
                    'stock': 0,
                    'is_active': True
                })
    
    return existing_variants + new_variants

def get_variant(product: dict, variant_id: str = None, color_id: str = None, flavor_id: str = None) -> Optional[dict]:
    """Return matching variant based on id or color/flavor combination."""
    variants = product.get('variants', [])
    
    # If no variants exist, use base product stock
    if not variants:
        return None
    
    if variant_id:
        for variant in variants:
            if variant.get('id') == variant_id:
                return variant  
    
    # Find matching variant
    for variant in variants:
        if variant.get('color_id') == color_id and variant.get('flavor_id') == flavor_id:
            return variant
    
    # Fallback to base stock if no match
    return None

def get_selected_variant(product: dict, variant_id: str = None, color_id: str = None, flavor_id: str = None) -> Optional[dict]:
    variants = product.get("variants", [])

    if not variants:
        return None

    if variant_id:
        for variant in variants:
            if variant.get("id") == variant_id:
                return variant

    for variant in variants:
        if variant.get("color_id") == color_id and variant.get("flavor_id") == flavor_id:
            return variant

    return None

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
    
    logging.info(f"OTP requested for {request.email}")
    return {"message": "OTP sent successfully"}

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
async def update_profile(data: ProfileUpdate, user: dict = Depends(get_current_user)):
    update_fields = {}
    if data.name is not None:
        update_fields['name'] = data.name
    
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

@api_router.get("/products", response_model=List[dict])
async def get_products(
    category_id: Optional[str] = None, 
    search: Optional[str] = None, 
    on_sale: Optional[bool] = None,
    featured: Optional[bool] = None,
    bestseller: Optional[bool] = None,
    new_arrival: Optional[bool] = None,
    active_only: Optional[bool] = True
):
    query = {}
    if category_id:
        query["category_id"] = category_id
    if search:
        query["name"] = {"$regex": search, "$options": "i"}
    if on_sale:
        query["is_on_sale"] = True
    if featured:
        query["is_featured"] = True
    if bestseller:
        query["is_bestseller"] = True
    if new_arrival:
        query["is_new_arrival"] = True
    if active_only:
        query["is_active"] = True
    
    products = await db.products.find(query, {"_id": 0}).to_list(1000)
    
    # Add category names and ensure defaults
    for product in products:
        category = await db.categories.find_one({"id": product.get('category_id')}, {"_id": 0})
        product['category_name'] = category['name'] if category else ""
        ensure_product_defaults(product)
    
    return products

@api_router.get("/products/featured", response_model=List[dict])
async def get_featured_products():
    products = await db.products.find({"is_active": True, "is_featured": True}, {"_id": 0}).to_list(8)
    for product in products:
        category = await db.categories.find_one({"id": product.get('category_id')}, {"_id": 0})
        product['category_name'] = category['name'] if category else ""
        ensure_product_defaults(product)
    return products

@api_router.get("/products/bestsellers", response_model=List[dict])
async def get_bestsellers():
    pipeline = [
        {"$unwind": "$items"},
        {"$group": {"_id": "$items.product_id", "count": {"$sum": "$items.quantity"}}},
        {"$sort": {"count": -1}},
        {"$limit": 8}
    ]
    bestseller_ids = await db.orders.aggregate(pipeline).to_list(8)
    
    if not bestseller_ids:
        products = await db.products.find({"is_active": True}, {"_id": 0}).to_list(8)
    else:
        ids = [item['_id'] for item in bestseller_ids]
        products = await db.products.find({"id": {"$in": ids}, "is_active": True}, {"_id": 0}).to_list(8)
    
    for product in products:
        category = await db.categories.find_one({"id": product.get('category_id')}, {"_id": 0})
        product['category_name'] = category['name'] if category else ""
        ensure_product_defaults(product)
    
    return products

@api_router.get("/products/{product_id}", response_model=dict)
async def get_product(product_id: str):
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    category = await db.categories.find_one({"id": product.get('category_id')}, {"_id": 0})
    product['category_name'] = category['name'] if category else ""
    ensure_product_defaults(product)
    
    return product

@api_router.post("/admin/products", response_model=dict)
async def create_product(product: ProductCreate, admin: dict = Depends(get_admin_user)):
    product_id = str(uuid.uuid4())
    
    # Generate IDs for color options
    color_options = []
    for color in product.color_options:
        color_dict = color.model_dump()
        if not color_dict.get('id'):
            color_dict['id'] = str(uuid.uuid4())
        color_options.append(color_dict)
    
    # Generate IDs for flavor options
    flavor_options = []
    for flavor in product.flavor_options:
        flavor_dict = flavor.model_dump()
        if not flavor_dict.get('id'):
            flavor_dict['id'] = str(uuid.uuid4())
        flavor_options.append(flavor_dict)
    
    # Generate IDs for variants
    variants = []
    for variant in product.variants:
        variant_dict = variant.model_dump()
        if not variant_dict.get('id'):
            variant_dict['id'] = str(uuid.uuid4())
        variants.append(variant_dict)
    
    product_doc = {
        "id": product_id,
        "name": product.name,
        "slug": product.slug or generate_slug(product.name),
        "description": product.description,
        "short_description": product.short_description or "",
        "price": product.price,
        "discount_price": product.discount_price,
        "category_id": product.category_id,
        "subcategory": product.subcategory or "",
        "sku": product.sku or f"SKU-{product_id[:8].upper()}",
        "stock": product.stock,
        "images": product.images,
        "has_color_options": product.has_color_options,
        "has_flavor_options": product.has_flavor_options,
        "color_options": color_options,
        "flavor_options": flavor_options,
        "variants": variants,
        "is_active": product.is_active,
        "is_featured": product.is_featured,
        "is_bestseller": product.is_bestseller,
        "is_new_arrival": product.is_new_arrival,
        "is_on_sale": product.is_on_sale,
        "sale_start": product.sale_start,
        "sale_end": product.sale_end,
        "care_instructions": product.care_instructions or "",
        "shipping_info": product.shipping_info or "",
        "materials": product.materials or "",
        "dimensions": product.dimensions or "",
        "burn_time": product.burn_time or "",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.products.insert_one(product_doc)
    
    # Re-fetch to avoid _id issue
    created_product = await db.products.find_one({"id": product_id}, {"_id": 0})
    category = await db.categories.find_one({"id": product.category_id}, {"_id": 0})
    created_product['category_name'] = category['name'] if category else ""
    
    return created_product

@api_router.put("/admin/products/{product_id}", response_model=dict)
async def update_product(product_id: str, product: ProductUpdate, admin: dict = Depends(get_admin_user)):
    update_data = {}
    
    for key, value in product.model_dump().items():
        if value is not None:
            if key == 'color_options' and value:
                # Generate IDs for new color options
                colors = []
                for color in value:
                    if isinstance(color, dict):
                        if not color.get('id'):
                            color['id'] = str(uuid.uuid4())
                        colors.append(color)
                    else:
                        color_dict = color.model_dump() if hasattr(color, 'model_dump') else color
                        if not color_dict.get('id'):
                            color_dict['id'] = str(uuid.uuid4())
                        colors.append(color_dict)
                update_data['color_options'] = colors
            elif key == 'flavor_options' and value:
                # Generate IDs for new flavor options
                flavors = []
                for flavor in value:
                    if isinstance(flavor, dict):
                        if not flavor.get('id'):
                            flavor['id'] = str(uuid.uuid4())
                        flavors.append(flavor)
                    else:
                        flavor_dict = flavor.model_dump() if hasattr(flavor, 'model_dump') else flavor
                        if not flavor_dict.get('id'):
                            flavor_dict['id'] = str(uuid.uuid4())
                        flavors.append(flavor_dict)
                update_data['flavor_options'] = flavors
            elif key == 'variants' and value:
                # Generate IDs for new variants
                variants = []
                for variant in value:
                    if isinstance(variant, dict):
                        if not variant.get('id'):
                            variant['id'] = str(uuid.uuid4())
                        variants.append(variant)
                    else:
                        variant_dict = variant.model_dump() if hasattr(variant, 'model_dump') else variant
                        if not variant_dict.get('id'):
                            variant_dict['id'] = str(uuid.uuid4())
                        variants.append(variant_dict)
                update_data['variants'] = variants
            else:
                update_data[key] = value
    
    if update_data:
        await db.products.update_one({"id": product_id}, {"$set": update_data})
    
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not updated:
        raise HTTPException(status_code=404, detail="Product not found")
    
    category = await db.categories.find_one({"id": updated.get('category_id')}, {"_id": 0})
    updated['category_name'] = category['name'] if category else ""
    ensure_product_defaults(updated)
    
    return updated

@api_router.delete("/admin/products/{product_id}", response_model=dict)
async def delete_product(product_id: str, admin: dict = Depends(get_admin_user)):
    result = await db.products.delete_one({"id": product_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Product not found")
    return {"message": "Product deleted"}

@api_router.post("/admin/products/{product_id}/generate-variants", response_model=dict)
async def generate_product_variants(product_id: str, admin: dict = Depends(get_admin_user)):
    """Auto-generate variant combinations from colors and flavors"""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    color_options = product.get('color_options', [])
    flavor_options = product.get('flavor_options', [])
    existing_variants = product.get('variants', [])
    
    # Generate new combinations
    new_variants = generate_variant_combinations(color_options, flavor_options, existing_variants)
    
    # Update product with new variants
    await db.products.update_one(
        {"id": product_id},
        {"$set": {"variants": new_variants}}
    )
    
    updated = await db.products.find_one({"id": product_id}, {"_id": 0})
    category = await db.categories.find_one({"id": updated.get('category_id')}, {"_id": 0})
    updated['category_name'] = category['name'] if category else ""
    ensure_product_defaults(updated)
    
    return updated

@api_router.get("/products/{product_id}/stock", response_model=dict)
async def get_product_variant_stock(product_id: str, color_id: Optional[str] = None, flavor_id: Optional[str] = None):
    """Return stock, availability, and variant details for a given product selection."""
    product = await db.products.find_one({"id": product_id}, {"_id": 0})
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    variant = get_variant(product, color_id=color_id, flavor_id=flavor_id)

    if variant:
        stock = variant.get("stock", 0)
    else:
        stock = product.get("stock", 0)

    return {
        "product_id": product_id,
        "color_id": color_id,
        "flavor_id": flavor_id,
        "stock": stock,
        "is_available": stock > 0,
        "variant": variant
    }

# ==================== ORDER ROUTES ====================

GIFT_PACKAGING_PRICE = 149

@api_router.post("/orders", response_model=dict)
async def create_order(order: OrderCreate, user: dict = Depends(get_current_user)):
    order_id = str(uuid.uuid4())

    if not order.items:
        raise HTTPException(status_code=400, detail="Order must contain at least one item")

    valid_payment_methods = ["upi", "card", "cod", "netbanking"]
    if order.payment_method not in valid_payment_methods:
        raise HTTPException(status_code=400, detail="Invalid payment method")

    items_with_details = []
    product_map = {}

    for item in order.items:
        product = await db.products.find_one({"id": item.product_id}, {"_id": 0})

        if not product:
            raise HTTPException(status_code=404, detail=f"Product with ID {item.product_id} not found")
        product_map[item.product_id] = product
        
        variant_image = None
        variant_sku = None

        selected_variant = get_selected_variant(
            product,
            item.variant_id, 
            item.color_id, 
            item.flavor_id
        )

        #Base/Default price
        price = product['price']
        if product.get('is_on_sale') and product.get('discount_price'):
            price = product['discount_price']

        if selected_variant:
            variant_stock = selected_variant.get('stock', 0)
            if variant_stock < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for product {product['name']} variant"
                )
            
            if selected_variant.get('price_override') is not None:  
                price = selected_variant['price_override']

            variant_images = selected_variant.get('images', [])
            if variant_images:
                variant_image = variant_images[0]

            variant_sku = selected_variant.get('sku')
        else:
            available_stock = product.get('stock', 0)
            if available_stock < item.quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for product {product['name']}"
                    )
        
        items_with_details.append({
            "product_id": item.product_id,
            "variant_id": item.variant_id,
            "color_id": item.color_id,
            "flavor_id": item.flavor_id,
            "product_name": product['name'],
            "product_image": variant_image or (product['images'][0] if product.get('images') else ""),
            "original_price": product['price'],
            "price": price,
            "quantity": item.quantity,
            "line_total": price * item.quantity,
            "sku": variant_sku or product.get('sku', '')
        })

    calculated_total = sum(item['line_total'] for item in items_with_details)
    if not items_with_details:
        raise HTTPException(status_code=400, detail="No valid items in order")
    
    for item in items_with_details:
        product = product_map[item['product_id']]

        #Handle variant stock 
        if item.get('variant_id') or item.get('color_id') or item.get('flavor_id'):
            updated_variants = []

            for variant in product.get('variants', []):
                is_match = False

                if item.get('variant_id') and variant.get('id') == item['variant_id']:
                    is_match = True
                elif (
                    variant.get('color_id') == item.get('color_id')
                    and variant.get('flavor_id') == item.get('flavor_id')
                ):
                    is_match = True

                if is_match:
                    current_stock = variant.get('stock', 0)
                    variant['stock'] = max(current_stock - item['quantity'], 0)

                updated_variants.append(variant)
            await db.products.update_one(
                {"id": item['product_id']},
                {
                    "$set": {"variants": updated_variants},
                    "$inc": {"stock": -item['quantity']}
                }                       
            )
        else:
            await db.products.update_one(
            {"id": item['product_id']},
            {"$inc": {"stock": -item['quantity']}}
        )


    final_total = calculated_total + (GIFT_PACKAGING_PRICE if order.gift_packaging else 0)

    formatted_phone = format_phone(order.billing_phone)

    order_doc = {
        "id": order_id,
        "user_id": user['id'],
        "items": items_with_details,
        "billing_name": order.billing_name,
        "billing_phone": formatted_phone,
        "billing_email": order.billing_email,
        "billing_address": order.billing_address,
        "billing_city": order.billing_city,
        "billing_postal_code": order.billing_postal_code,
        "payment_method": order.payment_method,
        "gift_packaging": order.gift_packaging,
        "total_price": final_total,
        "status": "confirmed",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.orders.insert_one(order_doc)
    
    created_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    created_order['user_name'] = user['name']
    created_order['user_email'] = user['email']
    created_order["billing_phone"] = format_phone(created_order["billing_phone"])

    try:
        send_order_status_email(created_order)
    except Exception as e:
        print(f"Failed to send confirmed email: {e}")

    try:
        send_order_status_whatsapp(created_order)
    except Exception as e:
        print(f"Failed to send confirmed WhatsApp: {e}")
    
    return serialize_mongo_value(created_order)

@api_router.get("/orders", response_model=List[dict])
async def get_user_orders(user: dict = Depends(get_current_user)):
    orders = await db.orders.find({"user_id": user['id']}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return serialize_mongo_value(orders)

@api_router.get("/orders/{order_id}", response_model=dict)
async def get_order(order_id: str, user: dict = Depends(get_current_user)):
    order = await db.orders.find_one({"id": order_id, "user_id": user['id']}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return serialize_mongo_value(order)

@api_router.get("/admin/orders", response_model=List[dict])
async def get_all_orders(order_status: Optional[str] = None, admin: dict = Depends(get_admin_user)):
    query = {}
    if order_status:
        query["status"] = order_status
    
    orders = await db.orders.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    
    for order in orders:
        user = await db.users.find_one({"id": order['user_id']}, {"_id": 0})
        if user:
            order['user_name'] = user['name']
            order['user_email'] = user['email']
    
    return serialize_mongo_value(orders)

@api_router.put("/admin/orders/{order_id}/status", response_model=dict)
async def update_order_status(order_id: str, status_update: OrderStatusUpdate, admin: dict = Depends(get_admin_user)):
    valid_statuses = ["pending", "confirmed", "packed", "shipped", "delivered"]
    if status_update.status not in valid_statuses:
        raise HTTPException(status_code=400, detail="Invalid status")

    existing_order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not existing_order:
        raise HTTPException(status_code=404, detail="Order not found")

    old_status = existing_order.get("status")
    logger.info(f"STATUS CHANGE: {old_status} → {status_update.status}")
    allowed_transitions = {
        "pending": ["confirmed"],
        "confirmed": ["packed"],
        "packed": ["shipped"],
        "shipped": ["delivered"],
        "delivered": [],
    }

    if status_update.status != old_status and status_update.status not in allowed_transitions.get(old_status, []):
        raise HTTPException(status_code=400, detail="Invalid status transition")
    
    await db.orders.update_one({"id": order_id}, {"$set": {"status": status_update.status}})
    
    order = await db.orders.find_one({"id": order_id}, {"_id": 0})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    user = await db.users.find_one({"id": order['user_id']}, {"_id": 0})
    if user:
        order['user_name'] = user['name']
        order['user_email'] = user['email']

    order["billing_phone"] = format_phone(order["billing_phone"])

    if old_status != status_update.status:
        logger.info("DEBUG status changed, applying notification strategy")

        status = status_update.status

        # EMAIL → send only for shipped and delivered from admin status updates.
        # Confirmed is already sent at checkout.
        if status in ["shipped", "delivered"]:
            try:
                send_order_status_email(order)
            except Exception as e:
                print(f"Failed to send status email: {e}")

        # WHATSAPP → send for packed, shipped, and delivered.
        if status in ["packed", "shipped", "delivered"]:
            try:
                send_order_status_whatsapp(order)
            except Exception as e:
                print(f"Failed to send status WhatsApp: {e}")

    else:
        logger.info("DEBUG status did not change, skipping notifications")
    
    return serialize_mongo_value(order)

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

@api_router.get("/wishlist", response_model=List[dict])
async def get_wishlist(user: dict = Depends(get_current_user)):
    user_doc = await db.users.find_one({"id": user['id']}, {"_id": 0})
    wishlist_ids = user_doc.get('wishlist', [])
    
    products = await db.products.find({"id": {"$in": wishlist_ids}}, {"_id": 0}).to_list(100)
    
    for product in products:
        category = await db.categories.find_one({"id": product.get('category_id')}, {"_id": 0})
        product['category_name'] = category['name'] if category else ""
        ensure_product_defaults(product)
    
    return products

# ==================== ADMIN DASHBOARD ROUTES ====================

@api_router.get("/admin/dashboard", response_model=dict)
async def get_dashboard_stats(admin: dict = Depends(get_admin_user)):
    pipeline = [{"$group": {"_id": None, "total": {"$sum": "$total_price"}}}]
    revenue_result = await db.orders.aggregate(pipeline).to_list(1)
    total_revenue = revenue_result[0]['total'] if revenue_result else 0
    
    total_orders = await db.orders.count_documents({})
    total_products = await db.products.count_documents({})
    total_customers = await db.users.count_documents({"role": "user"})
    
    status_pipeline = [{"$group": {"_id": "$status", "count": {"$sum": 1}}}]
    status_result = await db.orders.aggregate(status_pipeline).to_list(10)
    orders_by_status = {item['_id']: item['count'] for item in status_result}
    
    recent_orders = await db.orders.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    for order in recent_orders:
        user = await db.users.find_one({"id": order['user_id']}, {"_id": 0})
        if user:
            order['user_name'] = user['name']
            order['user_email'] = user['email']
    
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
    
    for user in users:
        orders = await db.orders.find({"user_id": user['id']}, {"_id": 0}).to_list(1000)
        user['total_orders'] = len(orders)
        user['total_spending'] = sum(order['total_price'] for order in orders)
    
    return users

# ==================== IMAGE UPLOAD ROUTE ====================

@api_router.post("/upload", response_model=dict)
async def upload_image(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    contents = await file.read()
    allowed_types = ["image/jpeg", "image/png", "image/gif"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail="Unsupported file type")
    
    max_size = 5 * 1024 * 1024  # 5MB
    if len(contents) > max_size:
        raise HTTPException(status_code=400, detail="File size exceeds 5MB limit")
    
    encoded = base64.b64encode(contents).decode('utf-8')
    
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
    if os.environ.get("ENVIRONMENT", "development") != "development":
        raise HTTPException(status_code=403, detail="Seeding is only allowed in development environment")
    
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
    
    # Create products with variant support
    
    # Product 1: COLOR only variants with 5 images per color
    color1_id = str(uuid.uuid4())
    color2_id = str(uuid.uuid4())
    color3_id = str(uuid.uuid4())
    
    products = [
        {
            "id": str(uuid.uuid4()),
            "name": "Sandstone Ripple Coaster Set",
            "slug": "sandstone-ripple-coaster-set",
            "description": "Beautifully crafted jesmonite coasters with a unique ripple pattern. Set of 4 coasters.",
            "short_description": "Handcrafted jesmonite coasters with ripple pattern",
            "price": 899,
            "discount_price": None,
            "category_id": categories[0]['id'],
            "subcategory": "",
            "sku": "JC-001",
            "stock": 25,
            "images": [
                "https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800",
                "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
                "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
                "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800",
                "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800"
            ],
            "has_color_options": True,
            "has_flavor_options": False,
            "color_options": [
                {
                    "id": color1_id, 
                    "name": "Natural White", 
                    "hex_code": "#F5F0E8", 
                    "images": [
                        "https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800",
                        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
                        "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
                        "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800",
                        "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800"
                    ]
                },
                {
                    "id": color2_id, 
                    "name": "Sandstone", 
                    "hex_code": "#D7C5B8", 
                    "images": [
                        "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
                        "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800",
                        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
                        "https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800",
                        "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800"
                    ]
                },
                {
                    "id": color3_id, 
                    "name": "Charcoal", 
                    "hex_code": "#36454F", 
                    "images": [
                        "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800",
                        "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
                        "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
                        "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800",
                        "https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800"
                    ]
                }
            ],
            "flavor_options": [],
            "variants": [
                {"id": str(uuid.uuid4()), "color_id": color1_id, "color_name": "Natural White", "flavor_id": None, "flavor_name": None, "sku": "JC-001-WHT", "price_override": None, "stock": 12, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": color2_id, "color_name": "Sandstone", "flavor_id": None, "flavor_name": None, "sku": "JC-001-SND", "price_override": None, "stock": 8, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": color3_id, "color_name": "Charcoal", "flavor_id": None, "flavor_name": None, "sku": "JC-001-CHR", "price_override": None, "stock": 5, "is_active": True}
            ],
            "is_active": True,
            "is_featured": True,
            "is_bestseller": False,
            "is_new_arrival": True,
            "is_on_sale": False,
            "sale_start": None,
            "sale_end": None,
            "care_instructions": "Clean with a damp cloth. Avoid harsh chemicals.",
            "shipping_info": "Ships within 3-5 business days.",
            "materials": "Eco-friendly Jesmonite",
            "dimensions": "10cm x 10cm x 0.8cm",
            "burn_time": "",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        # Product with FLAVOR/FRAGRANCE variants
        {
            "id": str(uuid.uuid4()),
            "name": "Vanilla Sandstone Candle",
            "slug": "vanilla-sandstone-candle",
            "description": "Warm vanilla scent in a beautiful sandstone container. Burns for 45+ hours.",
            "short_description": "Hand-poured soy wax candle with warm vanilla scent",
            "price": 1299,
            "discount_price": None,
            "category_id": categories[3]['id'],
            "subcategory": "",
            "sku": "CC-001",
            "stock": 35,
            "images": [
                "https://images.pexels.com/photos/9518738/pexels-photo-9518738.jpeg?w=800",
                "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800",
                "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800",
                "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800",
                "https://images.unsplash.com/photo-1595515106886-43b1443a2e8b?w=800"
            ],
            "has_color_options": False,
            "has_flavor_options": True,
            "color_options": [],
            "flavor_options": [
                {"id": "flv-vanilla", "name": "Vanilla", "description": "Warm and comforting vanilla", "images": []},
                {"id": "flv-lavender", "name": "Lavender", "description": "Calming lavender fields", "images": []},
                {"id": "flv-rose", "name": "Rose", "description": "Fresh rose petals", "images": []},
                {"id": "flv-oud", "name": "Oud & Amber", "description": "Luxurious oud with warm amber", "images": []}
            ],
            "variants": [
                {"id": str(uuid.uuid4()), "color_id": None, "color_name": None, "flavor_id": "flv-vanilla", "flavor_name": "Vanilla", "sku": "CC-001-VAN", "price_override": None, "stock": 15, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": None, "color_name": None, "flavor_id": "flv-lavender", "flavor_name": "Lavender", "sku": "CC-001-LAV", "price_override": None, "stock": 10, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": None, "color_name": None, "flavor_id": "flv-rose", "flavor_name": "Rose", "sku": "CC-001-ROS", "price_override": None, "stock": 8, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": None, "color_name": None, "flavor_id": "flv-oud", "flavor_name": "Oud & Amber", "sku": "CC-001-OUD", "price_override": 1499, "stock": 2, "is_active": True}
            ],
            "is_active": True,
            "is_featured": True,
            "is_bestseller": True,
            "is_new_arrival": False,
            "is_on_sale": False,
            "sale_start": None,
            "sale_end": None,
            "care_instructions": "Trim wick to 1/4 inch before each burn. Keep away from drafts.",
            "shipping_info": "Ships within 3-5 business days.",
            "materials": "100% Natural Soy Wax, Cotton Wick",
            "dimensions": "8cm x 10cm",
            "burn_time": "45+ hours",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        # Product with BOTH color and flavor variants (full matrix)
        {
            "id": str(uuid.uuid4()),
            "name": "Rose Candle Bouquet",
            "slug": "rose-candle-bouquet",
            "description": "Elegant arrangement of rose-scented candles, perfect for gifting.",
            "short_description": "Beautiful candle bouquet with rose fragrance",
            "price": 2499,
            "discount_price": 2199,
            "category_id": categories[4]['id'],
            "subcategory": "",
            "sku": "CB-001",
            "stock": 8,
            "images": [
                "https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800",
                "https://images.unsplash.com/photo-1612540139150-4d599ae85ca9?w=800",
                "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800",
                "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800",
                "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800"
            ],
            "has_color_options": True,
            "has_flavor_options": True,
            "color_options": [
                {
                    "id": "cb-white", 
                    "name": "White", 
                    "hex_code": "#FFFFFF", 
                    "images": [
                        "https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800",
                        "https://images.unsplash.com/photo-1612540139150-4d599ae85ca9?w=800",
                        "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800",
                        "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800",
                        "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800"
                    ]
                },
                {
                    "id": "cb-pink", 
                    "name": "Blush Pink", 
                    "hex_code": "#FFB6C1", 
                    "images": [
                        "https://images.unsplash.com/photo-1612540139150-4d599ae85ca9?w=800",
                        "https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800",
                        "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800",
                        "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800",
                        "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800"
                    ]
                },
                {
                    "id": "cb-lav", 
                    "name": "Lavender", 
                    "hex_code": "#E6E6FA", 
                    "images": [
                        "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800",
                        "https://images.unsplash.com/photo-1612540139150-4d599ae85ca9?w=800",
                        "https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800",
                        "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800",
                        "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800"
                    ]
                }
            ],
            "flavor_options": [
                {"id": "cb-rose", "name": "Rose", "description": "Classic rose fragrance", "images": []},
                {"id": "cb-jasmine", "name": "Jasmine", "description": "Sweet jasmine blooms", "images": []},
                {"id": "cb-peony", "name": "Peony", "description": "Delicate peony petals", "images": []}
            ],
            "variants": [
                # White + Rose, Jasmine, Peony
                {"id": str(uuid.uuid4()), "color_id": "cb-white", "color_name": "White", "flavor_id": "cb-rose", "flavor_name": "Rose", "sku": "CB-WHT-ROS", "price_override": None, "stock": 10, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "cb-white", "color_name": "White", "flavor_id": "cb-jasmine", "flavor_name": "Jasmine", "sku": "CB-WHT-JAS", "price_override": None, "stock": 8, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "cb-white", "color_name": "White", "flavor_id": "cb-peony", "flavor_name": "Peony", "sku": "CB-WHT-PEO", "price_override": None, "stock": 5, "is_active": True},
                # Pink + Rose, Jasmine, Peony
                {"id": str(uuid.uuid4()), "color_id": "cb-pink", "color_name": "Blush Pink", "flavor_id": "cb-rose", "flavor_name": "Rose", "sku": "CB-PNK-ROS", "price_override": None, "stock": 12, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "cb-pink", "color_name": "Blush Pink", "flavor_id": "cb-jasmine", "flavor_name": "Jasmine", "sku": "CB-PNK-JAS", "price_override": None, "stock": 6, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "cb-pink", "color_name": "Blush Pink", "flavor_id": "cb-peony", "flavor_name": "Peony", "sku": "CB-PNK-PEO", "price_override": None, "stock": 0, "is_active": True},
                # Lavender + Rose, Jasmine, Peony
                {"id": str(uuid.uuid4()), "color_id": "cb-lav", "color_name": "Lavender", "flavor_id": "cb-rose", "flavor_name": "Rose", "sku": "CB-LAV-ROS", "price_override": None, "stock": 4, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "cb-lav", "color_name": "Lavender", "flavor_id": "cb-jasmine", "flavor_name": "Jasmine", "sku": "CB-LAV-JAS", "price_override": None, "stock": 0, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "cb-lav", "color_name": "Lavender", "flavor_id": "cb-peony", "flavor_name": "Peony", "sku": "CB-LAV-PEO", "price_override": None, "stock": 3, "is_active": True}
            ],
            "is_active": True,
            "is_featured": True,
            "is_bestseller": False,
            "is_new_arrival": True,
            "is_on_sale": True,
            "sale_start": "2024-01-01",
            "sale_end": "2024-12-31",
            "care_instructions": "Display away from direct sunlight.",
            "shipping_info": "Ships within 5-7 business days.",
            "materials": "Soy Wax, Natural Dyes",
            "dimensions": "25cm x 20cm",
            "burn_time": "30+ hours total",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        # Product with NO variants
        {
            "id": str(uuid.uuid4()),
            "name": "Matte Jesmonite Trinket Container",
            "slug": "matte-jesmonite-trinket-container",
            "description": "A versatile matte-finish container perfect for jewelry or small items.",
            "short_description": "Elegant storage container for small treasures",
            "price": 1299,
            "discount_price": None,
            "category_id": categories[2]['id'],
            "subcategory": "",
            "sku": "RC-001",
            "stock": 12,
            "images": [
                "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800",
                "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
                "https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800",
                "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
                "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800"
            ],
            "has_color_options": False,
            "has_flavor_options": False,
            "color_options": [],
            "flavor_options": [],
            "variants": [],
            "is_active": True,
            "is_featured": False,
            "is_bestseller": True,
            "is_new_arrival": False,
            "is_on_sale": False,
            "sale_start": None,
            "sale_end": None,
            "care_instructions": "Dust with soft cloth.",
            "shipping_info": "Ships within 5-7 business days.",
            "materials": "Eco-friendly Jesmonite",
            "dimensions": "12cm x 8cm",
            "burn_time": "",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        # Additional products
        {
            "id": str(uuid.uuid4()),
            "name": "Terrazzo Jesmonite Coasters",
            "slug": "terrazzo-jesmonite-coasters",
            "description": "Modern terrazzo-style coasters with colorful chips embedded in jesmonite.",
            "short_description": "Colorful terrazzo-style coasters",
            "price": 1099,
            "discount_price": 899,
            "category_id": categories[0]['id'],
            "subcategory": "",
            "sku": "JC-002",
            "stock": 18,
            "images": [
                "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800",
                "https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800",
                "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800"
            ],
            "has_color_options": True,
            "has_flavor_options": False,
            "color_options": [
                {"id": str(uuid.uuid4()), "name": "Pastel Mix", "hex_code": "#FFE4E1", "images": []},
                {"id": str(uuid.uuid4()), "name": "Earth Tones", "hex_code": "#D2B48C", "images": []}
            ],
            "flavor_options": [],
            "variants": [],
            "is_active": True,
            "is_featured": False,
            "is_bestseller": False,
            "is_new_arrival": False,
            "is_on_sale": True,
            "sale_start": "2024-01-01",
            "sale_end": "2024-12-31",
            "care_instructions": "Wipe clean with soft cloth.",
            "shipping_info": "Ships within 3-5 business days.",
            "materials": "Jesmonite, Natural Pigments",
            "dimensions": "10cm x 10cm x 0.8cm",
            "burn_time": "",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Lavender Clay Candle",
            "slug": "lavender-clay-candle",
            "description": "Calming lavender fragrance in a terracotta clay container.",
            "short_description": "Relaxing lavender scent in clay container",
            "price": 1399,
            "discount_price": None,
            "category_id": categories[3]['id'],
            "subcategory": "",
            "sku": "CC-002",
            "stock": 28,
            "images": [
                "https://images.unsplash.com/photo-1592990332407-1ab9b8439a4c?w=800",
                "https://images.unsplash.com/photo-1603006905003-be475563bc59?w=800",
                "https://images.pexels.com/photos/9518738/pexels-photo-9518738.jpeg?w=800"
            ],
            "has_color_options": False,
            "has_flavor_options": False,
            "color_options": [],
            "flavor_options": [],
            "variants": [],
            "is_active": True,
            "is_featured": False,
            "is_bestseller": True,
            "is_new_arrival": False,
            "is_on_sale": False,
            "sale_start": None,
            "sale_end": None,
            "care_instructions": "Allow wax to melt to edges on first burn.",
            "shipping_info": "Ships within 3-5 business days.",
            "materials": "Soy Wax, Terracotta Container",
            "dimensions": "8cm x 9cm",
            "burn_time": "40+ hours",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Luxury Candle Bouquet",
            "slug": "luxury-candle-bouquet",
            "description": "Premium curated bouquet of our finest scented candles.",
            "short_description": "Premium gift bouquet",
            "price": 3499,
            "discount_price": None,
            "category_id": categories[4]['id'],
            "subcategory": "",
            "sku": "CB-002",
            "stock": 5,
            "images": [
                "https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800",
                "https://images.unsplash.com/photo-1612540139150-4d599ae85ca9?w=800"
            ],
            "has_color_options": True,
            "has_flavor_options": True,
            "color_options": [
                {"id": str(uuid.uuid4()), "name": "Ivory", "hex_code": "#FFFFF0", "images": []},
                {"id": str(uuid.uuid4()), "name": "Gold", "hex_code": "#FFD700", "images": []}
            ],
            "flavor_options": [
                {"id": str(uuid.uuid4()), "name": "Signature Blend", "description": "Our signature mix", "images": []},
                {"id": str(uuid.uuid4()), "name": "Fresh Florals", "description": "Mixed floral scents", "images": []}
            ],
            "variants": [],
            "is_active": True,
            "is_featured": True,
            "is_bestseller": False,
            "is_new_arrival": True,
            "is_on_sale": False,
            "sale_start": None,
            "sale_end": None,
            "care_instructions": "Handle with care.",
            "shipping_info": "Ships within 5-7 business days.",
            "materials": "Premium Soy Wax",
            "dimensions": "30cm x 25cm",
            "burn_time": "50+ hours total",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": str(uuid.uuid4()),
            "name": "Glazed Marble Ceramic Coasters",
            "slug": "glazed-marble-ceramic-coasters",
            "description": "Elegant ceramic coasters with a beautiful marble glaze finish.",
            "short_description": "Marble-effect ceramic coasters",
            "price": 999,
            "discount_price": None,
            "category_id": categories[1]['id'],
            "subcategory": "",
            "sku": "CRC-001",
            "stock": 20,
            "images": [
                "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
                "https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800"
            ],
            "has_color_options": True,
            "has_flavor_options": False,
            "color_options": [
                {"id": str(uuid.uuid4()), "name": "White Marble", "hex_code": "#F5F5F5", "images": []},
                {"id": str(uuid.uuid4()), "name": "Grey Marble", "hex_code": "#808080", "images": []},
                {"id": str(uuid.uuid4()), "name": "Black Marble", "hex_code": "#1C1C1C", "images": []}
            ],
            "flavor_options": [],
            "variants": [],
            "is_active": True,
            "is_featured": False,
            "is_bestseller": False,
            "is_new_arrival": False,
            "is_on_sale": False,
            "sale_start": None,
            "sale_end": None,
            "care_instructions": "Dishwasher safe.",
            "shipping_info": "Ships within 3-5 business days.",
            "materials": "High-fire Ceramic",
            "dimensions": "10cm diameter",
            "burn_time": "",
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.products.insert_many(products)
    
    # Create sample orders
    orders = [
        {
            "id": str(uuid.uuid4()),
            "user_id": test_user_id,
            "items": [
                {"product_id": products[1]['id'], "product_name": "Vanilla Sandstone Candle", "product_image": products[1]['images'][0], "price": 1299, "quantity": 2}
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
                {"product_id": products[5]['id'], "product_name": "Lavender Clay Candle", "product_image": products[5]['images'][0], "price": 1399, "quantity": 1}
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
        }
    ]
    await db.orders.insert_many(orders)
    
    return {"message": "Database seeded successfully", "admin_email": "admin@mariso.com", "admin_password": "admin123"}

@api_router.get("/")
async def root():
    return {"message": "Mariso Candles API"}

@app.get("/health")
async def health():
    return {"status": "ok"}

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', 'http://localhost:3000').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
