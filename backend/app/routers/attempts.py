from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Answer, ExamAttempt, Question, User
from ..schemas import (
    AttemptHistoryItem,
    AttemptOut,
    AttemptQuestion,
    AttemptResult,
    AttemptReview,
    QuestionFull,
    QuestionPublic,
    ReviewQuestion,
    SaveAnswersRequest,
    StartAttemptRequest,
)
from ..scoring import grade_attempt, is_answer_correct
from ..selection import build_question_set

router = APIRouter(prefix="/attempts", tags=["attempts"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _owned_attempt(db: Session, attempt_id: str, user: User) -> ExamAttempt:
    attempt = db.get(ExamAttempt, attempt_id)
    if attempt is None or attempt.user_id != user.id:
        raise HTTPException(status_code=404, detail="Attempt not found")
    return attempt


@router.post("", response_model=AttemptOut, status_code=status.HTTP_201_CREATED)
def start_attempt(
    body: StartAttemptRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AttemptOut:
    questions = build_question_set(db, user.id, body)
    if not questions:
        raise HTTPException(status_code=400, detail="No questions match the requested configuration")

    time_limit = None
    if body.mode == "full_exam":
        time_limit = settings.exam_time_limit_minutes * 60

    attempt = ExamAttempt(
        user_id=user.id,
        exam_id=body.exam_id,
        mode=body.mode,
        config=body.model_dump(),
        time_limit_seconds=time_limit,
        total_questions=len(questions),
    )
    db.add(attempt)
    db.flush()

    for pos, q in enumerate(questions):
        db.add(Answer(attempt_id=attempt.id, question_id=q.id, position=pos, selected_answers=[]))
    db.commit()
    db.refresh(attempt)
    return _attempt_out(attempt)


@router.get("/{attempt_id}", response_model=AttemptOut)
def get_attempt(
    attempt_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> AttemptOut:
    return _attempt_out(_owned_attempt(db, attempt_id, user))


@router.patch("/{attempt_id}/answers", response_model=AttemptOut)
def save_answers(
    attempt_id: str,
    body: SaveAnswersRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AttemptOut:
    """Autosave endpoint: upserts selected answers / flags for in-progress attempts."""
    attempt = _owned_attempt(db, attempt_id, user)
    if attempt.status != "in_progress":
        raise HTTPException(status_code=409, detail="Attempt already submitted")

    by_qid = {a.question_id: a for a in attempt.answers}
    for state in body.answers:
        ans = by_qid.get(state.question_id)
        if ans is None:
            continue  # ignore questions not part of this attempt
        ans.selected_answers = [s.upper() for s in state.selected_answers]
        ans.flagged = state.flagged
        ans.time_spent_seconds = state.time_spent_seconds
        ans.answered_at = _now() if state.selected_answers else ans.answered_at
    db.commit()
    db.refresh(attempt)
    return _attempt_out(attempt)


@router.post("/{attempt_id}/submit", response_model=AttemptResult)
def submit_attempt(
    attempt_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> AttemptResult:
    attempt = _owned_attempt(db, attempt_id, user)
    if attempt.status == "submitted":
        return _result(attempt)

    stats = grade_attempt(attempt.answers)
    attempt.status = "submitted"
    attempt.submitted_at = _now()
    started = attempt.started_at
    if started.tzinfo is None:
        started = started.replace(tzinfo=timezone.utc)
    attempt.time_taken_seconds = int((attempt.submitted_at - started).total_seconds())
    attempt.total_questions = stats["total_questions"]
    attempt.correct_count = stats["correct_count"]
    attempt.percent = stats["percent"]
    attempt.score = stats["score"]
    attempt.passed = stats["passed"]
    db.commit()
    db.refresh(attempt)
    return _result(attempt, stats["domain_breakdown"])


@router.get("/{attempt_id}/review", response_model=AttemptReview)
def review_attempt(
    attempt_id: str,
    incorrect_only: bool = False,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AttemptReview:
    attempt = _owned_attempt(db, attempt_id, user)
    if attempt.status != "submitted":
        raise HTTPException(status_code=409, detail="Attempt not submitted yet")

    stats = grade_attempt(attempt.answers)  # recompute breakdown for the payload
    review_qs: list[ReviewQuestion] = []
    for ans in attempt.answers:
        if incorrect_only and ans.is_correct:
            continue
        review_qs.append(
            ReviewQuestion(
                position=ans.position,
                question=QuestionFull.model_validate(ans.question),
                selected_answers=ans.selected_answers or [],
                is_correct=bool(ans.is_correct),
                flagged=ans.flagged,
                time_spent_seconds=ans.time_spent_seconds,
            )
        )

    base = _result(attempt, stats["domain_breakdown"]).model_dump()
    return AttemptReview(**base, questions=review_qs)


@router.post("/{attempt_id}/grade-question", response_model=ReviewQuestion)
def grade_single_question(
    attempt_id: str,
    question_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReviewQuestion:
    """Practice mode: reveal correctness + explanation for one question immediately."""
    attempt = _owned_attempt(db, attempt_id, user)
    if attempt.mode == "full_exam":
        raise HTTPException(status_code=409, detail="Immediate grading is disabled during full exams")
    ans = next((a for a in attempt.answers if a.question_id == question_id), None)
    if ans is None:
        raise HTTPException(status_code=404, detail="Question not part of this attempt")
    ans.is_correct = is_answer_correct(ans.question, ans.selected_answers or [])
    ans.answered_at = ans.answered_at or _now()
    db.commit()
    return ReviewQuestion(
        position=ans.position,
        question=QuestionFull.model_validate(ans.question),
        selected_answers=ans.selected_answers or [],
        is_correct=bool(ans.is_correct),
        flagged=ans.flagged,
        time_spent_seconds=ans.time_spent_seconds,
    )


@router.get("", response_model=list[AttemptHistoryItem])
def history(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ExamAttempt]:
    return list(
        db.scalars(
            select(ExamAttempt)
            .where(ExamAttempt.user_id == user.id)
            .order_by(ExamAttempt.started_at.desc())
        ).all()
    )


# ------------------------------- helpers ------------------------------------
def _attempt_out(attempt: ExamAttempt) -> AttemptOut:
    questions = [
        AttemptQuestion(
            position=a.position,
            question=QuestionPublic.model_validate(a.question),
            selected_answers=a.selected_answers or [],
            flagged=a.flagged,
        )
        for a in attempt.answers
    ]
    return AttemptOut(
        id=attempt.id,
        mode=attempt.mode,
        exam_id=attempt.exam_id,
        status=attempt.status,
        time_limit_seconds=attempt.time_limit_seconds,
        started_at=attempt.started_at,
        submitted_at=attempt.submitted_at,
        total_questions=attempt.total_questions,
        questions=questions,
    )


def _result(attempt: ExamAttempt, breakdown: dict | None = None) -> AttemptResult:
    return AttemptResult(
        id=attempt.id,
        mode=attempt.mode,
        exam_id=attempt.exam_id,
        status=attempt.status,
        score=attempt.score,
        percent=attempt.percent,
        passed=attempt.passed,
        total_questions=attempt.total_questions,
        correct_count=attempt.correct_count,
        time_taken_seconds=attempt.time_taken_seconds,
        submitted_at=attempt.submitted_at,
        domain_breakdown=breakdown or {},
    )
