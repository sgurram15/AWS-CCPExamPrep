"""Build the list of questions for an attempt based on its mode/config.

Modes:
- full_exam: all questions of an exam in order (or a random 65-question mix).
- practice:  filtered by domain/difficulty, random order.
- domain:    adaptive — questions from one domain, weighting the user's weak
             topics (low past accuracy) more heavily.
- bookmark:  only the user's bookmarked questions.
- review:    the questions answered incorrectly in a prior attempt.
"""
from __future__ import annotations

import random
from collections import defaultdict

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .models import Answer, Bookmark, ExamAttempt, Question


def _base_query():
    return select(Question)


def _user_topic_accuracy(db: Session, user_id: str) -> dict[str, float]:
    """Accuracy per topic tag from the user's submitted answers (0..1)."""
    rows = (
        db.query(Answer, Question)
        .join(Question, Answer.question_id == Question.id)
        .join(ExamAttempt, Answer.attempt_id == ExamAttempt.id)
        .filter(ExamAttempt.user_id == user_id, Answer.is_correct.isnot(None))
        .all()
    )
    agg: dict[str, list[int]] = defaultdict(list)
    for ans, q in rows:
        for tag in q.topic_tags or []:
            agg[tag].append(1 if ans.is_correct else 0)
    return {tag: (sum(v) / len(v)) for tag, v in agg.items() if v}


def build_question_set(db: Session, user_id: str, cfg) -> list[Question]:
    mode = cfg.mode
    rng = random.Random()

    if mode == "bookmark" or cfg.bookmarked_only:
        q_ids = [b.question_id for b in db.scalars(select(Bookmark).where(Bookmark.user_id == user_id)).all()]
        if not q_ids:
            return []
        questions = db.scalars(select(Question).where(Question.id.in_(q_ids))).all()
        questions = list(questions)
        rng.shuffle(questions)
        return _limit(questions, cfg.num_questions)

    if mode == "review" and cfg.review_attempt_id:
        wrong_ids = [
            a.question_id
            for a in db.scalars(
                select(Answer).where(
                    Answer.attempt_id == cfg.review_attempt_id, Answer.is_correct.is_(False)
                )
            ).all()
        ]
        if not wrong_ids:
            return []
        questions = list(db.scalars(select(Question).where(Question.id.in_(wrong_ids))).all())
        return questions

    if mode == "full_exam":
        stmt = _base_query()
        if cfg.exam_id is not None:
            stmt = stmt.where(Question.exam_id == cfg.exam_id).order_by(Question.question_number)
            questions = list(db.scalars(stmt).all())
        else:
            questions = list(db.scalars(stmt).all())
            rng.shuffle(questions)
        return _limit(questions, cfg.num_questions or settings.exam_question_count)

    if mode == "domain":
        stmt = _base_query()
        if cfg.domain:
            stmt = stmt.where(Question.domain == cfg.domain)
        if cfg.difficulty:
            stmt = stmt.where(Question.difficulty == cfg.difficulty)
        pool = list(db.scalars(stmt).all())
        weighted = _adaptive_order(pool, _user_topic_accuracy(db, user_id), rng)
        return _limit(weighted, cfg.num_questions or 20)

    # default: practice
    stmt = _base_query()
    if cfg.exam_id is not None:
        stmt = stmt.where(Question.exam_id == cfg.exam_id)
    if cfg.domain:
        stmt = stmt.where(Question.domain == cfg.domain)
    if cfg.difficulty:
        stmt = stmt.where(Question.difficulty == cfg.difficulty)
    questions = list(db.scalars(stmt).all())
    rng.shuffle(questions)
    return _limit(questions, cfg.num_questions or 20)


def _adaptive_order(pool: list[Question], topic_acc: dict[str, float], rng: random.Random) -> list[Question]:
    """Sort so weaker topics (and unseen topics) come first, with light jitter."""

    def weakness(q: Question) -> float:
        tags = q.topic_tags or []
        accs = [topic_acc[t] for t in tags if t in topic_acc]
        # unseen topics -> treat as moderately weak (0.5) so they still surface
        base = (sum(accs) / len(accs)) if accs else 0.5
        weakness_score = 1.0 - base
        return weakness_score + rng.uniform(0, 0.15)

    return sorted(pool, key=weakness, reverse=True)


def _limit(questions: list[Question], n: int | None) -> list[Question]:
    if n is None or n <= 0:
        return questions
    return questions[:n]
