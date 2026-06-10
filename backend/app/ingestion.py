"""Dataset ingestion: parse -> validate -> normalize -> shuffle -> dedup -> store.

Supports JSON / CSV / XLSX. Used by both the admin upload endpoint and the
seed script. Designed to be safe to re-run (idempotent on question_id).

Why the option shuffle: the provided dataset has the correct answer in slot
"A" for every question, which makes an exam trivially gameable. We shuffle the
four options deterministically (seeded by question_id, so re-ingesting is
stable) and remap the correct answer letter(s).
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import random
import re
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import Exam, Question
from .schemas import IngestReport

LETTERS = ["A", "B", "C", "D"]

# Some generators leave a generation tag in the visible question text, e.g.
# "(Scenario variation 41)" or "(Exam 3 Scenario 50)". Strip any trailing
# parenthetical that contains "scenario" or "variation" (case-insensitive).
_QUESTION_TEXT_NOISE = re.compile(
    r"\s*\([^()]*\b(?:scenario|variation)\b[^()]*\)\s*$", re.IGNORECASE
)


def clean_question_text(text: str) -> str:
    cleaned = _QUESTION_TEXT_NOISE.sub("", text)
    return cleaned.strip()

# Canonical CLF-C02 domains and the variants we map onto them.
_DOMAIN_CANON = {
    "cloud concepts": "Cloud Concepts",
    "security and compliance": "Security and Compliance",
    "security & compliance": "Security and Compliance",
    "cloud technology and services": "Cloud Technology and Services",
    "cloud technology & services": "Cloud Technology and Services",
    "technology": "Cloud Technology and Services",
    "billing, pricing, and support": "Billing, Pricing, and Support",
    "billing pricing and support": "Billing, Pricing, and Support",
    "billing and pricing": "Billing, Pricing, and Support",
}

_DIFFICULTY_CANON = {"easy": "easy", "medium": "medium", "hard": "hard"}

_TYPE_CANON = {
    "single_choice": "single_choice",
    "single": "single_choice",
    "multiple_choice": "single_choice",
    "mcq": "single_choice",
    "multi_select": "multi_select",
    "multiple_select": "multi_select",
    "multi": "multi_select",
}

REQUIRED_FIELDS = ["question_text", "option_a", "option_b", "option_c", "option_d"]


# --------------------------- file parsing -----------------------------------
def parse_file(filename: str, content: bytes) -> list[dict[str, Any]]:
    name = filename.lower()
    if name.endswith(".json"):
        return _parse_json(content)
    if name.endswith(".csv"):
        return _parse_csv(content)
    if name.endswith(".xlsx"):
        return _parse_xlsx(content)
    raise ValueError(f"Unsupported file type: {filename}. Use .json, .csv, or .xlsx")


def _parse_json(content: bytes) -> list[dict[str, Any]]:
    data = json.loads(content.decode("utf-8"))
    if isinstance(data, dict):
        # Either {"questions": [...]} or a single question.
        if "questions" in data:
            return list(data["questions"])
        return [data]
    if isinstance(data, list):
        return data
    raise ValueError("Unrecognised JSON structure")


def _parse_csv(content: bytes) -> list[dict[str, Any]]:
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    return [dict(row) for row in reader]


def _parse_xlsx(content: bytes) -> list[dict[str, Any]]:
    from openpyxl import load_workbook

    wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    if not rows:
        return []
    headers = [str(h).strip() if h is not None else "" for h in rows[0]]
    out: list[dict[str, Any]] = []
    for row in rows[1:]:
        out.append({headers[i]: row[i] for i in range(len(headers)) if i < len(row)})
    return out


# --------------------------- normalization ----------------------------------
def _as_list(value: Any) -> list[str]:
    """Coerce correct_answers / topic_tags from JSON list, CSV string, etc."""
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    s = str(value).strip()
    if s.startswith("[") and s.endswith("]"):
        try:
            return [str(v).strip() for v in json.loads(s)]
        except json.JSONDecodeError:
            pass
    # comma / pipe / semicolon separated
    for sep in (",", "|", ";"):
        if sep in s:
            return [p.strip() for p in s.split(sep) if p.strip()]
    return [s]


def normalize(raw: dict[str, Any]) -> dict[str, Any]:
    def g(key: str, default: str = "") -> str:
        v = raw.get(key, default)
        return "" if v is None else str(v).strip()

    domain = _DOMAIN_CANON.get(g("domain").lower(), g("domain") or "Cloud Concepts")
    difficulty = _DIFFICULTY_CANON.get(g("difficulty").lower(), g("difficulty").lower() or "medium")
    qtype = _TYPE_CANON.get(g("question_type").lower(), "single_choice")

    correct_answers = [a.upper() for a in _as_list(raw.get("correct_answers"))]
    single = g("correct_answer").upper()
    if not correct_answers and single:
        correct_answers = [single]
    if not single and correct_answers:
        single = correct_answers[0]

    if qtype == "single_choice":
        correct_answers = correct_answers[:1]

    try:
        exam_id = int(raw["exam_id"]) if raw.get("exam_id") not in (None, "") else None
    except (ValueError, TypeError):
        exam_id = None
    try:
        qnum = int(raw["question_number"]) if raw.get("question_number") not in (None, "") else 0
    except (ValueError, TypeError):
        qnum = 0

    return {
        "question_id": g("question_id"),
        "exam_id": exam_id,
        "question_number": qnum,
        "domain": domain,
        "difficulty": difficulty,
        "question_type": qtype,
        "question_text": clean_question_text(g("question_text")),
        "option_a": g("option_a"),
        "option_b": g("option_b"),
        "option_c": g("option_c"),
        "option_d": g("option_d"),
        "correct_answer": single,
        "correct_answers": correct_answers,
        "explanation_correct": g("explanation_correct"),
        "why_a_wrong": g("why_a_wrong"),
        "why_b_wrong": g("why_b_wrong"),
        "why_c_wrong": g("why_c_wrong"),
        "why_d_wrong": g("why_d_wrong"),
        "topic_tags": _as_list(raw.get("topic_tags")),
        "source_reference": g("source_reference") or g("source_domain"),
    }


def validate(q: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    for field in REQUIRED_FIELDS:
        if not q.get(field):
            errors.append(f"missing {field}")
    valid_letters = set(LETTERS)
    if not q["correct_answers"]:
        errors.append("no correct answer specified")
    if any(a not in valid_letters for a in q["correct_answers"]):
        errors.append(f"correct answer not in A-D: {q['correct_answers']}")
    if q["question_type"] == "single_choice" and len(q["correct_answers"]) != 1:
        errors.append("single_choice must have exactly one correct answer")
    return errors


def _content_hash(q: dict[str, Any]) -> str:
    payload = "|".join(
        [
            q["question_text"].lower().strip(),
            *sorted(o.lower().strip() for o in (q["option_a"], q["option_b"], q["option_c"], q["option_d"])),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def shuffle_options(q: dict[str, Any]) -> dict[str, Any]:
    """Deterministically reorder options and remap the correct letters."""
    rng = random.Random(q.get("question_id") or _content_hash(q))
    texts = {L: q[f"option_{L.lower()}"] for L in LETTERS}
    whys = {L: q[f"why_{L.lower()}_wrong"] for L in LETTERS}

    order = LETTERS[:]
    rng.shuffle(order)  # order[i] = old letter now sitting in slot LETTERS[i]

    old_to_new = {old: LETTERS[i] for i, old in enumerate(order)}

    for i, old in enumerate(order):
        new = LETTERS[i]
        q[f"option_{new.lower()}"] = texts[old]
        q[f"why_{new.lower()}_wrong"] = whys[old]

    q["correct_answers"] = sorted(old_to_new[a] for a in q["correct_answers"])
    q["correct_answer"] = q["correct_answers"][0] if q["correct_answers"] else ""
    return q


# ------------------------------- store ---------------------------------------
def ingest(
    db: Session,
    raw_questions: list[dict[str, Any]],
    *,
    shuffle: bool = True,
) -> IngestReport:
    received = len(raw_questions)
    inserted = updated = duplicates = skipped = 0
    errors: list[str] = []
    seen_hashes: set[str] = set()

    for idx, raw in enumerate(raw_questions):
        try:
            q = normalize(raw)
        except Exception as exc:  # noqa: BLE001 - report and continue
            errors.append(f"row {idx}: normalize failed ({exc})")
            skipped += 1
            continue

        verrs = validate(q)
        if verrs:
            errors.append(f"row {idx} ({q.get('question_id') or 'no-id'}): {', '.join(verrs)}")
            skipped += 1
            continue

        if shuffle:
            q = shuffle_options(q)

        q["content_hash"] = _content_hash(q)

        # in-batch duplicate (same content) detection
        if q["content_hash"] in seen_hashes:
            duplicates += 1
            continue
        seen_hashes.add(q["content_hash"])

        # ensure the parent Exam row exists
        if q["exam_id"] is not None:
            _ensure_exam(db, q["exam_id"])

        existing = None
        if q["question_id"]:
            existing = db.scalar(select(Question).where(Question.question_id == q["question_id"]))
        if existing is None:
            existing = db.scalar(select(Question).where(Question.content_hash == q["content_hash"]))

        if existing is None:
            db.add(Question(**q))
            inserted += 1
        else:
            for k, v in q.items():
                setattr(existing, k, v)
            updated += 1

    db.flush()
    _recount_exams(db)
    db.commit()

    return IngestReport(
        received=received,
        inserted=inserted,
        updated=updated,
        duplicates=duplicates,
        skipped=skipped,
        errors=errors,
    )


def _ensure_exam(db: Session, exam_id: int) -> Exam:
    exam = db.get(Exam, exam_id)
    if exam is None:
        from .config import settings

        exam = Exam(
            id=exam_id,
            name=f"Practice Exam {exam_id}",
            description="AWS Certified Cloud Practitioner (CLF-C02) mock exam.",
            time_limit_minutes=settings.exam_time_limit_minutes,
            passing_score=settings.passing_score,
        )
        db.add(exam)
        db.flush()
    return exam


def _recount_exams(db: Session) -> None:
    for exam in db.scalars(select(Exam)).all():
        exam.question_count = db.query(Question).filter(Question.exam_id == exam.id).count()
