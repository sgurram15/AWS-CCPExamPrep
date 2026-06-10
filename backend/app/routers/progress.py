from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Answer, ExamAttempt, Question, User
from ..schemas import Dashboard, DomainStat

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/dashboard", response_model=Dashboard)
def dashboard(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> Dashboard:
    attempts = list(
        db.scalars(select(ExamAttempt).where(ExamAttempt.user_id == user.id)).all()
    )
    submitted = [a for a in attempts if a.status == "submitted"]

    scores = [a.score for a in submitted if a.score is not None]
    average_score = round(sum(scores) / len(scores), 1) if scores else None
    best_score = max(scores) if scores else None
    exams_passed = sum(1 for a in submitted if a.passed)

    # Per-domain accuracy across all graded answers.
    rows = (
        db.query(Answer, Question)
        .join(Question, Answer.question_id == Question.id)
        .join(ExamAttempt, Answer.attempt_id == ExamAttempt.id)
        .filter(ExamAttempt.user_id == user.id, Answer.is_correct.isnot(None))
        .all()
    )
    dom: dict[str, dict[str, int]] = defaultdict(lambda: {"answered": 0, "correct": 0})
    distinct_questions: set[str] = set()
    for ans, q in rows:
        dom[q.domain]["answered"] += 1
        dom[q.domain]["correct"] += int(bool(ans.is_correct))
        distinct_questions.add(q.id)

    domain_stats = [
        DomainStat(
            domain=d,
            answered=v["answered"],
            correct=v["correct"],
            accuracy=round(v["correct"] / v["answered"], 4) if v["answered"] else 0.0,
        )
        for d, v in sorted(dom.items())
    ]
    weak_domains = [s.domain for s in domain_stats if s.answered >= 3 and s.accuracy < 0.7]

    return Dashboard(
        questions_answered=sum(v["answered"] for v in dom.values()),
        distinct_questions_seen=len(distinct_questions),
        average_score=average_score,
        best_score=best_score,
        exams_taken=len(submitted),
        exams_passed=exams_passed,
        study_streak_days=_streak([a.submitted_at.date() for a in submitted if a.submitted_at]),
        domain_stats=domain_stats,
        weak_domains=weak_domains,
    )


def _streak(days: list[date]) -> int:
    """Consecutive-day streak ending today or yesterday."""
    if not days:
        return 0
    unique = set(days)
    today = date.today()
    if today not in unique and (today - timedelta(days=1)) not in unique:
        return 0
    cursor = today if today in unique else today - timedelta(days=1)
    streak = 0
    while cursor in unique:
        streak += 1
        cursor -= timedelta(days=1)
    return streak
