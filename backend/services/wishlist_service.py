from core.database import db
from utils.helpers import ensure_product_defaults

async def add_to_wishlist(user_id: str, product_id: str):
    await db.users.update_one(
        {"id": user_id},
        {"$addToSet": {"wishlist": product_id}}
    )
    return {"message": "Added to wishlist"}

async def remove_from_wishlist(user_id: str, product_id: str):
    await db.users.update_one(
        {"id": user_id},
        {"$pull": {"wishlist": product_id}}
    )
    return {"message": "Removed from wishlist"}

async def get_wishlist(user_id: str):
    user_doc = await db.users.find_one({"id": user_id}, {"_id": 0})
    wishlist_ids = user_doc.get("wishlist", []) if user_doc else []

    products = await db.products.find(
        {"id": {"$in": wishlist_ids}},
        {"_id": 0}
    ).to_list(100)

    for product in products:
        category = await db.categories.find_one({"id": product.get("category_id")}, {"_id": 0})
        product["category_name"] = category["name"] if category else ""
        ensure_product_defaults(product)

    return products