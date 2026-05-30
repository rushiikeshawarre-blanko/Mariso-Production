from fastapi import APIRouter, Depends, HTTPException, Request
import uuid
from models.user import UserCreate
from core.database import db
import logging
from core.auth import get_current_user
from services.auth_service import create_token, hash_password, verify_password, generate_otp
from datetime import timedelta, datetime, timezone
from models.auth import UserLogin, OTPRequest, OTPVerify, ProfileUpdate
from core.limiter import limiter
import core.config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["auth"])

# ==================== AUTH ROUTES ====================

@router.post("/auth/register", response_model=dict)
@limiter.limit("10/minute")
async def register(request: Request, user: UserCreate):
    if core.config.ENVIRONMENT == "production":
        raise HTTPException(status_code=404, detail="Not Found")
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
@limiter.limit("10/minute")
async def login(request: Request, credentials: UserLogin):
    if core.config.ENVIRONMENT == "production":
        raise HTTPException(status_code=404, detail="Not Found")
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
@limiter.limit("3/minute")
async def request_otp(request: Request, request_data: OTPRequest):
    if core.config.ENVIRONMENT == "production":
        raise HTTPException(status_code=404, detail="Not Found")
    otp = generate_otp()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    
    await db.otps.update_one(
        {"email": request_data.email},
        {"$set": {"otp": otp, "expires": expires.isoformat(), "attempts": 0}},
        upsert=True
    )
    
    logger.info(f"OTP requested for {request_data.email}")
    return {"message": "OTP sent successfully"}

@router.post("/auth/verify-otp", response_model=dict)
@limiter.limit("5/minute")
async def verify_otp(request: Request, request_data: OTPVerify):
    if core.config.ENVIRONMENT == "production":
        raise HTTPException(status_code=404, detail="Not Found")
    otp_doc = await db.otps.find_one({"email": request_data.email}, {"_id": 0})
    if not otp_doc:
        raise HTTPException(status_code=400, detail="OTP not found")
    
    if otp_doc.get('otp') != request_data.otp:
        # Increment failed attempts
        current_attempts = otp_doc.get('attempts', 0) + 1
        await db.otps.update_one(
            {"email": request_data.email},
            {"$set": {"attempts": current_attempts}}
        )
        if current_attempts >= 5:
            await db.otps.delete_one({"email": request_data.email})
            raise HTTPException(status_code=400, detail="Too many invalid attempts. Please request a new OTP.")
        raise HTTPException(status_code=400, detail="Invalid OTP")
    
    expires = datetime.fromisoformat(otp_doc['expires'])
    if datetime.now(timezone.utc) > expires:
        raise HTTPException(status_code=400, detail="OTP expired")
    
    user = await db.users.find_one({"email": request_data.email}, {"_id": 0})
    if not user:
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "name": request_data.email.split('@')[0],
            "email": request_data.email,
            "password": "",
            "role": "user",
            "addresses": [],
            "wishlist": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user)
    
    await db.otps.delete_one({"email": request_data.email})
    
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