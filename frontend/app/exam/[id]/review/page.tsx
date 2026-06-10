"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge } from "@/components/Badge";
import { apiGet } from "@/lib/api";
import { DOMAIN_SHORT, formatDuration } from "@/lib/format";
import type { AttemptReview } from "@/lib/types";

const LETTERS = ["A", "B", "C", "D"];

export default function ReviewPage() {
  return (
    <RequireAuth>
      <ReviewInner />
    </RequireAuth>
  );
}

function ReviewInner() {
  const { id } = useParams<{ id: string }>();
  const [incorrectOnly, setIncorrectOnly] = useState(false);

  const { data } = useQuery({
    queryKey: ["review", id, incorrectOnly],
    queryFn: () => apiGet<AttemptReview>(`/attempts/${id}/review?incorrect_only=${incorrectOnly}`),
  });

  if (!data) return <div className="py-20 text-center text-slate-400">Loading results…</div>;

  const passed = data.passed;

  return (
    <div className="space-y-6">
      <div className="card p-6 text-center">
        <div className="text-sm uppercase tracking-wide text-slate-500">Your score</div>
        <div className={`mt-1 text-5xl font-bold ${passed ? "text-green-600" : "text-red-600"}`}>
          {data.score ?? "—"}
        </div>
        <div className="mt-1 text-slate-500">
          {data.correct_count}/{data.total_questions} correct · {data.percent}% ·{" "}
          {formatDuration(data.time_taken_seconds)}
        </div>
        <div className="mt-3">
          {passed ? (
            <span className="rounded-full bg-green-100 px-4 py-1 font-semibold text-green-700">
              PASSED (≥ 700)
            </span>
          ) : (
            <span className="rounded-full bg-red-100 px-4 py-1 font-semibold text-red-700">
              Not yet (need ≥ 700)
            </span>
          )}
        </div>
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold">By domain</h2>
        <div className="space-y-2">
          {Object.entries(data.domain_breakdown).map(([domain, v]) => (
            <div key={domain} className="flex items-center gap-3">
              <div className="w-32 text-sm text-slate-600">{DOMAIN_SHORT[domain] || domain}</div>
              <div className="h-2 flex-1 rounded-full bg-slate-100">
                <div
                  className="h-2 rounded-full bg-blue-600"
                  style={{ width: `${Math.round(v.accuracy * 100)}%` }}
                />
              </div>
              <div className="w-16 text-right text-sm text-slate-500">
                {v.correct}/{v.answered}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Question review</h2>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={incorrectOnly}
            onChange={(e) => setIncorrectOnly(e.target.checked)}
          />
          Incorrect only
        </label>
      </div>

      <div className="space-y-4">
        {data.questions.map((rq) => (
          <div key={rq.question.id} className="card p-5">
            <div className="mb-2 flex items-center gap-2">
              <Badge tone="blue">{rq.question.domain}</Badge>
              <Badge>{rq.question.difficulty}</Badge>
              <span
                className={`ml-auto text-sm font-semibold ${
                  rq.is_correct ? "text-green-600" : "text-red-600"
                }`}
              >
                {rq.is_correct ? "Correct" : "Incorrect"}
              </span>
            </div>
            <p className="font-medium">
              {rq.position + 1}. {rq.question.question_text}
            </p>
            <div className="mt-3 space-y-1.5">
              {LETTERS.map((letter) => {
                const text = rq.question.options[letter];
                if (!text) return null;
                const correct = rq.question.correct_answers.includes(letter);
                const chosen = rq.selected_answers.includes(letter);
                let cls = "text-slate-600";
                if (correct) cls = "text-green-700 font-medium";
                else if (chosen) cls = "text-red-700 line-through";
                return (
                  <div key={letter} className={`flex gap-2 text-sm ${cls}`}>
                    <span className="font-semibold">{letter}.</span>
                    <span>{text}</span>
                    {correct && <span className="text-green-600">✓</span>}
                    {chosen && !correct && <span className="text-red-600">✗ your answer</span>}
                  </div>
                );
              })}
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-700">Explanation</p>
              <p className="mt-1 text-slate-600">{rq.question.explanation_correct}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-center gap-3">
        <Link href="/dashboard" className="btn-secondary">
          Back to dashboard
        </Link>
        <Link href="/study" className="btn-primary">
          Study more
        </Link>
      </div>
    </div>
  );
}
