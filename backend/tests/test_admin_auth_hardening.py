import asyncio
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from core import auth
from services.auth_service import create_token


class FakeUsers:
    def __init__(self, users):
        self.users = {user["id"]: user for user in users}

    async def find_one(self, query, projection=None):
        user = self.users.get(query.get("id"))
        return dict(user) if user else None


def credentials_for(user_id: str, role: str = "user"):
    token = create_token(user_id, f"{user_id}@example.com", role)
    return SimpleNamespace(credentials=token)


def test_missing_token_returns_401(monkeypatch):
    monkeypatch.setattr(auth, "db", SimpleNamespace(users=FakeUsers([])))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth.get_current_user(None))

    assert exc.value.status_code == 401


def test_customer_token_returns_403_for_admin_dependency(monkeypatch):
    monkeypatch.setattr(
        auth,
        "db",
        SimpleNamespace(users=FakeUsers([{"id": "customer-1", "role": "user"}])),
    )

    with pytest.raises(HTTPException) as exc:
        asyncio.run(auth.get_admin_user(credentials_for("customer-1")))

    assert exc.value.status_code == 403


def test_admin_token_is_allowed_by_admin_dependency(monkeypatch):
    monkeypatch.setattr(
        auth,
        "db",
        SimpleNamespace(users=FakeUsers([{"id": "admin-1", "role": "admin"}])),
    )

    user = asyncio.run(auth.get_admin_user(credentials_for("admin-1", role="admin")))

    assert user["id"] == "admin-1"
    assert user["role"] == "admin"
