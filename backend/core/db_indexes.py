import logging

from pymongo.errors import DuplicateKeyError, OperationFailure


logger = logging.getLogger(__name__)


async def create_indexes(db):
    await db.categories.create_index("id", unique=True)
    try:
        await db.categories.create_index(
            "slug",
            unique=True,
            partialFilterExpression={"slug": {"$type": "string", "$gt": ""}},
        )
    except (DuplicateKeyError, OperationFailure):
        logger.warning("Skipping unique category slug index because existing category slugs conflict")
    await db.users.create_index("id", unique=True)
    await db.users.create_index(
        "email",
        unique=True,
        partialFilterExpression={"email": {"$type": "string", "$gt": ""}}
    )
    await db.orders.create_index("id", unique=True)
    await db.orders.create_index(
        "feedback_token",
        unique=True,
        partialFilterExpression={"feedback_token": {"$type": "string", "$gt": ""}},
    )
    await db.orders.create_index("user_id")
    await db.orders.create_index("created_at")
    await db.orders.create_index("status")
    await db.orders.create_index([
        ("payment_provider", 1),
        ("payment_status", 1),
        ("status", 1),
        ("stock_reserved_until", 1),
    ])

    await db.products.create_index("id", unique=True)
    await db.products.create_index([("is_active", 1), ("category_id", 1)])
    await db.products.create_index([("is_active", 1), ("is_featured", 1)])
    await db.products.create_index([("is_active", 1), ("is_bestseller", 1)])
    await db.products.create_index([("is_active", 1), ("shop_priority", -1), ("shop_order", 1), ("created_at", -1)])
    await db.products.create_index("is_active")
    await db.products.create_index("slug", unique=True)

    await db.coupons.create_index("id", unique=True)
    await db.coupons.create_index("code", unique=True)
    await db.coupons.create_index("is_active")
    await db.coupons.create_index("visibility")
    await db.coupons.create_index([("visibility", 1), ("is_active", 1)])
    await db.coupons.create_index([("start_date", 1), ("end_date", 1)])
    await db.coupons.create_index("assigned_user_id")
    await db.coupons.create_index("assigned_email")
    await db.coupons.create_index("assigned_phone")
    await db.coupons.create_index(
        "source_feedback_submission_id",
        unique=True,
        partialFilterExpression={"source_feedback_submission_id": {"$type": "string", "$gt": ""}},
    )

    await db.feedback_questions.create_index("id", unique=True)
    await db.feedback_questions.create_index([("is_active", 1), ("sort_order", 1)])

    await db.feedback_reward_rules.create_index("id", unique=True)
    await db.feedback_reward_rules.create_index([("is_active", 1), ("priority", 1), ("min_order_amount", 1), ("max_order_amount", 1)])

    await db.feedback_submissions.create_index("id", unique=True)
    await db.feedback_submissions.create_index("order_id", unique=True)
    await db.feedback_submissions.create_index("feedback_token")
    await db.feedback_submissions.create_index([("show_on_homepage", 1), ("homepage_status", 1)])

    await db.homepage_settings.create_index("key", unique=True)
