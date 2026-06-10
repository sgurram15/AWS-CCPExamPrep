"""Exam grading + analytics.

AWS CLF-C02 reports a scaled score from 100 to 1000 with a passing line of
700. We map raw accuracy linearly onto that band:

    scaled = round(100 + accuracy * 900)

so 0% -> 100, 100% -> 1000, and the 700 pass line falls at ~66.7% correct.
"""
from __future__ import annotations

from collections import defaultdict

from .config import settings
from .models import Answer, Question


def is_answer_correct(question: Question, selected: list[str]) -> bool:
    """Exact-set match. Multi-select requires all-and-only the correct letters."""
    if not selected:
        return False
    return sorted({s.upper() for s in selected}) == sorted({c.upper() for c in question.correct_answers})


def scaled_score(accuracy: float) -> int:
    return round(100 + accuracy * 900)


def grade_attempt(answers: list[Answer]) -> dict:
    """Grade every answer in place and return aggregate stats + domain breakdown."""
    total = len(answers)
    correct = 0
    domain_agg: dict[str, dict[str, int]] = defaultdict(lambda: {"answered": 0, "correct": 0})

    for ans in answers:
        q = ans.question
        ok = is_answer_correct(q, ans.selected_answers or [])
        ans.is_correct = ok
        correct += int(ok)
        domain_agg[q.domain]["answered"] += 1
        domain_agg[q.domain]["correct"] += int(ok)

    accuracy = (correct / total) if total else 0.0
    score = scaled_score(accuracy)

    breakdown = {
        d: {
            "answered": v["answered"],
            "correct": v["correct"],
            "accuracy": round(v["correct"] / v["answered"], 4) if v["answered"] else 0.0,
        }
        for d, v in domain_agg.items()
    }

    return {
        "total_questions": total,
        "correct_count": correct,
        "percent": round(accuracy * 100, 2),
        "score": score,
        "passed": score >= settings.passing_score,
        "domain_breakdown": breakdown,
    }
