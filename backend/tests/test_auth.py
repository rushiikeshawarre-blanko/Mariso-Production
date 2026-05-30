import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


def test_admin_login():
    """Test admin login with valid credentials"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@mariso.com",
        "password": "admin123"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data.get("user", {}).get("role") == "admin"


def test_user_login():
    """Test user login with valid credentials"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "aisha@test.com",
        "password": "test123"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data.get("user", {}).get("email") == "aisha@test.com"


def test_login_invalid_credentials():
    """Test login with invalid credentials returns 401"""
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "wrong@example.com",
        "password": "wrongpass"
    })
    assert resp.status_code in [400, 401, 404]


def test_register_new_user():
    """Test user registration"""
    unique_email = f"test_{uuid.uuid4().hex[:8]}@example.com"
    resp = requests.post(f"{BASE_URL}/api/auth/register", json={
        "name": "Test User",
        "email": unique_email,
        "password": "password123"
    })
    assert resp.status_code in [200, 201]
    data = resp.json()
    assert "token" in data


def test_request_otp(api_client):
    """Test OTP request"""
    resp = requests.post(f"{BASE_URL}/api/auth/request-otp", json={
        "email": "aisha@test.com"
    })
    assert resp.status_code == 200
    data = resp.json()
    # Should return OTP for demo purposes
    assert "otp" in data or "message" in data


def test_get_me_authenticated(api_client=None):
    """Test /me endpoint with valid token"""
    # First login
    login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "aisha@test.com",
        "password": "test123"
    })
    token = login_resp.json().get("token")
    
    resp = requests.get(f"{BASE_URL}/api/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data.get("email") == "aisha@test.com"


def test_get_me_unauthenticated():
    """Test /me endpoint without token returns 401 or 403"""
    resp = requests.get(f"{BASE_URL}/api/auth/me")
    assert resp.status_code in [401, 403]


@pytest.mark.anyio
async def test_production_environment_legacy_endpoints_disabled(monkeypatch):
    """
    Test that when ENVIRONMENT == 'production', legacy auth endpoints
    (/register, /login, /request-otp, /verify-otp) all return 404 Not Found.
    """
    import core.config
    monkeypatch.setattr(core.config, "ENVIRONMENT", "production")

    from httpx import ASGITransport, AsyncClient
    from server import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Register
        resp = await ac.post("/api/auth/register", json={
            "name": "Test User",
            "email": "prod_test@example.com",
            "password": "password123"
        })
        assert resp.status_code == 404

        # 2. Login
        resp = await ac.post("/api/auth/login", json={
            "email": "prod_test@example.com",
            "password": "password123"
        })
        assert resp.status_code == 404

        # 3. Request OTP
        resp = await ac.post("/api/auth/request-otp", json={
            "email": "prod_test@example.com"
        })
        assert resp.status_code == 404

        # 4. Verify OTP
        resp = await ac.post("/api/auth/verify-otp", json={
            "email": "prod_test@example.com",
            "otp": "123456"
        })
        assert resp.status_code == 404


@pytest.mark.anyio
async def test_production_environment_non_legacy_endpoints_active(monkeypatch):
    """
    Test that /api/auth/me and /api/auth/profile are NOT disabled
    even when ENVIRONMENT == 'production'.
    """
    import core.config
    monkeypatch.setattr(core.config, "ENVIRONMENT", "production")

    from httpx import ASGITransport, AsyncClient
    from server import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # /me should return 401 Unauthorized (because we don't supply a token), NOT 404.
        resp = await ac.get("/api/auth/me")
        assert resp.status_code in [401, 403]
        assert resp.status_code != 404

        # /profile should return 401 Unauthorized, NOT 404.
        resp = await ac.put("/api/auth/profile", json={"name": "New Name"})
        assert resp.status_code in [401, 403]
        assert resp.status_code != 404


@pytest.mark.anyio
async def test_non_production_environment_endpoints_remain_active(monkeypatch):
    """
    Test that when ENVIRONMENT == 'development' or 'testing',
    legacy endpoints return normal active status codes (e.g. 400 for bad parameters, not 404).
    """
    import core.config
    monkeypatch.setattr(core.config, "ENVIRONMENT", "development")

    from httpx import ASGITransport, AsyncClient
    from server import app

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Registering with invalid payload should return 422/400 (validation/bad request), NOT 404.
        resp = await ac.post("/api/auth/register", json={})
        assert resp.status_code != 404

        # Login with wrong credentials should return 401, NOT 404.
        resp = await ac.post("/api/auth/login", json={
            "email": "wrong@example.com",
            "password": "wrongpassword"
        })
        assert resp.status_code in [400, 401]
        assert resp.status_code != 404
