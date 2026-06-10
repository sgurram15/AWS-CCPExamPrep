"""ORM models for the CCP exam-prep app.

SQLite-friendly: JSON columns are stored as TEXT via SQLAlchemy's JSON type,
list/dict round-trips handled by the driver.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    subscription_status: Mapped[str] = mapped_column(String, default="free", nullable=False)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    attempts: Mapped[list["ExamAttempt"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    bookmarks: Mapped[list["Bookmark"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    notes: Mapped[list["Note"]] = relationship(back_populates="user", cascade="all, delete-orphan")


class Exam(Base):
    """A mock-exam definition (e.g. the four CLF-C02 practice exams)."""

    __tablename__ = "exams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)  # source exam_id (1..4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    question_count: Mapped[int] = mapped_column(Integer, default=0)
    time_limit_minutes: Mapped[int] = mapped_column(Integer, default=90)
    passing_score: Mapped[int] = mapped_column(Integer, default=700)

    questions: Mapped[list["Question"]] = relationship(back_populates="exam")


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    question_id: Mapped[str] = mapped_column(String, unique=True, index=True, nullable=False)
    exam_id: Mapped[int | None] = mapped_column(ForeignKey("exams.id"), index=True, nullable=True)
    question_number: Mapped[int] = mapped_column(Integer, default=0)

    domain: Mapped[str] = mapped_column(String, index=True, nullable=False)
    difficulty: Mapped[str] = mapped_column(String, index=True, default="medium")
    question_type: Mapped[str] = mapped_column(String, default="single_choice")  # single_choice | multi_select

    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    option_a: Mapped[str] = mapped_column(Text, default="")
    option_b: Mapped[str] = mapped_column(Text, default="")
    option_c: Mapped[str] = mapped_column(Text, default="")
    option_d: Mapped[str] = mapped_column(Text, default="")

    correct_answer: Mapped[str] = mapped_column(String, default="")  # single letter for single_choice
    correct_answers: Mapped[list] = mapped_column(JSON, default=list)  # list of letters

    explanation_correct: Mapped[str] = mapped_column(Text, default="")
    why_a_wrong: Mapped[str] = mapped_column(Text, default="")
    why_b_wrong: Mapped[str] = mapped_column(Text, default="")
    why_c_wrong: Mapped[str] = mapped_column(Text, default="")
    why_d_wrong: Mapped[str] = mapped_column(Text, default="")

    topic_tags: Mapped[list] = mapped_column(JSON, default=list)
    source_reference: Mapped[str] = mapped_column(String, default="")

    # sha256 of normalized text+options, used for dedup on ingest
    content_hash: Mapped[str] = mapped_column(String, index=True, default="")

    exam: Mapped["Exam"] = relationship(back_populates="questions")

    @property
    def options(self) -> dict[str, str]:
        return {"A": self.option_a, "B": self.option_b, "C": self.option_c, "D": self.option_d}

    def why_wrong_for(self, letter: str) -> str:
        return {
            "A": self.why_a_wrong,
            "B": self.why_b_wrong,
            "C": self.why_c_wrong,
            "D": self.why_d_wrong,
        }.get(letter.upper(), "")


class ExamAttempt(Base):
    __tablename__ = "exam_attempts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    exam_id: Mapped[int | None] = mapped_column(ForeignKey("exams.id"), nullable=True)

    # full_exam | practice | domain | review | bookmark
    mode: Mapped[str] = mapped_column(String, default="practice", nullable=False)
    config: Mapped[dict] = mapped_column(JSON, default=dict)  # filters used to build the set

    status: Mapped[str] = mapped_column(String, default="in_progress")  # in_progress | submitted
    time_limit_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_taken_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)

    total_questions: Mapped[int] = mapped_column(Integer, default=0)
    correct_count: Mapped[int] = mapped_column(Integer, default=0)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)  # scaled 100-1000
    percent: Mapped[float | None] = mapped_column(Float, nullable=True)
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    user: Mapped["User"] = relationship(back_populates="attempts")
    answers: Mapped[list["Answer"]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan", order_by="Answer.position"
    )


class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_answer_attempt_question"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("exam_attempts.id"), index=True, nullable=False)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"), nullable=False)
    position: Mapped[int] = mapped_column(Integer, default=0)  # order within the attempt

    selected_answers: Mapped[list] = mapped_column(JSON, default=list)  # letters chosen
    is_correct: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    time_spent_seconds: Mapped[int] = mapped_column(Integer, default=0)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    attempt: Mapped["ExamAttempt"] = relationship(back_populates="answers")
    question: Mapped["Question"] = relationship()


class Bookmark(Base):
    __tablename__ = "bookmarks"
    __table_args__ = (UniqueConstraint("user_id", "question_id", name="uq_bookmark_user_question"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    user: Mapped["User"] = relationship(back_populates="bookmarks")
    question: Mapped["Question"] = relationship()


class Note(Base):
    __tablename__ = "notes"
    __table_args__ = (UniqueConstraint("user_id", "question_id", name="uq_note_user_question"),)

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    user: Mapped["User"] = relationship(back_populates="notes")
    question: Mapped["Question"] = relationship()
