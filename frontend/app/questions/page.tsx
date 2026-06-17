"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { QuestionCard } from "@/components/QuestionCard";
import { FACETS } from "@/lib/dataset";
import { getBookmarkIds, queryQuestions } from "@/lib/store";

export default function QuestionsPage() {
  return (
    <RequireAuth>
      <QuestionsInner />
    </RequireAuth>
  );
}

function QuestionsInner() {
  const [domain, setDomain] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [examId, setExamId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const size = 10;

  const { data: facets } = useQuery({ queryKey: ["facets"], queryFn: async () => FACETS });

  const filter = { domain, difficulty, exam_id: examId, q: search, page, size };

  const { data, isFetching } = useQuery({
    queryKey: ["questions", filter],
    queryFn: async () => queryQuestions(filter),
    placeholderData: keepPreviousData,
  });

  const { data: bookmarks } = useQuery({
    queryKey: ["bookmark-ids"],
    queryFn: async () => getBookmarkIds(),
  });
  const bookmarkedIds = new Set(bookmarks || []);

  const totalPages = data ? Math.ceil(data.total / size) : 1;

  const onFilter = (setter: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Question Bank</h1>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <input
          placeholder="Search questions or topics…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="min-w-48 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select value={domain} onChange={onFilter(setDomain)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All domains</option>
          {facets?.domains.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={difficulty} onChange={onFilter(setDifficulty)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All difficulties</option>
          {facets?.difficulties.map((d) => <option key={d}>{d}</option>)}
        </select>
        <select value={examId} onChange={onFilter(setExamId)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
          <option value="">All exams</option>
          {facets?.exams.map((e) => <option key={e} value={e}>Exam {e}</option>)}
        </select>
      </div>

      <p className="text-sm text-slate-500">
        {data?.total ?? 0} questions {isFetching && "· loading…"}
      </p>

      <div className="space-y-4">
        {data?.items.map((q) => (
          <QuestionCard key={q.id} q={q} bookmarked={bookmarkedIds.has(q.id)} />
        ))}
        {data && data.items.length === 0 && (
          <div className="card py-10 text-center text-sm text-slate-400">No questions match.</div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary">
            Previous
          </button>
          <span className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="btn-secondary">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
