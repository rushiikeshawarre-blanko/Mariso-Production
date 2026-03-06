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
