"""Pydantic request/response models.

Two flavours of question payload:
- ``QuestionPublic`` hides the correct answer + explanations (used while an
  exam is in progress so clients can't cheat).
- ``QuestionFull`` includes everything (used in practice/review).
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


# ----------------------------- Auth -----------------------------------------
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    subscription_status: str
    preferences: dict
    created_at: datetime


# --------------------------- Questions --------------------------------------
class QuestionPublic(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    question_id: str
    exam_id: int | None
    question_number: int
    domain: str
    difficulty: str
    question_type: str
    question_text: str
    options: dict[str, str]
    topic_tags: list[str]


class QuestionFull(QuestionPublic):
    correct_answer: str
    correct_answers: list[str]
    explanation_correct: str
    why_a_wrong: str
    why_b_wrong: str
    why_c_wrong: str
    why_d_wrong: str
    source_reference: str


class QuestionList(BaseModel):
    items: list[QuestionPublic]
    total: int
    page: int
    size: int


class Facets(BaseModel):
    domains: list[str]
    difficulties: list[str]
    question_types: list[str]
    exams: list[int]
    topics: list[str]


# ----------------------------- Exams ----------------------------------------
class ExamOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: str
    question_count: int
    time_limit_minutes: int
    passing_score: int


# ---------------------------- Attempts --------------------------------------
class StartAttemptRequest(BaseModel):
    mode: str = Field(default="practice")  # full_exam|practice|domain|review|bookmark
    exam_id: int | None = None
    domain: str | None = None
    difficulty: str | None = None
    num_questions: int | None = None
    bookmarked_only: bool = False
    review_attempt_id: str | None = None  # for mode="review": redo missed from this attempt


class AnswerState(BaseModel):
    question_id: str  # the internal Question.id
    selected_answers: list[str] = []
    flagged: bool = False
    time_spent_seconds: int = 0


class SaveAnswersRequest(BaseModel):
    answers: list[AnswerState]


class AttemptQuestion(BaseModel):
    position: int
    question: QuestionPublic
    selected_answers: list[str]
    flagged: bool


class AttemptOut(BaseModel):
    id: str
    mode: str
    exam_id: int | None
    status: str
    time_limit_seconds: int | None
    started_at: datetime
    submitted_at: datetime | None
    total_questions: int
    questions: list[AttemptQuestion]


class ReviewQuestion(BaseModel):
    position: int
    question: QuestionFull
    selected_answers: list[str]
    is_correct: bool
    flagged: bool
    time_spent_seconds: int


class AttemptResult(BaseModel):
    id: str
    mode: str
    exam_id: int | None
    status: str
    score: int | None
    percent: float | None
    passed: bool | None
    total_questions: int
    correct_count: int
    time_taken_seconds: int | None
    submitted_at: datetime | None
    domain_breakdown: dict[str, dict]


class AttemptReview(AttemptResult):
    questions: list[ReviewQuestion]


class AttemptHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    mode: str
    exam_id: int | None
    config: dict
    status: str
    score: int | None
    percent: float | None
    passed: bool | None
    total_questions: int
    correct_count: int
    time_taken_seconds: int | None
    started_at: datetime
    submitted_at: datetime | None


# --------------------------- Bookmarks/Notes --------------------------------
class BookmarkRequest(BaseModel):
    question_id: str


class NoteRequest(BaseModel):
    question_id: str
    body: str


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    question_id: str
    body: str
    updated_at: datetime


# ---------------------------- Progress --------------------------------------
class DomainStat(BaseModel):
    domain: str
    answered: int
    correct: int
    accuracy: float


class Dashboard(BaseModel):
    questions_answered: int
    distinct_questions_seen: int
    average_score: float | None
    best_score: int | None
    exams_taken: int
    exams_passed: int
    study_streak_days: int
    domain_stats: list[DomainStat]
    weak_domains: list[str]


# ---------------------------- Ingestion -------------------------------------
class IngestReport(BaseModel):
    received: int
    inserted: int
    updated: int
    duplicates: int
    skipped: int
    errors: list[str]


# ------------------------------ Tutor ---------------------------------------
class TutorRequest(BaseModel):
    mode: str  # explain | why_wrong | teach_topic | generate_similar | weak_area_coaching
    question_id: str | None = None
    selected_answer: str | None = None
    topic: str | None = None
    message: str | None = None


class TutorResponse(BaseModel):
    mode: str
    grounded: bool  # True when answer is sourced directly from stored dataset
    content: str
    citations: list[str] = []
    enabled: bool = True
