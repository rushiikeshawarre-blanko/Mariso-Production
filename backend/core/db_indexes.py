async def create_indexes(db):
    await db.categories.create_index("id", unique=True)
    await db.users.create_index("id", unique=True)
    await db.users.create_index(
        "email",
        unique=True,
        partialFilterExpression={"email": {"$type": "string", "$gt": ""}}
    )
    await db.orders.create_index("id", unique=True)
    await db.orders.create_index("user_id")
    await db.orders.create_index("created_at")
    await db.orders.create_index("status")

    await db.products.create_index("id", unique=True)
    await db.products.create_index([("is_active", 1), ("category_id", 1)])
    await db.products.create_index([("is_active", 1), ("is_featured", 1)])
    await db.products.create_index([("is_active", 1), ("is_bestseller", 1)])
    await db.products.create_index("is_active")
    await db.products.create_index("slug", unique=True)

    await db.coupons.create_index("id", unique=True)
    await db.coupons.create_index("code", unique=True)
    await db.coupons.create_index("is_active")
    await db.coupons.create_index([("start_date", 1), ("end_date", 1)])
