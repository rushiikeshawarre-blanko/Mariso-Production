from fastapi import HTTPException
from core.config import ENVIRONMENT
import uuid
from datetime import datetime, timezone, timedelta
from core.database import db
from services.auth_service import hash_password


async def seed_database():
    if ENVIRONMENT != "development":
        raise HTTPException(status_code=403, detail="Seeding is only allowed in development environment")
    
    existing_counts = {
        "users": await db.users.count_documents({}),
        "categories": await db.categories.count_documents({}),
        "products": await db.products.count_documents({}),
        "orders": await db.orders.count_documents({}),
    }
    if any(count > 0 for count in existing_counts.values()):
        return {
            "message": "Database already seeded",
            "existing_counts": existing_counts,
        }
    
    # Create admin user
    admin_id = str(uuid.uuid4())
    admin_doc = {
        "id": admin_id,
        "name": "Admin",
        "email": "mariso.store@gmail.com",
        "password": hash_password("Admin@1234"),
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
    
    # Create hierarchical categories
    candles_category_id = str(uuid.uuid4())
    homewares_category_id = str(uuid.uuid4())
    jesmonite_coasters_category_id = str(uuid.uuid4())
    ceramic_coasters_category_id = str(uuid.uuid4())
    reusable_containers_category_id = str(uuid.uuid4())
    container_candles_category_id = str(uuid.uuid4())
    candle_bouquets_category_id = str(uuid.uuid4())

    categories = [
        {
            "id": candles_category_id,
            "name": "Candles",
            "slug": "candles",
            "description": "All candle products.",
            "image": "https://images.pexels.com/photos/9518738/pexels-photo-9518738.jpeg?w=800",
            "parent_id": None,
            "show_in_nav": True,
            "sort_order": 1,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": homewares_category_id,
            "name": "Homewares",
            "slug": "homewares",
            "description": "All homeware products.",
            "image": "https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800",
            "parent_id": None,
            "show_in_nav": True,
            "sort_order": 2,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": jesmonite_coasters_category_id,
            "name": "Jesmonite Coasters",
            "slug": "jesmonite-coasters",
            "description": "Handcrafted eco-friendly jesmonite coasters.",
            "image": "https://images.unsplash.com/photo-1616046229478-9901c5536a45?w=800",
            "parent_id": homewares_category_id,
            "show_in_nav": False,
            "sort_order": 1,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": ceramic_coasters_category_id,
            "name": "Ceramic Coasters",
            "slug": "ceramic-coasters",
            "description": "Elegant ceramic coasters for your home.",
            "image": "https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=800",
            "parent_id": homewares_category_id,
            "show_in_nav": False,
            "sort_order": 2,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": reusable_containers_category_id,
            "name": "Reusable Containers",
            "slug": "reusable-containers",
            "description": "Artistic containers that can be reused as décor or storage.",
            "image": "https://images.unsplash.com/photo-1602874801007-bd458bb1b8b6?w=800",
            "parent_id": homewares_category_id,
            "show_in_nav": False,
            "sort_order": 3,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": container_candles_category_id,
            "name": "Container Candles",
            "slug": "container-candles",
            "description": "Hand-poured candles inside reusable containers.",
            "image": "https://images.pexels.com/photos/9518738/pexels-photo-9518738.jpeg?w=800",
            "parent_id": candles_category_id,
            "show_in_nav": False,
            "sort_order": 1,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
        {
            "id": candle_bouquets_category_id,
            "name": "Candle Bouquets",
            "slug": "candle-bouquets",
            "description": "Customized decorative candle bouquets for gifting.",
            "image": "https://images.unsplash.com/photo-1621341104239-d11fd41673ec?w=800",
            "parent_id": candles_category_id,
            "show_in_nav": False,
            "sort_order": 2,
            "is_active": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        },
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
            "category_id": jesmonite_coasters_category_id,
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
            "category_id": container_candles_category_id,
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
            "category_id": candle_bouquets_category_id,
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
            "category_id": reusable_containers_category_id,
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
            "category_id": jesmonite_coasters_category_id,
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
                {"id": "tj-pastel", "name": "Pastel Mix", "hex_code": "#FFE4E1", "images": []},
                {"id": "tj-earth", "name": "Earth Tones", "hex_code": "#D2B48C", "images": []}
            ],
            "flavor_options": [],
            "variants": [
                {"id": str(uuid.uuid4()), "color_id": "tj-pastel", "color_name": "Pastel Mix", "flavor_id": None, "flavor_name": None, "sku": "JC-002-PST", "price_override": None, "stock": 10, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "tj-earth", "color_name": "Earth Tones", "flavor_id": None, "flavor_name": None, "sku": "JC-002-ERT", "price_override": None, "stock": 8, "is_active": True}
            ],
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
            "category_id": container_candles_category_id,
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
            "category_id": candle_bouquets_category_id,
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
                {"id": "lcb-ivory", "name": "Ivory", "hex_code": "#FFFFF0", "images": []},
                {"id": "lcb-gold", "name": "Gold", "hex_code": "#FFD700", "images": []}
            ],
            "flavor_options": [
                {"id": "lcb-signature", "name": "Signature Blend", "description": "Our signature mix", "images": []},
                {"id": "lcb-florals", "name": "Fresh Florals", "description": "Mixed floral scents", "images": []}
            ],
            "variants": [
                {"id": str(uuid.uuid4()), "color_id": "lcb-ivory", "color_name": "Ivory", "flavor_id": "lcb-signature", "flavor_name": "Signature Blend", "sku": "CB-002-IVR-SIG", "price_override": None, "stock": 2, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "lcb-ivory", "color_name": "Ivory", "flavor_id": "lcb-florals", "flavor_name": "Fresh Florals", "sku": "CB-002-IVR-FLR", "price_override": None, "stock": 1, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "lcb-gold", "color_name": "Gold", "flavor_id": "lcb-signature", "flavor_name": "Signature Blend", "sku": "CB-002-GLD-SIG", "price_override": 3699, "stock": 1, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "lcb-gold", "color_name": "Gold", "flavor_id": "lcb-florals", "flavor_name": "Fresh Florals", "sku": "CB-002-GLD-FLR", "price_override": 3699, "stock": 1, "is_active": True}
            ],
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
            "category_id": ceramic_coasters_category_id,
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
                {"id": "cm-white", "name": "White Marble", "hex_code": "#F5F5F5", "images": []},
                {"id": "cm-grey", "name": "Grey Marble", "hex_code": "#808080", "images": []},
                {"id": "cm-black", "name": "Black Marble", "hex_code": "#1C1C1C", "images": []}
            ],
            "flavor_options": [],
            "variants": [
                {"id": str(uuid.uuid4()), "color_id": "cm-white", "color_name": "White Marble", "flavor_id": None, "flavor_name": None, "sku": "CRC-001-WHT", "price_override": None, "stock": 8, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "cm-grey", "color_name": "Grey Marble", "flavor_id": None, "flavor_name": None, "sku": "CRC-001-GRY", "price_override": None, "stock": 7, "is_active": True},
                {"id": str(uuid.uuid4()), "color_id": "cm-black", "color_name": "Black Marble", "flavor_id": None, "flavor_name": None, "sku": "CRC-001-BLK", "price_override": 1099, "stock": 5, "is_active": True}
            ],
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
    
    return {"message": "Database seeded successfully", "admin_email": "mariso.store@gmail.com", "admin_password": "Admin@1234"}
