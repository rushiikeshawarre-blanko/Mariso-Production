import os
from pathlib import Path
from dotenv import load_dotenv
from jwt import PyJWKClient

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

def get_required_env(name: str) -> str:
    value = os.environ.get(name)
    if not value or not value.strip():
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value.strip()

FRONTEND_URL = os.environ.get("FRONTEND_URL", "").strip()

MONGO_URL = get_required_env("MONGO_URL")
DB_NAME = get_required_env("DB_NAME")

JWT_SECRET = get_required_env("JWT_SECRET")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24

AUTH0_DOMAIN = os.environ.get("AUTH0_DOMAIN", "").strip()
AUTH0_AUDIENCE = os.environ.get("AUTH0_AUDIENCE", "").strip()
AUTH0_ISSUER = f"https://{AUTH0_DOMAIN}/" if AUTH0_DOMAIN else ""


AUTH0_ADMIN_EMAILS = {
    email.strip().lower()
    for email in os.environ.get("AUTH0_ADMIN_EMAILS", "").split(",")
    if email.strip()
}

AUTH0_ADMIN_IDS = {
    auth0_id.strip()
    for auth0_id in os.environ.get("AUTH0_ADMIN_IDS", "").split(",")
    if auth0_id.strip()
}

AUTH0_JWKS_CLIENT = PyJWKClient(
    f"https://{AUTH0_DOMAIN}/.well-known/jwks.json"
) if AUTH0_DOMAIN else None


ENVIRONMENT = os.environ.get("ENVIRONMENT", "development").strip().lower()

CASHFREE_ENABLED = os.environ.get("CASHFREE_ENABLED", "false").strip().lower() == "true"
CASHFREE_ENV = os.environ.get("CASHFREE_ENV", "sandbox").strip().lower()
CASHFREE_BASE_URL = os.environ.get("CASHFREE_BASE_URL", "https://sandbox.cashfree.com/pg").strip().rstrip("/")
CASHFREE_API_VERSION = os.environ.get("CASHFREE_API_VERSION", "2025-01-01").strip()
CASHFREE_CLIENT_ID = os.environ.get("CASHFREE_CLIENT_ID", "").strip()
CASHFREE_CLIENT_SECRET = os.environ.get("CASHFREE_CLIENT_SECRET", "").strip()
CASHFREE_WEBHOOK_SECRET = os.environ.get("CASHFREE_WEBHOOK_SECRET", "").strip()
CASHFREE_RETURN_URL = os.environ.get("CASHFREE_RETURN_URL", "").strip()
CASHFREE_WEBHOOK_URL = os.environ.get("CASHFREE_WEBHOOK_URL", "").strip()

try:
    STOCK_RESERVATION_MINUTES = int(os.environ.get("STOCK_RESERVATION_MINUTES", "10").strip())
except ValueError:
    STOCK_RESERVATION_MINUTES = 10

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
RESEND_FROM_EMAIL = os.environ.get("RESEND_FROM_EMAIL", "").strip()

TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "").strip()
TWILIO_WHATSAPP_NUMBER = os.environ.get("TWILIO_WHATSAPP_NUMBER", "").strip()


AWS_REGION = os.environ.get("AWS_REGION", "").strip()
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "").strip()
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "").strip()
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "").strip()
CLOUDFRONT_BASE_URL = os.environ.get("CLOUDFRONT_BASE_URL", "").strip().rstrip("/")
