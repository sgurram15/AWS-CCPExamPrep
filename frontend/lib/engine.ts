// Question-set selection + grading + tutor text. Ports the backend's
// selection.py / scoring.py / tutor.py into the browser. Pure functions:
// per-user data (bookmarks, history) is passed in via `ctx` by the store.
import { ALL_QUESTIONS, PASSING } from "./dataset";
import type { DomainBreakdown, QuestionFull } from "./types";

const LETTERS = ["A", "B", "C", "D"] as const;

export interface AttemptConfig {
  mode: "full_exam" | "practice" | "domain" | "bookmark" | "review";
  exam_id?: number | null;
  domain?: string | null;
  difficulty?: string | null;
  num_questions?: number | null;
  bookmarked_only?: boolean;
  review_attempt_id?: string | null;
}

export interface SelectContext {
  bookmarkIds: string[];
  reviewWrongIds: string[];
  topicAccuracy: Record<string, number>; // topic tag -> 0..1
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function limit(qs: QuestionFull[], n: number | null | undefined): QuestionFull[] {
  if (!n || n <= 0) return qs;
  return qs.slice(0, n);
}

// Weakest (and unseen) topics first, with light jitter — mirrors selection.py.
function adaptiveOrder(pool: QuestionFull[], topicAcc: Record<string, number>): QuestionFull[] {
  const weakness = (q: QuestionFull): number => {
    const accs = q.topic_tags.map((t) => topicAcc[t]).filter((v) => v != null);
    const base = accs.length ? accs.reduce((s, v) => s + v, 0) / accs.length : 0.5;
    return 1 - base + Math.random() * 0.15;
  };
  return [...pool].sort((a, b) => weakness(b) - weakness(a));
}

export function selectQuestions(cfg: AttemptConfig, ctx: SelectContext): QuestionFull[] {
  if (cfg.mode === "bookmark" || cfg.bookmarked_only) {
    const set = new Set(ctx.bookmarkIds);
    const qs = ALL_QUESTIONS.filter((q) => set.has(q.id));
    return limit(shuffle(qs), cfg.num_questions);
  }

  if (cfg.mode === "review") {
    const set = new Set(ctx.reviewWrongIds);
    return ALL_QUESTIONS.filter((q) => set.has(q.id));
  }

  if (cfg.mode === "full_exam") {
    const qs =
      cfg.exam_id != null
        ? ALL_QUESTIONS.filter((q) => q.exam_id === cfg.exam_id).sort(
            (a, b) => a.question_number - b.question_number
          )
        : shuffle(ALL_QUESTIONS);
    return limit(qs, cfg.num_questions ?? qs.length);
  }

  if (cfg.mode === "domain") {
    let pool = ALL_QUESTIONS.filter((q) => !cfg.domain || q.domain === cfg.domain);
    if (cfg.difficulty) pool = pool.filter((q) => q.difficulty === cfg.difficulty);
    return limit(adaptiveOrder(pool, ctx.topicAccuracy), cfg.num_questions ?? 20);
  }

  // practice
  let pool = ALL_QUESTIONS;
  if (cfg.exam_id != null) pool = pool.filter((q) => q.exam_id === cfg.exam_id);
  if (cfg.domain) pool = pool.filter((q) => q.domain === cfg.domain);
  if (cfg.difficulty) pool = pool.filter((q) => q.difficulty === cfg.difficulty);
  return limit(shuffle(pool), cfg.num_questions ?? 20);
}

// ---- grading ---------------------------------------------------------------
export function isCorrect(q: QuestionFull, selected: string[]): boolean {
  if (!selected.length) return false;
  const a = [...new Set(selected.map((s) => s.toUpperCase()))].sort();
  const b = [...new Set(q.correct_answers.map((s) => s.toUpperCase()))].sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function scaledScore(accuracy: number): number {
  return Math.round(100 + accuracy * 900);
}

export interface GradeResult {
  total_questions: number;
  correct_count: number;
  percent: number;
  score: number;
  passed: boolean;
  domain_breakdown: DomainBreakdown;
}

export function gradeAnswers(items: { question: QuestionFull; selected: string[] }[]): GradeResult {
  const total = items.length;
  let correct = 0;
  const agg: Record<string, { answered: number; correct: number }> = {};
  for (const { question, selected } of items) {
    const ok = isCorrect(question, selected);
    if (ok) correct++;
    const d = (agg[question.domain] ||= { answered: 0, correct: 0 });
    d.answered++;
    if (ok) d.correct++;
  }
  const accuracy = total ? correct / total : 0;
  const score = scaledScore(accuracy);
  const domain_breakdown: DomainBreakdown = {};
  for (const [d, v] of Object.entries(agg)) {
    domain_breakdown[d] = {
      answered: v.answered,
      correct: v.correct,
      accuracy: v.answered ? Math.round((v.correct / v.answered) * 10000) / 10000 : 0,
    };
  }
  return {
    total_questions: total,
    correct_count: correct,
    percent: Math.round(accuracy * 10000) / 100,
    score,
    passed: score >= PASSING,
    domain_breakdown,
  };
}

// ---- tutor (explain) -------------------------------------------------------
export function tutorExplain(q: QuestionFull): string {
  const correct = q.correct_answers.join(", ");
  const lines = [
    `**Correct answer: ${correct}**`,
    "",
    q.explanation_correct || "(No explanation provided in the dataset.)",
  ];
  const whys: string[] = [];
  for (const letter of LETTERS) {
    if (q.correct_answers.includes(letter)) continue;
    const why = q[`why_${letter.toLowerCase()}_wrong` as keyof QuestionFull] as string;
    if (why) whys.push(`- **${letter}.** ${why}`);
  }
  if (whys.length) {
    lines.push("", "Why the other options are wrong:", ...whys);
  }
  return lines.join("\n");
}
