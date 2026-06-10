from __future__ import annotations

from app.ingestion import clean_question_text, normalize, shuffle_options, validate


def _raw(qid="T1", correct="A"):
    return {
        "question_id": qid,
        "exam_id": 1,
        "question_number": 1,
        "domain": "Cloud Concepts",
        "difficulty": "easy",
        "question_type": "single_choice",
        "question_text": "Which AWS service is object storage?",
        "option_a": "Amazon S3",
        "option_b": "Amazon EC2",
        "option_c": "AWS Lambda",
        "option_d": "Amazon RDS",
        "correct_answer": correct,
        "correct_answers": [correct],
        "explanation_correct": "S3 is object storage.",
        "why_a_wrong": "Correct answer.",
        "why_b_wrong": "EC2 is compute.",
        "why_c_wrong": "Lambda is compute.",
        "why_d_wrong": "RDS is relational db.",
        "topic_tags": ["Amazon S3", "object storage"],
        "source_reference": "CLF-C02",
    }


def test_normalize_maps_domain_variants():
    q = normalize({**_raw(), "domain": "Security & Compliance"})
    assert q["domain"] == "Security and Compliance"


def test_validate_requires_correct_answer():
    q = normalize({**_raw(), "correct_answer": "", "correct_answers": []})
    assert "no correct answer specified" in validate(q)


def test_validate_passes_clean_question():
    assert validate(normalize(_raw())) == []


def test_shuffle_preserves_correct_option_text():
    q = normalize(_raw(correct="A"))
    correct_text_before = q["option_a"]  # Amazon S3
    shuffled = shuffle_options(dict(q))
    new_letter = shuffled["correct_answers"][0]
    # the correct option's TEXT must still map to the (possibly new) correct letter
    assert shuffled[f"option_{new_letter.lower()}"] == correct_text_before


def test_clean_question_text_strips_generation_tags():
    assert (
        clean_question_text("Which service is object storage? (Scenario variation 41)")
        == "Which service is object storage?"
    )
    # the "(Exam N Scenario N)" variant
    assert (
        clean_question_text("Which pillar focuses on operations? (Exam 3 Scenario 50)")
        == "Which pillar focuses on operations?"
    )
    # case-insensitive + extra spacing
    assert clean_question_text("Pick one.  ( scenario  variation 7 )") == "Pick one."
    # leaves normal text (and unrelated parentheticals) untouched
    assert clean_question_text("No tag here.") == "No tag here."
    assert clean_question_text("Which service is best (EC2)?") == "Which service is best (EC2)?"


def test_normalize_cleans_question_text():
    q = normalize({**_raw(), "question_text": "What is S3? (Scenario variation 12)"})
    assert q["question_text"] == "What is S3?"


def test_shuffle_is_deterministic_per_question_id():
    a = shuffle_options(normalize(_raw(qid="SAME")))
    b = shuffle_options(normalize(_raw(qid="SAME")))
    assert a["correct_answers"] == b["correct_answers"]
    assert a["option_a"] == b["option_a"]
