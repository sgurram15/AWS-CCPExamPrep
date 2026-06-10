from __future__ import annotations

from app.database import SessionLocal
from app.ingestion import ingest


def _seed_questions(n=6):
    raw = []
    for i in range(n):
        raw.append(
            {
                "question_id": f"FLOW{i:03d}",
                "exam_id": 1,
                "question_number": i + 1,
                "domain": "Cloud Concepts" if i % 2 == 0 else "Security and Compliance",
                "difficulty": "easy",
                "question_type": "single_choice",
                "question_text": f"Flow question number {i} — pick the right one?",
                "option_a": f"Right-{i}",
                "option_b": f"Wrong-{i}-b",
                "option_c": f"Wrong-{i}-c",
                "option_d": f"Wrong-{i}-d",
                "correct_answer": "A",
                "correct_answers": ["A"],
                "explanation_correct": "Because A.",
                "why_a_wrong": "Correct.",
                "why_b_wrong": "No.",
                "why_c_wrong": "No.",
                "why_d_wrong": "No.",
                "topic_tags": [f"topic-{i}"],
                "source_reference": "CLF-C02",
            }
        )
    db = SessionLocal()
    try:
        # shuffle off so we know the correct letter is 'A' for deterministic asserts
        ingest(db, raw, shuffle=False)
    finally:
        db.close()


def test_full_exam_flow_scores_correctly(auth_client):
    _seed_questions()
    client = auth_client

    start = client.post("/attempts", json={"mode": "practice", "domain": "Cloud Concepts"})
    assert start.status_code == 201, start.text
    attempt = start.json()
    assert attempt["total_questions"] > 0

    # answer everything correctly (A), since shuffle was off during seeding
    saves = [
        {"question_id": q["question"]["id"], "selected_answers": ["A"], "flagged": False}
        for q in attempt["questions"]
    ]
    r = client.patch(f"/attempts/{attempt['id']}/answers", json={"answers": saves})
    assert r.status_code == 200

    submit = client.post(f"/attempts/{attempt['id']}/submit")
    assert submit.status_code == 200, submit.text
    result = submit.json()
    assert result["correct_count"] == result["total_questions"]
    assert result["score"] == 1000
    assert result["passed"] is True


def test_review_returns_explanations(auth_client):
    _seed_questions()
    client = auth_client
    attempt = client.post("/attempts", json={"mode": "practice", "domain": "Cloud Concepts"}).json()
    # answer all wrong (B)
    saves = [
        {"question_id": q["question"]["id"], "selected_answers": ["B"]} for q in attempt["questions"]
    ]
    client.patch(f"/attempts/{attempt['id']}/answers", json={"answers": saves})
    client.post(f"/attempts/{attempt['id']}/submit")

    review = client.get(f"/attempts/{attempt['id']}/review")
    assert review.status_code == 200
    body = review.json()
    assert body["correct_count"] == 0
    assert all(q["is_correct"] is False for q in body["questions"])
    assert all(q["question"]["explanation_correct"] for q in body["questions"])


def test_tutor_explain_is_grounded(auth_client):
    _seed_questions()
    client = auth_client
    q = client.get("/questions", params={"domain": "Cloud Concepts"}).json()["items"][0]
    r = client.post("/tutor", json={"mode": "explain", "question_id": q["id"]})
    assert r.status_code == 200
    body = r.json()
    assert body["grounded"] is True
    assert body["citations"]
