from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import distinct, func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Question
from ..schemas import Facets, QuestionFull, QuestionList, QuestionPublic

router = APIRouter(prefix="/questions", tags=["questions"])


@router.get("", response_model=QuestionList)
def list_questions(
    db: Session = Depends(get_db),
    domain: str | None = None,
    difficulty: str | None = None,
    topic: str | None = None,
    exam_id: int | None = None,
    question_type: str | None = None,
    q: str | None = Query(default=None, description="keyword search over text + tags"),
    page: int = Query(default=1, ge=1),
    size: int = Query(default=20, ge=1, le=100),
) -> QuestionList:
    stmt = select(Question)
    if domain:
        stmt = stmt.where(Question.domain == domain)
    if difficulty:
        stmt = stmt.where(Question.difficulty == difficulty)
    if exam_id is not None:
        stmt = stmt.where(Question.exam_id == exam_id)
    if question_type:
        stmt = stmt.where(Question.question_type == question_type)
    if topic:
        # topic_tags is a JSON list stored as text; a substring match on the
        # serialized column is portable across SQLite/Postgres and good enough.
        stmt = stmt.where(func.lower(Question.topic_tags).like(f"%{topic.lower()}%"))
    if q:
        like = f"%{q.lower()}%"
        stmt = stmt.where(
            or_(func.lower(Question.question_text).like(like), func.lower(Question.topic_tags).like(like))
        )

    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    stmt = stmt.order_by(Question.exam_id, Question.question_number).offset((page - 1) * size).limit(size)
    items = list(db.scalars(stmt).all())
    return QuestionList(
        items=[QuestionPublic.model_validate(i) for i in items], total=total, page=page, size=size
    )


@router.get("/facets", response_model=Facets)
def facets(db: Session = Depends(get_db)) -> Facets:
    domains = [r for (r,) in db.execute(select(distinct(Question.domain))).all() if r]
    difficulties = [r for (r,) in db.execute(select(distinct(Question.difficulty))).all() if r]
    qtypes = [r for (r,) in db.execute(select(distinct(Question.question_type))).all() if r]
    exams = [r for (r,) in db.execute(select(distinct(Question.exam_id))).all() if r is not None]
    topics: set[str] = set()
    for (tags,) in db.execute(select(Question.topic_tags)).all():
        for t in tags or []:
            topics.add(t)
    return Facets(
        domains=sorted(domains),
        difficulties=sorted(difficulties),
        question_types=sorted(qtypes),
        exams=sorted(exams),
        topics=sorted(topics),
    )


@router.get("/{question_id}", response_model=QuestionFull)
def get_question(question_id: str, db: Session = Depends(get_db)) -> QuestionFull:
    q = db.get(Question, question_id) or db.scalar(
        select(Question).where(Question.question_id == question_id)
    )
    if q is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return QuestionFull.model_validate(q)
