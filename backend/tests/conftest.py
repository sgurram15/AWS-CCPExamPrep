"""Test fixtures: a throwaway SQLite DB per test session + an authed client."""
from __future__ import annotations

import os
import tempfile

# Point the app at a temp DB BEFORE any app module imports settings.
_tmp_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ["DATABASE_URL"] = f"sqlite:///{_tmp_db}"
os.environ["JWT_SECRET"] = "test-secret"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _db():
    init_db()
    yield


@pytest.fixture()
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def auth_client(client):
    email = "tester@example.com"
    r = client.post("/auth/register", json={"email": email, "password": "password123"})
    if r.status_code == 409:
        r = client.post("/auth/login", json={"email": email, "password": "password123"})
    token = r.json()["access_token"]
    client.headers.update({"Authorization": f"Bearer {token}"})
    return client
