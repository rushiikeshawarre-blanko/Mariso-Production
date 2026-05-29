import asyncio
import inspect
from types import SimpleNamespace

import pytest
from fastapi import HTTPException, Response

from models.product import ProductCreate, ProductUpdate
from routes import categories as category_routes, products as product_routes
from services import category_service, product_service


class FakeCollection:
    def __init__(self, documents=None):
        self.documents = [dict(document) for document in (documents or [])]

    def _matches(self, document, query):
        for key, expected in query.items():
            if isinstance(expected, dict) and "$ne" in expected:
                if document.get(key) == expected["$ne"]:
                    return False
            elif document.get(key) != expected:
                return False
        return True

    async def find_one(self, query, projection=None):
        for document in self.documents:
            if self._matches(document, query):
                return dict(document)
        return None

    async def insert_one(self, document):
        self.documents.append(dict(document))

    async def find_one_and_update(self, query, update, **_kwargs):
        for document in self.documents:
            if self._matches(document, query):
                document.update(update.get("$set", {}))
                return dict(document)
        return None

    async def update_one(self, query, update):
        for document in self.documents:
            if self._matches(document, query):
                document.update(update.get("$set", {}))
                return


def run(coroutine):
    return asyncio.run(coroutine)


def product_payload(name, slug=""):
    return ProductCreate(
        name=name,
        slug=slug,
        description="Description",
        price=100,
        category_id="cat-1",
        color_options=[],
    )


def test_product_pack_size_normalized_when_not_selling_as_pack():
    product = product_payload("Single Candle")
    product.sell_as_pack = False
    product.pack_size = 6

    normalized = ProductCreate(**product.model_dump())

    assert normalized.sell_as_pack is False
    assert normalized.pack_size == 1


def test_product_pack_size_rejected_when_selling_as_pack():
    with pytest.raises(ValueError):
        ProductCreate(
            name="Pack Candle",
            description="Description",
            price=100,
            category_id="cat-1",
            color_options=[],
            sell_as_pack=True,
            pack_size=1,
        )


def configure_product_service(monkeypatch, documents=None):
    database = SimpleNamespace(products=FakeCollection(documents))

    async def category_exists(_category_id):
        return None

    async def passthrough(products):
        return products

    monkeypatch.setattr(product_service, "db", database)
    monkeypatch.setattr(product_service, "ensure_category_exists", category_exists)
    monkeypatch.setattr(product_service, "enrich_products", passthrough)
    return database.products


def configure_category_service(monkeypatch, documents=None):
    database = SimpleNamespace(categories=FakeCollection(documents))

    async def valid_parent(_parent_id):
        return None

    monkeypatch.setattr(category_service, "db", database)
    monkeypatch.setattr(category_service, "validate_parent_category", valid_parent)
    return database.categories


def test_product_create_blank_slug_normalizes_and_suffixes(monkeypatch):
    configure_product_service(monkeypatch)

    first = run(product_service.create_product(product_payload("Vanilla & Sandalwood")))
    second = run(product_service.create_product(product_payload("Vanilla & Sandalwood")))

    assert first["slug"] == "vanilla-and-sandalwood"
    assert second["slug"] == "vanilla-and-sandalwood-2"


def test_product_update_name_preserves_existing_slug(monkeypatch):
    configure_product_service(
        monkeypatch,
        [{"id": "product-1", "name": "Old Name", "slug": "stable-url", "price": 100, "is_on_sale": False}],
    )

    updated = run(product_service.update_product("product-1", ProductUpdate(name="New Name")))

    assert updated["name"] == "New Name"
    assert updated["slug"] == "stable-url"


def test_product_update_explicit_slug_changes_when_unique(monkeypatch):
    configure_product_service(
        monkeypatch,
        [{"id": "product-1", "name": "Name", "slug": "old-url", "price": 100, "is_on_sale": False}],
    )

    updated = run(product_service.update_product("product-1", ProductUpdate(slug="New URL")))

    assert updated["slug"] == "new-url"


def test_product_detail_can_be_loaded_by_id_and_normalized_slug(monkeypatch):
    configure_product_service(
        monkeypatch,
        [{"id": "product-1", "name": "Name", "slug": "new-url", "is_active": True}],
    )

    by_id = run(product_service.get_product("product-1"))
    by_slug = run(product_service.get_product_by_slug("New URL"))

    assert by_id["id"] == by_slug["id"] == "product-1"


def test_product_slug_lookup_returns_not_found_for_invalid_slug(monkeypatch):
    configure_product_service(monkeypatch)

    with pytest.raises(HTTPException) as error:
        run(product_service.get_product_by_slug("***"))

    assert error.value.status_code == 404


def test_public_product_detail_rejects_inactive_product(monkeypatch):
    configure_product_service(
        monkeypatch,
        [{"id": "product-1", "name": "Hidden", "slug": "hidden", "is_active": False}],
    )

    with pytest.raises(HTTPException) as by_id_error:
        run(product_service.get_product("product-1"))
    with pytest.raises(HTTPException) as by_slug_error:
        run(product_service.get_product_by_slug("hidden"))

    assert by_id_error.value.status_code == 404
    assert by_slug_error.value.status_code == 404


def test_public_product_list_always_requests_active_products(monkeypatch):
    requested = {}

    async def fetch_cards(**kwargs):
        requested.update(kwargs)
        return []

    monkeypatch.setattr(product_routes, "fetch_product_cards", fetch_cards)

    run(product_routes.get_products(Response()))

    assert "active_only" not in inspect.signature(product_routes.get_products).parameters
    assert requested["active_only"] is True


def test_public_categories_filter_active_while_admin_categories_do_not(monkeypatch):
    requested = []

    async def fetch_categories(active_only=False):
        requested.append(active_only)
        return []

    monkeypatch.setattr(category_routes, "get_all_categories", fetch_categories)

    run(category_routes.get_categories(Response()))
    run(category_routes.get_admin_categories({"role": "admin"}))

    assert requested == [True, False]


def test_public_category_detail_rejects_inactive_category(monkeypatch):
    configure_category_service(
        monkeypatch,
        [{"id": "category-1", "name": "Hidden", "is_active": False}],
    )

    with pytest.raises(HTTPException) as public_error:
        run(category_service.get_category_by_id("category-1", active_only=True))

    assert public_error.value.status_code == 404
    assert run(category_service.get_category_by_id("category-1"))["id"] == "category-1"


def test_public_category_detail_keeps_legacy_default_active_category(monkeypatch):
    configure_category_service(
        monkeypatch,
        [{"id": "category-1", "name": "Legacy"}],
    )

    category = run(category_service.get_category_by_id("category-1", active_only=True))

    assert category["is_active"] is True


def test_category_create_blank_slug_generates_slug(monkeypatch):
    configure_category_service(monkeypatch)

    created = run(
        category_service.create_category_doc(
            {"id": "category-1", "name": "Home & Decor", "slug": "", "parent_id": None}
        )
    )

    assert created["slug"] == "home-and-decor"


def test_category_update_name_preserves_existing_slug(monkeypatch):
    configure_category_service(
        monkeypatch,
        [{"id": "category-1", "name": "Old Name", "slug": "stable-category", "parent_id": None}],
    )

    updated = run(category_service.update_category_doc("category-1", {"name": "New Name"}))

    assert updated["name"] == "New Name"
    assert updated["slug"] == "stable-category"
