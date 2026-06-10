"""SQLAlchemy engine, session factory, and declarative base.

Uses SQLite by default. The ``check_same_thread`` flag is required so the
connection can be shared across FastAPI's threadpool workers.
"""
from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings

connect_args = {}
if settings.database_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

engine = create_engine(
    settings.database_url,
    connect_args=connect_args,
    echo=False,
    future=True,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a scoped session and always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create all tables. Idempotent. Enough for a light SQLite app.

    For Postgres later, swap this for Alembic migrations.
    """
    from . import models  # noqa: F401  (ensure models are registered)

    Base.metadata.create_all(bind=engine)
