import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from models.product import ProductCreate, ProductUpdate
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
