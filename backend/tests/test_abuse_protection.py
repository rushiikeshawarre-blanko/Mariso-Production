import pytest
from httpx import ASGITransport, AsyncClient
from server import app
from datetime import datetime, timezone, timedelta

# Mock database collections to prevent closed event loop issues with Motor in tests
class MockCollection:
    def __init__(self, data=None):
        self.data = data or {}
        self.deleted_emails = []
        self.updated_fields = {}

    async def find_one(self, filter, projection=None):
        email = filter.get("email")
        if email in self.data:
            return self.data[email]
        # Allow checking user ID or other filters
        user_id = filter.get("id")
        for u in self.data.values():
            if u.get("id") == user_id or u.get("email") == filter.get("email"):
                return u
        return None

    async def update_one(self, filter, update, upsert=False):
        email = filter.get("email")
        set_fields = update.get("$set", {})
        self.updated_fields[email] = set_fields
        if email not in self.data:
            self.data[email] = {"email": email, "attempts": 0}
        self.data[email].update(set_fields)
        
        # Simulating db increment specifically
        if "$inc" in update:
            inc_fields = update["$inc"]
            for k, v in inc_fields.items():
                self.data[email][k] = self.data[email].get(k, 0) + v
        return type("MockResult", (), {"modified_count": 1})()

    async def delete_one(self, filter):
        email = filter.get("email")
        self.deleted_emails.append(email)
        self.data.pop(email, None)
        return type("MockResult", (), {"deleted_count": 1})()

    async def insert_one(self, doc):
        email = doc.get("email")
        self.data[email] = doc
        return object()


@pytest.mark.anyio
async def test_rate_limiting_sensitive_endpoint():
    """
    Test that making excessive requests to /api/auth/login
    triggers slowapi's rate limiter, returning HTTP 429.
    """
    from core.limiter import limiter
    
    # Temporarily enable rate limiter for this test
    limiter.enabled = True
    
    try:
        # Mock auth verification so it doesn't fail on database check
        async def fake_verify_password(p, h):
            return False
        
        import routes.auth
        routes.auth.verify_password = fake_verify_password
        
        mock_users = MockCollection()
        import core.database
        core.database.db.users = mock_users
        
        # Test rate limiting threshold using HTTPX AsyncClient with ASGITransport
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            for i in range(10):
                resp = await ac.post("/api/auth/login", json={
                    "email": "rate_limit_test@example.com",
                    "password": "wrongpassword"
                })
                # Should fail with 401 Unauthorized (since credentials don't exist) but not 429
                assert resp.status_code == 401
                
            # The 11th request must exceed the rate limit threshold
            resp = await ac.post("/api/auth/login", json={
                "email": "rate_limit_test@example.com",
                "password": "wrongpassword"
            })
            assert resp.status_code == 429
            assert "Too Many Requests" in resp.json().get("detail", "Too Many Requests")
        
    finally:
        # Restore rate limiter to passive/disabled state for other tests
        limiter.enabled = False


@pytest.mark.anyio
async def test_otp_failed_attempts_increment_and_cap(monkeypatch):
    """
    Test that failed OTP attempts increment a counter in the database.
    Verify that on the 5th failed attempt, the OTP is deleted/invalidated
    and returns a safe user-facing error message.
    """
    email = "otp_abuse_test@example.com"
    otp_code = "112233"
    
    mock_otps = MockCollection()
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    await mock_otps.insert_one({
        "email": email,
        "otp": otp_code,
        "expires": expires.isoformat(),
        "attempts": 0
    })
    
    # Inject our mock database
    import core.database
    monkeypatch.setattr(core.database.db, "otps", mock_otps)
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        for i in range(1, 5):
            resp = await ac.post("/api/auth/verify-otp", json={
                "email": email,
                "otp": "wrong_otp"
            })
            assert resp.status_code == 400
            assert resp.json().get("detail") == "Invalid OTP"
            
            # Verify attempt counter incremented
            otp_doc = await mock_otps.find_one({"email": email})
            assert otp_doc is not None
            assert otp_doc["attempts"] == i

        # 5th invalid attempt should block/delete the OTP
        resp = await ac.post("/api/auth/verify-otp", json={
            "email": email,
            "otp": "wrong_otp"
        })
        assert resp.status_code == 400
        assert "Too many invalid attempts" in resp.json().get("detail", "")
    
    # Verify completely deleted from database
    otp_doc = await mock_otps.find_one({"email": email})
    assert otp_doc is None


@pytest.mark.anyio
async def test_successful_otp_verification(monkeypatch):
    """
    Test that a valid OTP verification succeeds, logs in/creates the user,
    and cleanly deletes the OTP record.
    """
    email = "otp_success_test@example.com"
    otp_code = "998877"
    
    mock_otps = MockCollection()
    mock_users = MockCollection()
    
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    await mock_otps.insert_one({
        "email": email,
        "otp": otp_code,
        "expires": expires.isoformat(),
        "attempts": 0
    })
    
    # Inject our mock collections
    import core.database
    monkeypatch.setattr(core.database.db, "otps", mock_otps)
    monkeypatch.setattr(core.database.db, "users", mock_users)
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/auth/verify-otp", json={
            "email": email,
            "otp": otp_code
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data
        assert data["user"]["email"] == email
    
    # Verify OTP deleted
    otp_doc = await mock_otps.find_one({"email": email})
    assert otp_doc is None


@pytest.mark.anyio
async def test_invalid_cashfree_webhook_signature():
    """
    Test that Cashfree webhooks fail with 401 Unauthorized
    when provided with an invalid signature.
    """
    headers = {
        "x-webhook-signature": "bad_sig_here",
        "x-webhook-timestamp": "1780171200",
        "Content-Type": "application/json"
    }
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/payments/cashfree/webhook", json={
            "type": "PAYMENT_SUCCESS_WEBHOOK",
            "data": {
                "order": {"order_id": "order-123"},
                "payment": {"cf_payment_id": "pay-123", "payment_status": "SUCCESS"}
            }
        }, headers=headers)
        
        assert resp.status_code == 401
        assert "Invalid Cashfree" in resp.json().get("detail", "")


@pytest.mark.anyio
async def test_secure_response_headers_are_present():
    """
    Test that our custom middleware injects the recommended
    security headers in every HTTP response.
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/health")
        assert resp.status_code == 200
        
        assert resp.headers.get("X-Frame-Options") == "DENY"
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"
        assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
        assert "geolocation=()" in resp.headers.get("Permissions-Policy", "")
