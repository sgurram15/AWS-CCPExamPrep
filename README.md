# AWS CCP Exam Prep

A zero-cost, self-hosted AWS **Certified Cloud Practitioner (CLF-C02)** exam-prep
platform: timed mock exams, untimed practice with full explanations,
domain-focused adaptive study, bookmarks, and progress tracking.

- **Backend:** FastAPI + SQLAlchemy 2.0 + **SQLite** (no Docker, no Postgres, no cloud)
- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind v4 + TanStack Query + Recharts
- **Auth:** lightweight local email/password (JWT)
- **AI:** none required. The "tutor" surfaces the explanations already stored in
  your dataset (deterministic, free). A generative tutor is left as an optional,
  pluggable layer behind an env flag.

> **Why no RAG / pgvector?** For a fixed bank of a few hundred short questions
> whose explanations are already authored, vector search + an LLM add cost and
> infrastructure for little benefit. The architecture migrates to
> Postgres + pgvector later by changing `DATABASE_URL` — application code is
> unchanged.

---

## ⚠️ Data quality note (read this)

The bundled `aws_ccp_exam1_65_questions.json` is **not study-ready**:

1. **Only 8 genuinely unique questions.** The file lists 65, but they are 8
   questions repeated ~8× with the options merely rearranged. The ingestion
   pipeline **deduplicates** them down to 8 (you don't want duplicates in an exam).
2. **The correct answer was always "A".** Ingestion **shuffles option order**
   (deterministically, seeded by `question_id`) and remaps the correct letters
   so the exam isn't trivially gameable.
3. **Explanations are templated** ("serves a different AWS purpose").

The app and pipeline are correct for *real* data — they just need real data.
Import a proper question bank via the admin ingest endpoint (JSON/CSV/XLSX) to
make this study-ready.

---

## Project structure

```
CCP Exam prep/
├── aws_ccp_exam1_65_questions.json   # bundled seed dataset
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI app + routers + CORS
│   │   ├── config.py          # env-overridable settings (safe local defaults)
│   │   ├── database.py        # SQLAlchemy engine/session (SQLite)
│   │   ├── models.py          # User, Exam, Question, ExamAttempt, Answer, Bookmark, Note
│   │   ├── schemas.py         # Pydantic request/response models
│   │   ├── ingestion.py       # parse → validate → normalize → shuffle → dedup → store
│   │   ├── selection.py       # builds question sets (full/practice/domain/bookmark/review)
│   │   ├── scoring.py         # CLF-C02 scaled scoring + domain analytics
│   │   ├── security.py        # password hashing + JWT
│   │   ├── seed.py            # loads the bundled dataset
│   │   └── routers/           # auth, questions, exams, attempts, bookmarks, notes, progress, admin, tutor
│   ├── tests/                 # pytest: ingestion + full exam flow
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── app/                   # /, login, register, dashboard, questions, study, exam/[id], exam/[id]/review, bookmarks
    ├── components/            # NavBar, AuthForm, QuestionCard, ExamTimer, Badge, RequireAuth
    ├── lib/                   # api client, auth context, types, formatters
    └── package.json
```

---

## Local setup

### Prerequisites
- Python 3.11+
- Node.js 20+ (tested on 22)

### 1. Backend

```bash
cd backend
python -m venv .venv
# Windows PowerShell:  .venv\Scripts\Activate.ps1
# macOS/Linux:         source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env          # optional; defaults work out of the box
python -m app.seed            # creates ccp_prep.db and loads the dataset
uvicorn app.main:app --reload --port 8000
```

API docs (Swagger): http://localhost:8000/docs
Health check: http://localhost:8000/health

### 2. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local   # sets NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

App: http://localhost:3000 — register an account and start studying.

---

## Importing your own questions

Use the admin endpoint (any authenticated user in this build):

```bash
curl -X POST http://localhost:8000/admin/ingest \
  -H "Authorization: Bearer <token>" \
  -F "file=@my_questions.json"
```

Accepts `.json`, `.csv`, `.xlsx`. Each record uses this schema:

| field | notes |
|---|---|
| `question_id` | unique; used for upsert + deterministic shuffle seed |
| `exam_id`, `question_number` | integers |
| `domain` | mapped to the 4 CLF-C02 domains (variants normalized) |
| `difficulty` | easy / medium / hard |
| `question_type` | `single_choice` or `multi_select` |
| `question_text`, `option_a..d` | required |
| `correct_answer` / `correct_answers` | letter or list of letters (A–D) |
| `explanation_correct`, `why_a..d_wrong` | shown in practice/review |
| `topic_tags` | list or comma-separated string |
| `source_reference` | e.g. "CLF-C02" |

Pipeline: **validate → normalize → option-shuffle → dedup → upsert**. Re-running
is safe (upsert by `question_id`). Disable shuffling per-import with
`?shuffle=false`.

---

## Exam scoring

Raw accuracy is mapped to the AWS scaled band:

```
scaled = round(100 + accuracy * 900)     # 0% → 100, 100% → 1000
passed = scaled >= 700                    # ~66.7% correct
```

Multi-select questions require an **exact** set match (all and only the correct letters).

---

## Tests

```bash
cd backend
pytest -q          # ingestion (shuffle/dedup/validation) + full exam flow + tutor
```

```bash
cd frontend
npm run build      # type-checks + compiles all routes
```

---

## Enabling the optional generative AI tutor (costs an API key)

The `explain` and `why_wrong` tutor modes work with **no AI** (served from your
dataset). The generative modes (`teach_topic`, `generate_similar`,
`weak_area_coaching`) are stubbed off by default. To enable:

```ini
# backend/.env
AI_TUTOR_ENABLED=true
AI_PROVIDER=anthropic        # or openai
AI_API_KEY=sk-...
AI_MODEL=claude-haiku-4-5-20251001
```

Then wire the provider call in `backend/app/routers/tutor.py` (marked with a
`501` placeholder). Keep responses grounded in the stored questions and cite
`question_id`s.

---

## Deployment notes

- **Frontend** → Vercel (set `NEXT_PUBLIC_API_URL` to your API URL).
- **Backend** → any host that runs Python (Fly.io, Render, a VM). For multi-user
  production, switch `DATABASE_URL` to Postgres and replace `init_db()` with
  Alembic migrations.
- Set a strong `JWT_SECRET` in production.
