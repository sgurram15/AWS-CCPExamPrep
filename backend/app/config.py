"""Application configuration.

All settings are environment-overridable but ship with safe, zero-cost
local defaults: SQLite on disk, a dev JWT secret, and the AI tutor disabled.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# backend/  (two levels up from this file: app/config.py -> app -> backend)
BACKEND_DIR = Path(__file__).resolve().parent.parent
# project root (one level above backend/)
PROJECT_ROOT = BACKEND_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_name: str = "AWS CCP Exam Prep API"
    environment: str = "development"

    # SQLite by default — zero external services. Swap to a Postgres URL later
    # without touching application code (SQLAlchemy handles the dialect).
    database_url: str = f"sqlite:///{(BACKEND_DIR / 'ccp_prep.db').as_posix()}"

    # Auth
    jwt_secret: str = "dev-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    # CORS — the Next.js dev server
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Exam defaults (CLF-C02)
    exam_question_count: int = 65
    exam_time_limit_minutes: int = 90
    passing_score: int = 700  # AWS scaled score, 100-1000

    # Dataset seed source. Defaults to the file shipped in the project root.
    seed_file: str = str(PROJECT_ROOT / "aws_ccp_exam1_65_questions.json")

    # Ingestion: randomise option order so a dataset where the answer is always
    # "A" doesn't make the exam trivially gameable. Deterministic per question_id.
    shuffle_options_on_ingest: bool = True

    # Optional AI tutor. Left OFF (no key) => zero cost. The non-generative
    # tutor modes (explain / why-wrong) work without any provider.
    ai_tutor_enabled: bool = False
    ai_provider: str = "none"  # "none" | "anthropic" | "openai"
    ai_api_key: str = ""
    ai_model: str = "claude-haiku-4-5-20251001"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
