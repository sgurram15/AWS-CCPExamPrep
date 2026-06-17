// Client-side persistence (localStorage). Replaces the FastAPI backend + DB:
// attempts, bookmarks, notes and derived progress all live in the browser.
import { ALL_QUESTIONS, EXAMS, getQuestion } from "./dataset";
import { AttemptConfig, GradeResult, gradeAnswers, isCorrect, selectQuestions } from "./engine";
import type {
  Attempt,
  AttemptHistoryItem,
  AttemptReview,
  Dashboard,
  DomainStat,
  QuestionFull,
  QuestionList,
  ReviewQuestion,
} from "./types";

const K_ATTEMPTS = "ccp.attempts";
const K_BOOKMARKS = "ccp.bookmarks";
const K_NOTES = "ccp.notes";

const browser = () => typeof window !== "undefined";

function read<T>(key: string, fallback: T): T {
  if (!browser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  if (!browser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function uid(): string {
  if (browser() && "randomUUID" in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ---- stored shapes ---------------------------------------------------------
interface StoredAnswer {
  selected: string[];
  flagged: boolean;
}

interface StoredAttempt {
  id: string;
  mode: AttemptConfig["mode"];
  exam_id: number | null;
  config: AttemptConfig;
  status: "in_progress" | "submitted";
  time_limit_seconds: number | null;
  started_at: string;
  submitted_at: string | null;
  time_taken_seconds: number | null;
  question_ids: string[];
  answers: Record<string, StoredAnswer>;
  // filled on submit
  total_questions: number;
  correct_count: number;
  score: number | null;
  percent: number | null;
  passed: boolean | null;
}

function loadAttempts(): StoredAttempt[] {
  return read<StoredAttempt[]>(K_ATTEMPTS, []);
}
function saveAttempts(list: StoredAttempt[]): void {
  write(K_ATTEMPTS, list);
}
function getStored(id: string): StoredAttempt | undefined {
  return loadAttempts().find((a) => a.id === id);
}
function upsert(att: StoredAttempt): void {
  const list = loadAttempts();
  const i = list.findIndex((a) => a.id === att.id);
  if (i >= 0) list[i] = att;
  else list.unshift(att);
  saveAttempts(list);
}

// ---- bookmarks -------------------------------------------------------------
export function getBookmarkIds(): string[] {
  return read<string[]>(K_BOOKMARKS, []);
}
export function isBookmarked(id: string): boolean {
  return getBookmarkIds().includes(id);
}
export function toggleBookmark(id: string): boolean {
  const set = new Set(getBookmarkIds());
  let marked: boolean;
  if (set.has(id)) {
    set.delete(id);
    marked = false;
  } else {
    set.add(id);
    marked = true;
  }
  write(K_BOOKMARKS, [...set]);
  return marked;
}
export function listBookmarkedQuestions(): QuestionFull[] {
  const set = new Set(getBookmarkIds());
  return ALL_QUESTIONS.filter((q) => set.has(q.id));
}

// ---- notes -----------------------------------------------------------------
export function getNote(id: string): string {
  return read<Record<string, string>>(K_NOTES, {})[id] ?? "";
}
export function setNote(id: string, body: string): void {
  const notes = read<Record<string, string>>(K_NOTES, {});
  notes[id] = body;
  write(K_NOTES, notes);
}

// ---- topic accuracy (for adaptive domain mode) -----------------------------
function topicAccuracy(): Record<string, number> {
  const agg: Record<string, { c: number; n: number }> = {};
  for (const att of loadAttempts()) {
    if (att.status !== "submitted") continue;
    for (const qid of att.question_ids) {
      const q = getQuestion(qid);
      if (!q) continue;
      const ans = att.answers[qid];
      if (!ans || !ans.selected.length) continue;
      const ok = isCorrect(q, ans.selected);
      for (const tag of q.topic_tags) {
        const a = (agg[tag] ||= { c: 0, n: 0 });
        a.n++;
        if (ok) a.c++;
      }
    }
  }
  const out: Record<string, number> = {};
  for (const [t, v] of Object.entries(agg)) out[t] = v.n ? v.c / v.n : 0;
  return out;
}

// ---- attempt lifecycle -----------------------------------------------------
export function createAttempt(cfg: AttemptConfig): StoredAttempt {
  const reviewWrongIds: string[] = [];
  if (cfg.mode === "review" && cfg.review_attempt_id) {
    const src = getStored(cfg.review_attempt_id);
    if (src) {
      for (const qid of src.question_ids) {
        const q = getQuestion(qid);
        const ans = src.answers[qid];
        if (q && (!ans || !isCorrect(q, ans.selected))) reviewWrongIds.push(qid);
      }
    }
  }

  const questions = selectQuestions(cfg, {
    bookmarkIds: getBookmarkIds(),
    reviewWrongIds,
    topicAccuracy: topicAccuracy(),
  });

  const exam = cfg.exam_id != null ? EXAMS.find((e) => e.id === cfg.exam_id) : undefined;
  const att: StoredAttempt = {
    id: uid(),
    mode: cfg.mode,
    exam_id: cfg.exam_id ?? null,
    config: cfg,
    status: "in_progress",
    time_limit_seconds: cfg.mode === "full_exam" && exam ? exam.time_limit_minutes * 60 : null,
    started_at: new Date().toISOString(),
    submitted_at: null,
    time_taken_seconds: null,
    question_ids: questions.map((q) => q.id),
    answers: {},
    total_questions: questions.length,
    correct_count: 0,
    score: null,
    percent: null,
    passed: null,
  };
  upsert(att);
  return att;
}

function hydrate(att: StoredAttempt): Attempt {
  return {
    id: att.id,
    mode: att.mode,
    exam_id: att.exam_id,
    status: att.status,
    time_limit_seconds: att.time_limit_seconds,
    started_at: att.started_at,
    submitted_at: att.submitted_at,
    total_questions: att.total_questions,
    questions: att.question_ids
      .map((qid, position) => {
        const question = getQuestion(qid);
        if (!question) return null;
        const ans = att.answers[qid];
        return {
          position,
          question,
          selected_answers: ans?.selected ?? [],
          flagged: ans?.flagged ?? false,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  };
}

export function getAttempt(id: string): Attempt | undefined {
  const att = getStored(id);
  return att ? hydrate(att) : undefined;
}

export function saveAnswers(
  id: string,
  answers: Record<string, { selected: string[]; flagged: boolean }>
): void {
  const att = getStored(id);
  if (!att || att.status === "submitted") return;
  att.answers = answers;
  upsert(att);
}

export function gradeQuestion(id: string, qid: string): ReviewQuestion | undefined {
  const att = getStored(id);
  const question = getQuestion(qid);
  if (!att || !question) return undefined;
  const ans = att.answers[qid];
  const selected = ans?.selected ?? [];
  const position = att.question_ids.indexOf(qid);
  return {
    position,
    question,
    selected_answers: selected,
    is_correct: isCorrect(question, selected),
    flagged: ans?.flagged ?? false,
    time_spent_seconds: 0,
  };
}

export function submitAttempt(id: string): GradeResult | undefined {
  const att = getStored(id);
  if (!att) return undefined;
  const items = att.question_ids
    .map((qid) => {
      const question = getQuestion(qid);
      return question ? { question, selected: att.answers[qid]?.selected ?? [] } : null;
    })
    .filter((x): x is { question: QuestionFull; selected: string[] } => x !== null);
  const result = gradeAnswers(items);
  att.status = "submitted";
  att.submitted_at = new Date().toISOString();
  att.time_taken_seconds = Math.max(
    0,
    Math.floor((Date.parse(att.submitted_at) - Date.parse(att.started_at)) / 1000)
  );
  att.total_questions = result.total_questions;
  att.correct_count = result.correct_count;
  att.score = result.score;
  att.percent = result.percent;
  att.passed = result.passed;
  upsert(att);
  return result;
}

export function getReview(id: string, incorrectOnly = false): AttemptReview | undefined {
  const att = getStored(id);
  if (!att) return undefined;
  const items = att.question_ids
    .map((qid) => {
      const question = getQuestion(qid);
      return question ? { question, selected: att.answers[qid]?.selected ?? [] } : null;
    })
    .filter((x): x is { question: QuestionFull; selected: string[] } => x !== null);
  const grade = gradeAnswers(items);

  let questions: ReviewQuestion[] = att.question_ids
    .map((qid, position) => {
      const question = getQuestion(qid);
      if (!question) return null;
      const ans = att.answers[qid];
      const selected = ans?.selected ?? [];
      return {
        position,
        question,
        selected_answers: selected,
        is_correct: isCorrect(question, selected),
        flagged: ans?.flagged ?? false,
        time_spent_seconds: 0,
      };
    })
    .filter((x): x is ReviewQuestion => x !== null);
  if (incorrectOnly) questions = questions.filter((q) => !q.is_correct);

  return {
    id: att.id,
    mode: att.mode,
    exam_id: att.exam_id,
    status: att.status,
    score: att.score,
    percent: att.percent,
    passed: att.passed,
    total_questions: att.total_questions,
    correct_count: att.correct_count,
    time_taken_seconds: att.time_taken_seconds,
    submitted_at: att.submitted_at,
    domain_breakdown: grade.domain_breakdown,
    questions,
  };
}

export function listHistory(): AttemptHistoryItem[] {
  return loadAttempts()
    .map((a) => ({
      id: a.id,
      mode: a.mode,
      exam_id: a.exam_id,
      config: { domain: a.config.domain ?? null, difficulty: a.config.difficulty ?? null },
      status: a.status,
      score: a.score,
      percent: a.percent,
      passed: a.passed,
      total_questions: a.total_questions,
      correct_count: a.correct_count,
      time_taken_seconds: a.time_taken_seconds,
      started_at: a.started_at,
      submitted_at: a.submitted_at,
    }))
    .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at));
}

// ---- dashboard -------------------------------------------------------------
function studyStreakDays(dates: string[]): number {
  const days = new Set(dates.map((d) => new Date(d).toISOString().slice(0, 10)));
  let streak = 0;
  const cursor = new Date();
  // allow streak to count today or yesterday as the latest active day
  if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function getDashboard(): Dashboard {
  const submitted = loadAttempts().filter((a) => a.status === "submitted");

  const answeredQids: string[] = [];
  const domainAgg: Record<string, { answered: number; correct: number }> = {};
  for (const att of submitted) {
    for (const qid of att.question_ids) {
      const q = getQuestion(qid);
      const ans = att.answers[qid];
      if (!q || !ans || !ans.selected.length) continue;
      answeredQids.push(qid);
      const d = (domainAgg[q.domain] ||= { answered: 0, correct: 0 });
      d.answered++;
      if (isCorrect(q, ans.selected)) d.correct++;
    }
  }

  const scores = submitted.map((a) => a.score).filter((s): s is number => s != null);
  const domain_stats: DomainStat[] = Object.entries(domainAgg).map(([domain, v]) => ({
    domain,
    answered: v.answered,
    correct: v.correct,
    accuracy: v.answered ? Math.round((v.correct / v.answered) * 10000) / 10000 : 0,
  }));

  return {
    questions_answered: answeredQids.length,
    distinct_questions_seen: new Set(answeredQids).size,
    average_score: scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null,
    best_score: scores.length ? Math.max(...scores) : null,
    exams_taken: submitted.length,
    exams_passed: submitted.filter((a) => a.passed).length,
    study_streak_days: studyStreakDays(submitted.map((a) => a.submitted_at || a.started_at)),
    domain_stats,
    weak_domains: domain_stats.filter((d) => d.answered >= 1 && d.accuracy < 0.7).map((d) => d.domain),
  };
}

// ---- question bank (filter + paginate) -------------------------------------
export function queryQuestions(params: {
  domain?: string;
  difficulty?: string;
  exam_id?: string;
  q?: string;
  page?: number;
  size?: number;
}): QuestionList {
  const page = params.page ?? 1;
  const size = params.size ?? 10;
  const search = (params.q ?? "").trim().toLowerCase();

  let items = ALL_QUESTIONS.filter((qq) => {
    if (params.domain && qq.domain !== params.domain) return false;
    if (params.difficulty && qq.difficulty !== params.difficulty) return false;
    if (params.exam_id && String(qq.exam_id) !== params.exam_id) return false;
    if (search) {
      const hay = (qq.question_text + " " + qq.topic_tags.join(" ")).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  const total = items.length;
  const start = (page - 1) * size;
  return { items: items.slice(start, start + size), total, page, size };
}
