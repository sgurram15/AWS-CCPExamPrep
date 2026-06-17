// Static question dataset, loaded and normalized at build time from the bundled
// JSON. This replaces the FastAPI backend's ingestion pipeline (normalize +
// dedup) — the app is now fully client-side. Options are NOT shuffled: the
// authored dataset already has varied, correct answer positions.
import rawExam1 from "@/data/exam1.json";
import type { Exam, Facets, QuestionFull } from "./types";

const LETTERS = ["A", "B", "C", "D"] as const;

// Canonical CLF-C02 domains (exam1 is already canonical; this guards variants).
const DOMAIN_CANON: Record<string, string> = {
  "cloud concepts": "Cloud Concepts",
  "security and compliance": "Security and Compliance",
  "security & compliance": "Security and Compliance",
  "cloud technology and services": "Cloud Technology and Services",
  "cloud technology & services": "Cloud Technology and Services",
  technology: "Cloud Technology and Services",
  "billing, pricing, and support": "Billing, Pricing, and Support",
  "billing pricing and support": "Billing, Pricing, and Support",
  "billing and pricing": "Billing, Pricing, and Support",
};

interface RawQuestion {
  question_id: string;
  exam_id?: number | null;
  question_number?: number;
  domain?: string;
  difficulty?: string;
  question_type?: string;
  question_text: string;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  correct_answer?: string;
  correct_answers?: string[];
  explanation_correct?: string;
  why_a_wrong?: string;
  why_b_wrong?: string;
  why_c_wrong?: string;
  why_d_wrong?: string;
  topic_tags?: string[];
  source_reference?: string;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

function normalize(raw: RawQuestion): QuestionFull {
  const domainRaw = str(raw.domain);
  const domain = DOMAIN_CANON[domainRaw.toLowerCase()] || domainRaw || "Cloud Concepts";
  const difficulty = (str(raw.difficulty) || "medium").toLowerCase();
  const qtype = str(raw.question_type) === "multi_select" ? "multi_select" : "single_choice";

  let correct = (raw.correct_answers ?? []).map((a) => str(a).toUpperCase()).filter(Boolean);
  const single = str(raw.correct_answer).toUpperCase();
  if (correct.length === 0 && single) correct = [single];
  if (qtype === "single_choice") correct = correct.slice(0, 1);

  return {
    id: str(raw.question_id),
    question_id: str(raw.question_id),
    exam_id: raw.exam_id ?? null,
    question_number: raw.question_number ?? 0,
    domain,
    difficulty,
    question_type: qtype,
    question_text: str(raw.question_text),
    options: {
      A: str(raw.option_a),
      B: str(raw.option_b),
      C: str(raw.option_c),
      D: str(raw.option_d),
    },
    correct_answer: correct[0] ?? "",
    correct_answers: correct,
    explanation_correct: str(raw.explanation_correct),
    why_a_wrong: str(raw.why_a_wrong),
    why_b_wrong: str(raw.why_b_wrong),
    why_c_wrong: str(raw.why_c_wrong),
    why_d_wrong: str(raw.why_d_wrong),
    topic_tags: (raw.topic_tags ?? []).map((t) => str(t)).filter(Boolean),
    source_reference: str(raw.source_reference),
  };
}

function contentKey(q: QuestionFull): string {
  const opts = LETTERS.map((l) => q.options[l].toLowerCase().trim())
    .sort()
    .join("|");
  return `${q.question_text.toLowerCase().trim()}::${opts}`;
}

// ---- build the in-memory dataset (deduped) --------------------------------
const raws = (rawExam1 as { questions: RawQuestion[] }).questions;
const seen = new Set<string>();
const built: QuestionFull[] = [];
for (const raw of raws) {
  const q = normalize(raw);
  if (!q.question_text || !q.correct_answers.length) continue;
  const key = contentKey(q);
  if (seen.has(key)) continue;
  seen.add(key);
  built.push(q);
}

export const ALL_QUESTIONS: QuestionFull[] = built;
export const QUESTIONS_BY_ID: Map<string, QuestionFull> = new Map(built.map((q) => [q.id, q]));

export function getQuestion(id: string): QuestionFull | undefined {
  return QUESTIONS_BY_ID.get(id);
}

// ---- derived exams + facets ------------------------------------------------
const EXAM_TIME_LIMIT_MIN = 90;
const PASSING_SCORE = 700;

const examIds = Array.from(
  new Set(built.map((q) => q.exam_id).filter((e): e is number => e != null))
).sort((a, b) => a - b);

export const EXAMS: Exam[] = examIds.map((id) => ({
  id,
  name: `AWS CCP Practice Exam ${id}`,
  description: "AWS Certified Cloud Practitioner (CLF-C02) mock exam.",
  question_count: built.filter((q) => q.exam_id === id).length,
  time_limit_minutes: EXAM_TIME_LIMIT_MIN,
  passing_score: PASSING_SCORE,
}));

export const FACETS: Facets = {
  domains: Array.from(new Set(built.map((q) => q.domain))).sort(),
  difficulties: Array.from(new Set(built.map((q) => q.difficulty))).sort(),
  question_types: Array.from(new Set(built.map((q) => q.question_type))).sort(),
  exams: examIds,
  topics: Array.from(new Set(built.flatMap((q) => q.topic_tags))).sort(),
};

export const DEFAULT_EXAM_TIME_LIMIT_MIN = EXAM_TIME_LIMIT_MIN;
export const PASSING = PASSING_SCORE;
