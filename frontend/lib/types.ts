export interface QuestionPublic {
  id: string;
  question_id: string;
  exam_id: number | null;
  question_number: number;
  domain: string;
  difficulty: string;
  question_type: string;
  question_text: string;
  options: Record<string, string>;
  topic_tags: string[];
}

export interface QuestionFull extends QuestionPublic {
  correct_answer: string;
  correct_answers: string[];
  explanation_correct: string;
  why_a_wrong: string;
  why_b_wrong: string;
  why_c_wrong: string;
  why_d_wrong: string;
  source_reference: string;
}

export interface QuestionList {
  items: QuestionPublic[];
  total: number;
  page: number;
  size: number;
}

export interface Facets {
  domains: string[];
  difficulties: string[];
  question_types: string[];
  exams: number[];
  topics: string[];
}

export interface Exam {
  id: number;
  name: string;
  description: string;
  question_count: number;
  time_limit_minutes: number;
  passing_score: number;
}

export interface AttemptQuestion {
  position: number;
  question: QuestionPublic;
  selected_answers: string[];
  flagged: boolean;
}

export interface Attempt {
  id: string;
  mode: string;
  exam_id: number | null;
  status: string;
  time_limit_seconds: number | null;
  started_at: string;
  submitted_at: string | null;
  total_questions: number;
  questions: AttemptQuestion[];
}

export interface DomainBreakdown {
  [domain: string]: { answered: number; correct: number; accuracy: number };
}

export interface AttemptResult {
  id: string;
  mode: string;
  exam_id: number | null;
  status: string;
  score: number | null;
  percent: number | null;
  passed: boolean | null;
  total_questions: number;
  correct_count: number;
  time_taken_seconds: number | null;
  submitted_at: string | null;
  domain_breakdown: DomainBreakdown;
}

export interface ReviewQuestion {
  position: number;
  question: QuestionFull;
  selected_answers: string[];
  is_correct: boolean;
  flagged: boolean;
  time_spent_seconds: number;
}

export interface AttemptReview extends AttemptResult {
  questions: ReviewQuestion[];
}

export interface AttemptHistoryItem {
  id: string;
  mode: string;
  exam_id: number | null;
  config: { domain?: string | null; difficulty?: string | null; [k: string]: unknown };
  status: string;
  score: number | null;
  percent: number | null;
  passed: boolean | null;
  total_questions: number;
  correct_count: number;
  time_taken_seconds: number | null;
  started_at: string;
  submitted_at: string | null;
}

export interface DomainStat {
  domain: string;
  answered: number;
  correct: number;
  accuracy: number;
}

export interface Dashboard {
  questions_answered: number;
  distinct_questions_seen: number;
  average_score: number | null;
  best_score: number | null;
  exams_taken: number;
  exams_passed: number;
  study_streak_days: number;
  domain_stats: DomainStat[];
  weak_domains: string[];
}

export interface TutorResponse {
  mode: string;
  grounded: boolean;
  content: string;
  citations: string[];
  enabled: boolean;
}
