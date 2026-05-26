import asyncio
import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from services import seed_service


BACKEND_DIR = Path(__file__).resolve().parent.parent


class CountingCollection:
    def __init__(self, count):
        self.count = count
        self.queries = 0

    async def count_documents(self, _query):
        self.queries += 1
        return self.count


def seed_route_is_registered(environment):
    env = os.environ.copy()
    env["ENVIRONMENT"] = environment
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from server import app; print(any(route.path == '/api/seed' for route in app.routes))",
        ],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        check=True,
        text=True,
    )
    return result.stdout.strip() == "True"


def test_seed_route_is_hidden_when_environment_is_blank():
    assert seed_route_is_registered("") is False


def test_seed_route_is_registered_only_for_explicit_development():
    assert seed_route_is_registered("development") is True


def test_seed_service_rejects_non_development_before_database_access(monkeypatch):
    class UnexpectedDatabase:
        def __getattr__(self, _name):
            raise AssertionError("Seed database must not be accessed outside development")

    monkeypatch.setattr(seed_service, "ENVIRONMENT", "production")
    monkeypatch.setattr(seed_service, "db", UnexpectedDatabase())

    with pytest.raises(HTTPException) as error:
        asyncio.run(seed_service.seed_database())

    assert error.value.status_code == 403


def test_seed_service_allows_explicit_development_idempotent_check(monkeypatch):
    users = CountingCollection(1)
    database = SimpleNamespace(
        users=users,
        categories=CountingCollection(0),
        products=CountingCollection(0),
        orders=CountingCollection(0),
    )
    monkeypatch.setattr(seed_service, "ENVIRONMENT", "development")
    monkeypatch.setattr(seed_service, "db", database)

    response = asyncio.run(seed_service.seed_database())

    assert response["message"] == "Database already seeded"
    assert response["existing_counts"]["users"] == 1
    assert users.queries == 1
