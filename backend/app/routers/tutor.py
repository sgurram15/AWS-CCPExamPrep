from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..deps import get_current_user
from ..models import Question, User
from ..schemas import TutorRequest, TutorResponse

router = APIRouter(prefix="/tutor", tags=["tutor"])

# Modes that need a generative LLM. Everything else is served directly from the
# stored dataset (zero cost, no hallucination risk).
_GENERATIVE_MODES = {"teach_topic", "generate_similar", "weak_area_coaching"}


def _question(db: Session, question_id: str | None) -> Question:
    if not question_id:
        raise HTTPException(status_code=400, detail="question_id is required for this mode")
    q = db.get(Question, question_id) or db.scalar(
        select(Question).where(Question.question_id == question_id)
    )
    if q is None:
        raise HTTPException(status_code=404, detail="Question not found")
    return q


@router.post("", response_model=TutorResponse)
def tutor(
    body: TutorRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> TutorResponse:
    if body.mode == "explain":
        q = _question(db, body.question_id)
        correct = ", ".join(q.correct_answers)
        lines = [
            f"**Correct answer: {correct}**",
            "",
            q.explanation_correct or "(No explanation provided in the dataset.)",
            "",
            "Why the other options are wrong:",
        ]
        for letter in ("A", "B", "C", "D"):
            if letter in q.correct_answers:
                continue
            why = q.why_wrong_for(letter)
            if why:
                lines.append(f"- **{letter}.** {why}")
        return TutorResponse(
            mode=body.mode,
            grounded=True,
            content="\n".join(lines),
            citations=[q.question_id],
        )

    if body.mode == "why_wrong":
        q = _question(db, body.question_id)
        letter = (body.selected_answer or "").upper()
        if letter not in {"A", "B", "C", "D"}:
            raise HTTPException(status_code=400, detail="selected_answer must be A, B, C, or D")
        if letter in q.correct_answers:
            content = f"Option {letter} is actually **correct**. {q.explanation_correct}"
        else:
            content = q.why_wrong_for(letter) or "No rationale stored for this option."
        return TutorResponse(mode=body.mode, grounded=True, content=content, citations=[q.question_id])

    if body.mode in _GENERATIVE_MODES:
        if not settings.ai_tutor_enabled:
            return TutorResponse(
                mode=body.mode,
                grounded=False,
                enabled=False,
                content=(
                    "The generative AI tutor is disabled in this build (zero-cost mode). "
                    "Enable it by setting AI_TUTOR_ENABLED=true and providing AI_PROVIDER + "
                    "AI_API_KEY in backend/.env. The 'explain' and 'why_wrong' modes work "
                    "without any provider."
                ),
            )
        # Pluggable hook: wire an Anthropic/OpenAI call here when enabled.
        raise HTTPException(status_code=501, detail="Generative tutor provider not yet wired")

    raise HTTPException(status_code=400, detail=f"Unknown tutor mode: {body.mode}")
