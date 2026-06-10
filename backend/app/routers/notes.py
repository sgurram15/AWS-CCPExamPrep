from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..deps import get_current_user
from ..models import Note, Question, User
from ..schemas import NoteOut, NoteRequest

router = APIRouter(prefix="/notes", tags=["notes"])


@router.get("", response_model=list[NoteOut])
def list_notes(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Note]:
    return list(db.scalars(select(Note).where(Note.user_id == user.id)).all())


@router.put("", response_model=NoteOut)
def upsert_note(
    body: NoteRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> Note:
    if db.get(Question, body.question_id) is None:
        raise HTTPException(status_code=404, detail="Question not found")
    note = db.scalar(
        select(Note).where(Note.user_id == user.id, Note.question_id == body.question_id)
    )
    if note is None:
        note = Note(user_id=user.id, question_id=body.question_id, body=body.body)
        db.add(note)
    else:
        note.body = body.body
    db.commit()
    db.refresh(note)
    return note


@router.delete("/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    question_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)
):
    note = db.scalar(select(Note).where(Note.user_id == user.id, Note.question_id == question_id))
    if note:
        db.delete(note)
        db.commit()
