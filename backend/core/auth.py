from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
import jwt
from core.database import db
from core.config import JWT_ALGORITHM, AUTH0_DOMAIN, AUTH0_AUDIENCE, AUTH0_ISSUER, AUTH0_JWKS_CLIENT, JWT_SECRET, AUTH0_ADMIN_IDS, AUTH0_ADMIN_EMAILS
from datetime import datetime, timezone
import uuid
security = HTTPBearer()


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

def decode_auth0_token(token: str) -> dict:
    if not AUTH0_DOMAIN or not AUTH0_AUDIENCE or not AUTH0_JWKS_CLIENT:
        raise HTTPException(status_code=401, detail="Auth0 is not configured")

    try:
        signing_key = AUTH0_JWKS_CLIENT.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=AUTH0_AUDIENCE,
            issuer=AUTH0_ISSUER,
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid Auth0 token")
    
def get_role_from_auth0_payload(payload: dict) -> str:
    auth0_id = str(payload.get('sub', '')).strip()
    email = str(payload.get('email', '')).lower().strip()

    if auth0_id and auth0_id in AUTH0_ADMIN_IDS:
        return 'admin'

    if email and email in AUTH0_ADMIN_EMAILS:
        return 'admin'

    return 'user'


async def sync_auth0_user_from_payload(payload: dict) -> dict:
    auth0_id = str(payload.get('sub', '')).strip()
    if not auth0_id:
        raise HTTPException(status_code=401, detail="Invalid Auth0 token payload")

    email = str(payload.get('email', '')).strip().lower()
    name = (
        payload.get('name')
        or payload.get('nickname')
        or (email.split('@')[0] if email else 'User')
    )
    role = get_role_from_auth0_payload(payload)

    user = await db.users.find_one({"auth0_id": auth0_id}, {"_id": 0})
    if user:
        update_fields = {}
        if email and user.get('email') != email:
            update_fields['email'] = email
        if user.get('name') != name:
            update_fields['name'] = name
        if user.get('role') != role:
            update_fields['role'] = role

        if update_fields:
            await db.users.update_one(
                {"id": user['id']},
                {"$set": update_fields}
            )
            user = await db.users.find_one({"id": user['id']}, {"_id": 0})

        return user

    if email:
        existing_user = await db.users.find_one({"email": email}, {"_id": 0})
        if existing_user:
            await db.users.update_one(
                {"id": existing_user['id']},
                {"$set": {"auth0_id": auth0_id, "name": name, "role": role}}
            )
            updated_user = await db.users.find_one({"id": existing_user['id']}, {"_id": 0})
            return updated_user

    user_doc = {
        "id": str(uuid.uuid4()),
        "auth0_id": auth0_id,
        "name": name,
        "email": email,
        "password": "",
        "role": role,
        "addresses": [],
        "wishlist": [],
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.users.insert_one(user_doc)
    return user_doc




async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials

    try:
        header = jwt.get_unverified_header(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token header")

    alg = header.get('alg')

    # Legacy backend-issued JWT tokens
    if alg == JWT_ALGORITHM:
        payload = decode_token(token)
        user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user

    # Auth0-issued tokens
    if alg == 'RS256':
        payload = decode_auth0_token(token)
        return await sync_auth0_user_from_payload(payload)

    raise HTTPException(status_code=401, detail="Unsupported token algorithm")


async def get_admin_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = await get_current_user(credentials)
    if str(user.get("role", "")).lower() != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user