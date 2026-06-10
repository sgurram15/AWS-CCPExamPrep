from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Bookmark, Question, User
from ..schemas import BookmarkRequest, QuestionPublic

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])


@router.get("", response_model=list[QuestionPublic])
def list_bookmarks(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Question]:
    q_ids = [b.question_id for b in db.scalars(select(Bookmark).where(Bookmark.user_id == user.id)).all()]
    if not q_ids:
        return []
    return list(db.scalars(select(Question).where(Question.id.in_(q_ids))).all())


@router.post("", status_code=status.HTTP_201_CREATED)
def add_bookmark(
    body: BookmarkRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    if db.get(Question, body.question_id) is None:
        raise HTTPException(status_code=404, detail="Question not found")
    existing = db.scalar(
        select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.question_id == body.question_id)
    )
    if existing is None:
        db.add(Bookmark(user_id=user.id, question_id=body.question_id))
        db.commit()
    return {"ok": True, "question_id": body.question_id}


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_bookmark(
    question_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    existing = db.scalar(
        select(Bookmark).where(Bookmark.user_id == user.id, Bookmark.question_id == question_id)
    )
    if existing:
        db.delete(existing)
        db.commit()
