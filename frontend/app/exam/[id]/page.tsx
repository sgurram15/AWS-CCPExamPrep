"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { ExamTimer } from "@/components/ExamTimer";
import { Badge } from "@/components/Badge";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Attempt, ReviewQuestion } from "@/lib/types";

const LETTERS = ["A", "B", "C", "D"];

interface LocalAnswer {
  selected: string[];
  flagged: boolean;
}

export default function ExamPage() {
  return (
    <RequireAuth>
      <ExamRunner />
    </RequireAuth>
  );
}

function ExamRunner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, LocalAnswer>>({});
  const [graded, setGraded] = useState<Record<string, ReviewQuestion>>({});
  const [submitting, setSubmitting] = useState(false);
  const dirty = useRef(false);
  // Always-current snapshot of answers so the autosave/flush closures never
  // persist stale selections (the cause of "correct answer graded incorrect").
  const answersRef = useRef(answers);
  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  const { data: attempt, isLoading } = useQuery({
    queryKey: ["attempt", id],
    queryFn: () => apiGet<Attempt>(`/attempts/${id}`),
  });

  // hydrate local answer state once the attempt loads
  useEffect(() => {
    if (!attempt) return;
    const init: Record<string, LocalAnswer> = {};
    for (const q of attempt.questions) {
      init[q.question.id] = { selected: q.selected_answers, flagged: q.flagged };
    }
    setAnswers(init);
    if (attempt.status === "submitted") router.replace(`/exam/${id}/review`);
  }, [attempt, id, router]);

  const isExam = attempt?.mode === "full_exam";

  // Persist the latest answers. Stable across renders (reads answersRef, not
  // the answers state), so the autosave effect doesn't re-fire on every click.
  const flush = useCallback(async () => {
    if (!attempt) return;
    const payload = attempt.questions.map((q) => ({
      question_id: q.question.id,
      selected_answers: answersRef.current[q.question.id]?.selected ?? [],
      flagged: answersRef.current[q.question.id]?.flagged ?? false,
      time_spent_seconds: 0,
    }));
    try {
      await apiPatch(`/attempts/${id}/answers`, { answers: payload });
      dirty.current = false;
    } catch {
      /* keep dirty so the next tick retries */
    }
  }, [attempt, id]);

  // autosave every 5s and on unmount (effect re-runs only when the attempt loads)
  useEffect(() => {
    if (!attempt) return;
    const t = setInterval(() => {
      if (dirty.current) void flush();
    }, 5000);
    return () => {
      clearInterval(t);
      void flush();
    };
  }, [attempt, flush]);

  // warn on accidental refresh while in progress
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const select = (qid: string, letter: string, multi: boolean) => {
    setAnswers((prev) => {
      const cur = prev[qid]?.selected ?? [];
      let next: string[];
      if (multi) {
        next = cur.includes(letter) ? cur.filter((l) => l !== letter) : [...cur, letter];
      } else {
        next = [letter];
      }
      return { ...prev, [qid]: { ...prev[qid], selected: next, flagged: prev[qid]?.flagged ?? false } };
    });
    dirty.current = true;
  };

  const toggleFlag = (qid: string) => {
    setAnswers((prev) => ({
      ...prev,
      [qid]: { selected: prev[qid]?.selected ?? [], flagged: !prev[qid]?.flagged },
    }));
    dirty.current = true;
  };

  const gradeOne = async (qid: string) => {
    await flush(); // always persist the current selection before grading
    const res = await apiPost<ReviewQuestion>(
      `/attempts/${id}/grade-question?question_id=${qid}`,
      {}
    );
    setGraded((prev) => ({ ...prev, [qid]: res }));
  };

  const submit = useCallback(async () => {
    setSubmitting(true);
    await flush();
    try {
      await apiPost(`/attempts/${id}/submit`, {});
      router.push(`/exam/${id}/review`);
    } catch {
      setSubmitting(false);
    }
  }, [flush, id, router]);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((a) => a.selected.length > 0).length,
    [answers]
  );

  if (isLoading || !attempt) return <div className="py-20 text-center text-slate-400">Loading exam…</div>;

  const q = attempt.questions[current];
  const local = answers[q.question.id] ?? { selected: [], flagged: false };
  const multi = q.question.question_type === "multi_select";
  const gradedResult = graded[q.question.id];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold capitalize">{attempt.mode.replace("_", " ")}</h1>
          <p className="text-sm text-slate-500">
            {answeredCount}/{attempt.total_questions} answered
          </p>
        </div>
        <div className="flex items-center gap-3">
          {isExam && attempt.time_limit_seconds && (
            <ExamTimer
              startedAt={attempt.started_at}
              limitSeconds={attempt.time_limit_seconds}
              onExpire={submit}
            />
          )}
          <button onClick={submit} disabled={submitting} className="btn-primary">
            {submitting ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Navigator */}
        <aside className="card h-fit p-3">
          <div className="mb-2 text-xs font-medium text-slate-500">Questions</div>
          <div className="grid grid-cols-6 gap-1.5 lg:grid-cols-5">
            {attempt.questions.map((qq, i) => {
              const a = answers[qq.question.id];
              const done = a?.selected.length;
              return (
                <button
                  key={qq.question.id}
                  onClick={() => setCurrent(i)}
                  className={`relative h-8 rounded text-xs font-medium ${
                    i === current
                      ? "bg-blue-600 text-white"
                      : done
                        ? "bg-blue-100 text-blue-700"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {i + 1}
                  {a?.flagged && (
                    <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-500" />
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Question */}
        <section className="card p-6">
          <div className="mb-3 flex items-center gap-2">
            <Badge tone="blue">{q.question.domain}</Badge>
            <Badge>{q.question.difficulty}</Badge>
            {multi && <span className="text-xs text-slate-500">(select all that apply)</span>}
            <button
              onClick={() => toggleFlag(q.question.id)}
              className={`ml-auto text-sm ${local.flagged ? "text-amber-600" : "text-slate-400"}`}
            >
              {local.flagged ? "★ Flagged" : "☆ Flag"}
            </button>
          </div>

          <p className="text-lg font-medium">
            {current + 1}. {q.question.question_text}
          </p>

          <div className="mt-4 space-y-2">
            {LETTERS.map((letter) => {
              const text = q.question.options[letter];
              if (!text) return null;
              const selected = local.selected.includes(letter);
              const isCorrect = gradedResult?.question.correct_answers.includes(letter);
              const showResult = !!gradedResult;
              let cls = "border-slate-200 hover:border-blue-300";
              if (showResult && isCorrect) cls = "border-green-400 bg-green-50";
              else if (showResult && selected && !isCorrect) cls = "border-red-400 bg-red-50";
              else if (selected) cls = "border-blue-500 bg-blue-50";
              return (
                <button
                  key={letter}
                  disabled={showResult}
                  onClick={() => select(q.question.id, letter, multi)}
                  className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors ${cls}`}
                >
                  <span className="font-semibold text-slate-500">{letter}</span>
                  <span>{text}</span>
                </button>
              );
            })}
          </div>

          {/* Practice mode: explanation after grading */}
          {gradedResult && (
            <div className="mt-4 rounded-lg bg-slate-50 p-4 text-sm">
              <p className={gradedResult.is_correct ? "font-semibold text-green-700" : "font-semibold text-red-700"}>
                {gradedResult.is_correct ? "Correct!" : "Incorrect"} · Answer:{" "}
                {gradedResult.question.correct_answers.join(", ")}
              </p>
              <p className="mt-2">{gradedResult.question.explanation_correct}</p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between">
            <button
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
              className="btn-secondary"
            >
              ← Previous
            </button>
            {!isExam && !gradedResult && (
              <button
                onClick={() => gradeOne(q.question.id)}
                disabled={!local.selected.length}
                className="btn-primary"
              >
                Check answer
              </button>
            )}
            <button
              onClick={() => setCurrent((c) => Math.min(attempt.questions.length - 1, c + 1))}
              disabled={current === attempt.questions.length - 1}
              className="btn-secondary"
            >
              Next →
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
