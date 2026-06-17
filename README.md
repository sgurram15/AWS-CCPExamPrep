# AWS CCP Exam Prep

A zero-cost, self-hosted AWS **Certified Cloud Practitioner (CLF-C02)** exam-prep
platform: timed mock exams, untimed practice with full explanations,
domain-focused adaptive study, bookmarks, and progress tracking.

> **Architecture (current): a self-contained static frontend.**
> The app now runs **entirely in the browser** — no backend, no database, no
> auth server. The question bank is bundled as JSON at build time, and all
> per-user state (attempts, bookmarks, notes, progress) is stored in
> `localStorage`. This makes it a zero-cost static deploy (e.g. Vercel free
> tier). The FastAPI/SQLite backend under `backend/` is **retained as legacy**
> and is no longer required to run the app.

- **Frontend (the app):** Next.js 15 (App Router) + TypeScript + Tailwind v4 + TanStack Query
  - `lib/dataset.ts` — loads + normalizes + dedups the bundled question JSON (ports the old ingestion)
  - `lib/engine.ts` — question-set selection + grading + scaled scoring + tutor text
  - `lib/store.ts` — `localStorage`-backed attempts, bookmarks, notes, and derived progress
- **AI:** none. The "tutor" surfaces the explanations already authored in the dataset (deterministic, free).
- **Backend (legacy/optional):** FastAPI + SQLAlchemy 2.0 + SQLite — kept for reference; see "Legacy backend" below.

---

## Data sets

- **`aws_ccp_exam1_65_questions.json` — curated & study-ready.** 65 genuinely
  unique CLF-C02 questions with rich, per-option explanations. Each question
  carries `why_<letter>_wrong` rationales **only for the incorrect options**.
  This is the dataset the static app loads (`frontend/data/exam1.json`).
- **`aws_ccp_exam2_65_questions.json` / `aws_clf_c02_exam3_extended_coverage.json`
  — legacy, not yet rewritten.** Templated explanations and generation noise;
  **excluded** from the app until brought up to exam1's standard. To include
  one, add it to `frontend/data/` and import it in `lib/dataset.ts`.

---

## Project structure

```
CCP Exam prep/
├── aws_ccp_exam1_65_questions.json   # source dataset (curated) — copied into frontend/data/
├── aws_ccp_exam2_65_questions.json   # legacy, not used by the app
├── aws_clf_c02_exam3_extended_coverage.json  # legacy, not used by the app
├── frontend/                  # THE APP (static, client-side)
│   ├── data/
│   │   └── exam1.json         # bundled question bank (build-time import)
│   ├── app/                   # /, dashboard, questions, study, exam/[id], exam/[id]/review, bookmarks
│   ├── components/            # NavBar, QuestionCard, ExamTimer, Badge, RequireAuth (passthrough)
│   ├── lib/
│   │   ├── dataset.ts         # load + normalize + dedup the question JSON
│   │   ├── engine.ts          # selection (full/practice/domain/bookmark/review) + grading + scoring + tutor
│   │   ├── store.ts           # localStorage: attempts, bookmarks, notes, derived progress
│   │   ├── types.ts           # shared types
│   │   └── format.ts          # formatters
│   └── package.json
└── backend/                   # LEGACY (FastAPI + SQLite) — optional, not required
    └── app/ …                 # main, config, models, ingestion, selection, scoring, routers, tests
```

---

## Local setup

The app is just the frontend — **no backend, no database, no env vars needed.**

### Prerequisites
- Node.js 20+ (tested on 22)

### Run it

```bash
cd frontend
npm install
npm run dev
```

App: http://localhost:3000 — go straight to **Study** and start. Your progress
is saved in this browser (`localStorage`).

Build / type-check everything:

```bash
cd frontend
npm run build
```

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

## Deploy to Vercel (free tier)

The app is a self-contained Next.js frontend — no backend, no env vars.

1. Push this repo to GitHub.
2. In Vercel: **New Project → Import** the repo.
3. Set **Root Directory** to `frontend` (Vercel auto-detects Next.js; no env vars).
4. **Deploy.** That's it.

Local production preview: `cd frontend && npm run build && npm start`.

> Notes: All state is per-browser (`localStorage`) — there's no cross-device
> sync, which is expected for a single-user study tool. The `/exam/[id]` routes
> render on demand but do all their work client-side; the Vercel Hobby (free)
> tier covers this with no configuration.

## Legacy backend (optional, not required)

The FastAPI + SQLite backend under `backend/` predates the static rewrite and is
kept for reference. The frontend no longer talks to it. If you want to run it:

```bash
cd backend
python -m venv .venv && .venv\Scripts\Activate.ps1   # (or: source .venv/bin/activate)
pip install -r requirements.txt
python -m app.seed
uvicorn app.main:app --reload --port 8000
```

The optional generative AI tutor settings above also live in the legacy backend.
