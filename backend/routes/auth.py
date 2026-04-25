from fastapi import APIRouter, Depends, HTTPException
import uuid
from models.user import UserCreate
from core.database import db
import logging
from core.auth import get_current_user
from services.auth_service import create_token, hash_password, verify_password, generate_otp
from datetime import timedelta, datetime, timezone
from models.auth import UserLogin, OTPRequest, OTPVerify, ProfileUpdate

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["auth"])

# ==================== AUTH ROUTES ====================

@router.post("/auth/register", response_model=dict)
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

@router.post("/auth/login", response_model=dict)
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

@router.post("/auth/request-otp", response_model=dict)
async def request_otp(request: OTPRequest):
    otp = generate_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    await db.otps.update_one(
        {"email": request.email},
        {"$set": {"otp": otp, "expires": expires.isoformat()}},
        upsert=True
    )
    
    logger.info(f"OTP requested for {request.email}")
    return {"message": "OTP sent successfully"}

@router.post("/auth/verify-otp", response_model=dict)
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

@router.get("/auth/me", response_model=dict)
async def get_me(user: dict = Depends(get_current_user)):
    return {
        "id": user['id'],
        "name": user['name'],
        "email": user['email'],
        "role": user['role'],
        "addresses": user.get('addresses', []),
        "wishlist": user.get('wishlist', [])
    }

@router.put("/auth/profile", response_model=dict)
async def update_profile(data: ProfileUpdate, user: dict = Depends(get_current_user)):
    update_fields = {}
    if data.name is not None:
        update_fields['name'] = data.name
    
    if update_fields:
        await db.users.update_one({"id": user['id']}, {"$set": update_fields})
    
    updated_user = await db.users.find_one({"id": user['id']}, {"_id": 0, "password": 0})
    return updated_user