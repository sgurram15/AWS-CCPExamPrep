"use client";

import { useState } from "react";
import { Badge } from "@/components/Badge";
import { apiDelete, apiGet, apiPost } from "@/lib/api";
import type { QuestionFull, QuestionPublic, TutorResponse } from "@/lib/types";

const LETTERS = ["A", "B", "C", "D"];

export function QuestionCard({
  q,
  bookmarked,
  onBookmarkChange,
}: {
  q: QuestionPublic;
  bookmarked?: boolean;
  onBookmarkChange?: (id: string, value: boolean) => void;
}) {
  const [marked, setMarked] = useState(!!bookmarked);
  const [explanation, setExplanation] = useState<TutorResponse | null>(null);
  const [full, setFull] = useState<QuestionFull | null>(null);
  const [loading, setLoading] = useState(false);

  const toggleBookmark = async () => {
    try {
      if (marked) await apiDelete(`/bookmarks/${q.id}`);
      else await apiPost("/bookmarks", { question_id: q.id });
      setMarked(!marked);
      onBookmarkChange?.(q.id, !marked);
    } catch {
      /* ignore */
    }
  };

  const explain = async () => {
    if (explanation) {
      setExplanation(null);
      return;
    }
    setLoading(true);
    try {
      const [tutor, detail] = await Promise.all([
        apiPost<TutorResponse>("/tutor", { mode: "explain", question_id: q.id }),
        apiGet<QuestionFull>(`/questions/${q.id}`),
      ]);
      setExplanation(tutor);
      setFull(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-5">
      <div className="mb-2 flex items-center gap-2">
        <Badge tone="blue">{q.domain}</Badge>
        <Badge>{q.difficulty}</Badge>
        <button onClick={toggleBookmark} className="ml-auto text-sm">
          {marked ? <span className="text-amber-600">★ Bookmarked</span> : <span className="text-slate-400">☆ Bookmark</span>}
        </button>
      </div>
      <p className="font-medium">{q.question_text}</p>
      <div className="mt-3 space-y-1.5">
        {LETTERS.map((letter) => {
          const text = q.options[letter];
          if (!text) return null;
          const correct = full?.correct_answers.includes(letter);
          return (
            <div
              key={letter}
              className={`flex gap-2 text-sm ${correct ? "font-medium text-green-700" : "text-slate-600"}`}
            >
              <span className="font-semibold">{letter}.</span>
              <span>{text}</span>
              {correct && <span className="text-green-600">✓</span>}
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {q.topic_tags.map((t) => (
          <span key={t} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
            {t}
          </span>
        ))}
      </div>
      <button onClick={explain} className="mt-3 text-sm text-blue-600 hover:underline">
        {loading ? "Loading…" : explanation ? "Hide explanation" : "Show answer & explanation"}
      </button>
      {explanation && (
        <div className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {explanation.content}
          {explanation.citations.length > 0 && (
            <div className="mt-2 text-xs text-slate-400">Source: {explanation.citations.join(", ")}</div>
          )}
        </div>
      )}
    </div>
  );
}
