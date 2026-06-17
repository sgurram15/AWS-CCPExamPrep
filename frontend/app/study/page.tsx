"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { EXAMS, FACETS } from "@/lib/dataset";
import { createAttempt } from "@/lib/store";
import type { AttemptConfig } from "@/lib/engine";

export default function StudyPage() {
  return (
    <RequireAuth>
      <StudyInner />
    </RequireAuth>
  );
}

function StudyInner() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: exams } = useQuery({ queryKey: ["exams"], queryFn: async () => EXAMS });
  const { data: facets } = useQuery({ queryKey: ["facets"], queryFn: async () => FACETS });

  const start = (body: AttemptConfig) => {
    setBusy(true);
    setError(null);
    try {
      const attempt = createAttempt(body);
      if (!attempt.question_ids.length) {
        setError("No questions available for this selection.");
        setBusy(false);
        return;
      }
      router.push(`/exam/${attempt.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Study</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Timed mock exams</h2>
        <p className="mb-3 text-sm text-slate-500">
          65 questions, 90-minute timer, CLF-C02 pacing. Explanations revealed after you submit.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(exams || []).map((e) => (
            <div key={e.id} className="card p-5">
              <h3 className="font-semibold">{e.name}</h3>
              <p className="mt-1 text-sm text-slate-500">
                {e.question_count} questions · {e.time_limit_minutes} min · pass ≥ {e.passing_score}
              </p>
              <button
                disabled={busy}
                onClick={() => start({ mode: "full_exam", exam_id: e.id })}
                className="btn-primary mt-4 w-full"
              >
                Start mock exam
              </button>
            </div>
          ))}
          {!exams?.length && <p className="text-sm text-slate-400">No exams seeded yet.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Domain-focused practice</h2>
        <p className="mb-3 text-sm text-slate-500">
          Untimed. Weak topics surface more often (adaptive). Immediate feedback per question.
        </p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {(facets?.domains || []).map((d) => (
            <button
              key={d}
              disabled={busy}
              onClick={() => start({ mode: "domain", domain: d, num_questions: 20 })}
              className="card p-5 text-left transition-colors hover:border-blue-400"
            >
              <h3 className="font-semibold">{d}</h3>
              <span className="mt-2 inline-block text-sm text-blue-600">Practice →</span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Quick practice set</h2>
        <div className="flex flex-wrap gap-3">
          <button
            disabled={busy}
            onClick={() => start({ mode: "practice", num_questions: 10 })}
            className="btn-secondary"
          >
            10 mixed questions
          </button>
          <button
            disabled={busy}
            onClick={() => start({ mode: "practice", num_questions: 20 })}
            className="btn-secondary"
          >
            20 mixed questions
          </button>
          <button
            disabled={busy}
            onClick={() => start({ mode: "bookmark" })}
            className="btn-secondary"
          >
            Bookmarked only
          </button>
        </div>
      </section>
    </div>
  );
}
