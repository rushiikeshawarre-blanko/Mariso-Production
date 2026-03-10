"""
Tests for Product Variants API
Tests the color_options and flavor_options functionality
"""
import pytest
import requests
import os
from pathlib import Path
from dotenv import load_dotenv

# Load frontend env to get the backend URL
frontend_env = Path(__file__).parent.parent.parent / 'frontend' / '.env'
if frontend_env.exists():
    load_dotenv(frontend_env)

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://candle-ecommerce-hub.preview.emergentagent.com').rstrip('/')

# Known product IDs with variants
PRODUCT_WITH_COLORS = 'ccd58441-eca8-47c3-95ae-da0c7504ac19'  # Sandstone Ripple Coaster Set
PRODUCT_WITH_FLAVORS = 'b24e7fca-da00-4d63-bc91-31c78e64b17c'  # Vanilla Sandstone Candle
PRODUCT_WITH_BOTH = '0f29ccba-48ef-46eb-9c76-0703d6ae9c37'  # Rose Candle Bouquet


@pytest.fixture
def api_client():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


@pytest.fixture
def admin_token(api_client):
    response = api_client.post(f"{BASE_URL}/api/auth/login", json={
        "email": "admin@mariso.com",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json().get("token")
    pytest.skip(f"Admin auth failed: {response.text}")


@pytest.fixture
def admin_client(api_client, admin_token):
    api_client.headers.update({"Authorization": f"Bearer {admin_token}"})
    return api_client


class TestProductVariantsGet:
    """Tests for GET /api/products/{id} with variant data"""
    
    def test_product_with_colors_returns_color_options(self, api_client):
        """Verify product with has_color_options=true returns color_options array"""
        response = api_client.get(f"{BASE_URL}/api/products/{PRODUCT_WITH_COLORS}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check variant flags
        assert data['has_color_options'] == True
        assert data['has_flavor_options'] == False
        
        # Check color_options array
        assert 'color_options' in data
        assert isinstance(data['color_options'], list)
        assert len(data['color_options']) >= 1
        
        # Verify color option structure
        color = data['color_options'][0]
        assert 'id' in color
        assert 'name' in color
        assert 'hex_code' in color
        assert 'images' in color
        assert isinstance(color['images'], list)
    
    def test_product_with_flavors_returns_flavor_options(self, api_client):
        """Verify product with has_flavor_options=true returns flavor_options array"""
        response = api_client.get(f"{BASE_URL}/api/products/{PRODUCT_WITH_FLAVORS}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check variant flags
        assert data['has_color_options'] == False
        assert data['has_flavor_options'] == True
        
        # Check flavor_options array
        assert 'flavor_options' in data
        assert isinstance(data['flavor_options'], list)
        assert len(data['flavor_options']) >= 1
        
        # Verify flavor option structure
        flavor = data['flavor_options'][0]
        assert 'id' in flavor
        assert 'name' in flavor
        assert 'description' in flavor or flavor.get('description') == ''
    
    def test_product_with_both_variants(self, api_client):
        """Verify product with both variant types returns both arrays"""
        response = api_client.get(f"{BASE_URL}/api/products/{PRODUCT_WITH_BOTH}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check both flags are true
        assert data['has_color_options'] == True
        assert data['has_flavor_options'] == True
        
        # Check both arrays exist and have items
        assert len(data['color_options']) >= 1
        assert len(data['flavor_options']) >= 1
    
    def test_color_option_images_are_valid_urls(self, api_client):
        """Verify color options have valid image URLs"""
        response = api_client.get(f"{BASE_URL}/api/products/{PRODUCT_WITH_COLORS}")
        
        assert response.status_code == 200
        data = response.json()
        
        for color in data['color_options']:
            for img in color.get('images', []):
                assert img.startswith('http'), f"Invalid image URL: {img}"


class TestProductVariantsUpdate:
    """Tests for PUT /api/admin/products/{id} variant updates"""
    
    def test_admin_can_add_color_option(self, admin_client):
        """Admin can add a new color option to a product"""
        # First get the current product
        response = admin_client.get(f"{BASE_URL}/api/products/{PRODUCT_WITH_COLORS}")
        assert response.status_code == 200
        product = response.json()
        
        # Add a new color option
        new_color = {
            "name": f"TEST_APIColor_{os.getpid()}",
            "hex_code": "#123456",
            "images": ["https://example.com/test.jpg"]
        }
        
        updated_colors = product.get('color_options', []) + [new_color]
        
        update_data = {
            "color_options": updated_colors,
            "has_color_options": True
        }
        
        response = admin_client.put(
            f"{BASE_URL}/api/admin/products/{PRODUCT_WITH_COLORS}",
            json=update_data
        )
        
        assert response.status_code == 200
        updated = response.json()
        
        # Verify new color was added
        color_names = [c['name'] for c in updated.get('color_options', [])]
        assert new_color['name'] in color_names
        
        # Cleanup: remove the test color
        cleanup_colors = [c for c in updated['color_options'] if not c['name'].startswith('TEST_')]
        admin_client.put(
            f"{BASE_URL}/api/admin/products/{PRODUCT_WITH_COLORS}",
            json={"color_options": cleanup_colors}
        )
    
    def test_admin_can_add_flavor_option(self, admin_client):
        """Admin can add a new flavor option to a product"""
        # First get the current product
        response = admin_client.get(f"{BASE_URL}/api/products/{PRODUCT_WITH_FLAVORS}")
        assert response.status_code == 200
        product = response.json()
        
        # Add a new flavor option
        new_flavor = {
            "name": f"TEST_APIFlavor_{os.getpid()}",
            "description": "Test flavor description"
        }
        
        updated_flavors = product.get('flavor_options', []) + [new_flavor]
        
        update_data = {
            "flavor_options": updated_flavors,
            "has_flavor_options": True
        }
        
        response = admin_client.put(
            f"{BASE_URL}/api/admin/products/{PRODUCT_WITH_FLAVORS}",
            json=update_data
        )
        
        assert response.status_code == 200
        updated = response.json()
        
        # Verify new flavor was added
        flavor_names = [f['name'] for f in updated.get('flavor_options', [])]
        assert new_flavor['name'] in flavor_names
        
        # Cleanup: remove the test flavor
        cleanup_flavors = [f for f in updated['flavor_options'] if not f['name'].startswith('TEST_')]
        admin_client.put(
            f"{BASE_URL}/api/admin/products/{PRODUCT_WITH_FLAVORS}",
            json={"flavor_options": cleanup_flavors}
        )
    
    def test_admin_can_remove_color_option(self, admin_client):
        """Admin can remove a color option from a product"""
        # First get the current product
        response = admin_client.get(f"{BASE_URL}/api/products/{PRODUCT_WITH_BOTH}")
        assert response.status_code == 200
        product = response.json()
        
        original_colors = product.get('color_options', [])
        if len(original_colors) < 2:
            pytest.skip("Not enough colors to test deletion")
        
        # Remove the last color
        updated_colors = original_colors[:-1]
        
        update_data = {
            "color_options": updated_colors
        }
        
        response = admin_client.put(
            f"{BASE_URL}/api/admin/products/{PRODUCT_WITH_BOTH}",
            json=update_data
        )
        
        assert response.status_code == 200
        updated = response.json()
        
        # Verify color count decreased
        assert len(updated.get('color_options', [])) == len(original_colors) - 1
        
        # Restore the original colors
        admin_client.put(
            f"{BASE_URL}/api/admin/products/{PRODUCT_WITH_BOTH}",
            json={"color_options": original_colors}
        )


class TestProductListWithVariants:
    """Tests for GET /api/products list including variant metadata"""
    
    def test_products_list_includes_variant_flags(self, api_client):
        """Products list includes has_color_options and has_flavor_options"""
        response = api_client.get(f"{BASE_URL}/api/products")
        
        assert response.status_code == 200
        products = response.json()
        
        # Check that products have variant flags
        assert len(products) > 0
        
        for product in products:
            assert 'has_color_options' in product
            assert 'has_flavor_options' in product
            assert isinstance(product['has_color_options'], bool)
            assert isinstance(product['has_flavor_options'], bool)
    
    def test_products_list_includes_variant_arrays(self, api_client):
        """Products list includes color_options and flavor_options arrays"""
        response = api_client.get(f"{BASE_URL}/api/products")
        
        assert response.status_code == 200
        products = response.json()
        
        # Find a product with colors
        color_products = [p for p in products if p.get('has_color_options')]
        if color_products:
            product = color_products[0]
            assert 'color_options' in product
            assert isinstance(product['color_options'], list)
        
        # Find a product with flavors
        flavor_products = [p for p in products if p.get('has_flavor_options')]
        if flavor_products:
            product = flavor_products[0]
            assert 'flavor_options' in product
            assert isinstance(product['flavor_options'], list)
