from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Exam
from ..schemas import ExamOut

router = APIRouter(prefix="/exams", tags=["exams"])


@router.get("", response_model=list[ExamOut])
def list_exams(db: Session = Depends(get_db)) -> list[Exam]:
    return list(db.scalars(select(Exam).order_by(Exam.id)).all())
