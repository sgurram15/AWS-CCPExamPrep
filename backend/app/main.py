"""FastAPI application entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .database import init_db
from .routers import admin, attempts, auth, bookmarks, exams, notes, progress, questions, tutor


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title=settings.app_name,
    version="0.1.0",
    description="Zero-cost AWS Certified Cloud Practitioner (CLF-C02) exam-prep API.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(questions.router)
app.include_router(exams.router)
app.include_router(attempts.router)
app.include_router(bookmarks.router)
app.include_router(notes.router)
app.include_router(progress.router)
app.include_router(admin.router)
app.include_router(tutor.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {"status": "ok", "app": settings.app_name, "ai_tutor_enabled": settings.ai_tutor_enabled}
