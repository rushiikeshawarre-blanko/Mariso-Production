import pytest
import requests
import os
import uuid

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


def test_get_all_products():
    """Test fetching all products returns 13 seeded products"""
    resp = requests.get(f"{BASE_URL}/api/products")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 13


def test_get_featured_products():
    """Test featured products endpoint"""
    resp = requests.get(f"{BASE_URL}/api/products/featured")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) > 0


def test_get_bestsellers():
    """Test bestsellers endpoint"""
    resp = requests.get(f"{BASE_URL}/api/products/bestsellers")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_get_single_product():
    """Test fetching a single product"""
    products = requests.get(f"{BASE_URL}/api/products").json()
    product_id = products[0]["id"]
    
    resp = requests.get(f"{BASE_URL}/api/products/{product_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert "id" in data
    assert "name" in data
    assert "price" in data


def test_get_products_by_category():
    """Test product filtering by category"""
    categories = requests.get(f"{BASE_URL}/api/categories").json()
    category_id = categories[0]["id"]
    
    resp = requests.get(f"{BASE_URL}/api/products", params={"category": category_id})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_get_all_categories():
    """Test fetching all categories returns 5 seeded categories"""
    resp = requests.get(f"{BASE_URL}/api/categories")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 5


def test_admin_create_product(admin_client):
    """Test admin can create a product"""
    categories = requests.get(f"{BASE_URL}/api/categories").json()
    cat_id = categories[0]["id"]
    
    product_data = {
        "name": f"TEST_Product_{uuid.uuid4().hex[:8]}",
        "description": "Test product description",
        "price": 999,
        "category_id": cat_id,
        "stock": 50,
        "images": ["https://example.com/image.jpg"],
        "is_featured": False,
        "is_bestseller": False,
        "is_on_sale": False
    }
    resp = admin_client.post(f"{BASE_URL}/api/admin/products", json=product_data)
    assert resp.status_code in [200, 201]
    data = resp.json()
    assert "id" in data
    
    # Cleanup
    admin_client.delete(f"{BASE_URL}/api/admin/products/{data['id']}")


def test_admin_create_category(admin_client):
    """Test admin can create a category"""
    cat_data = {
        "name": f"TEST_Category_{uuid.uuid4().hex[:8]}",
        "description": "Test category",
        "image": "https://example.com/cat.jpg"
    }
    resp = admin_client.post(f"{BASE_URL}/api/admin/categories", json=cat_data)
    assert resp.status_code in [200, 201]
    data = resp.json()
    assert "id" in data
    
    # Cleanup
    admin_client.delete(f"{BASE_URL}/api/admin/categories/{data['id']}")


def test_admin_dashboard_stats(admin_client):
    """Test admin dashboard stats endpoint"""
    resp = admin_client.get(f"{BASE_URL}/api/admin/dashboard")
    assert resp.status_code == 200
    data = resp.json()
    assert "total_revenue" in data
    assert "total_orders" in data
    assert "total_products" in data
    assert "total_customers" in data


def test_admin_get_orders(admin_client):
    """Test admin can get all orders"""
    resp = admin_client.get(f"{BASE_URL}/api/admin/orders")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_admin_get_customers(admin_client):
    """Test admin can get all customers"""
    resp = admin_client.get(f"{BASE_URL}/api/admin/customers")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


def test_create_order_authenticated():
    """Test authenticated user can create an order"""
    # Login as user
    login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "aisha@test.com",
        "password": "test123"
    })
    token = login_resp.json().get("token")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # Get a product
    products = requests.get(f"{BASE_URL}/api/products").json()
    product = products[0]
    
    order_data = {
        "items": [{"product_id": product["id"], "quantity": 1, "price": product["price"]}],
        "billing_name": "Test User",
        "billing_phone": "9876543210",
        "billing_email": "aisha@test.com",
        "billing_address": "123 Test Street",
        "billing_city": "Mumbai",
        "billing_postal_code": "400001",
        "payment_method": "cod",
        "total_price": product["price"]
    }
    resp = requests.post(f"{BASE_URL}/api/orders", json=order_data, headers=headers)
    assert resp.status_code in [200, 201]
    data = resp.json()
    assert "id" in data


def test_wishlist_add_remove():
    """Test wishlist add and remove"""
    login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
        "email": "aisha@test.com",
        "password": "test123"
    })
    token = login_resp.json().get("token")
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    products = requests.get(f"{BASE_URL}/api/products").json()
    product_id = products[0]["id"]
    
    # Add to wishlist
    add_resp = requests.post(f"{BASE_URL}/api/wishlist", json={"product_id": product_id}, headers=headers)
    assert add_resp.status_code in [200, 201]
    
    # Remove from wishlist
    del_resp = requests.delete(f"{BASE_URL}/api/wishlist/{product_id}", headers=headers)
    assert del_resp.status_code in [200, 204]
