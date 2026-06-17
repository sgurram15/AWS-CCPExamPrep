"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { QuestionCard } from "@/components/QuestionCard";
import { listBookmarkedQuestions } from "@/lib/store";

export default function BookmarksPage() {
  return (
    <RequireAuth>
      <BookmarksInner />
    </RequireAuth>
  );
}

function BookmarksInner() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["bookmarks"],
    queryFn: async () => listBookmarkedQuestions(),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Bookmarks</h1>
        {data && data.length > 0 && (
          <Link href="/study" className="btn-secondary text-sm">
            Study bookmarked
          </Link>
        )}
      </div>
      {data && data.length === 0 && (
        <div className="card py-12 text-center text-sm text-slate-400">
          No bookmarks yet. Bookmark questions from the{" "}
          <Link href="/questions" className="text-blue-600 hover:underline">
            question bank
          </Link>
          .
        </div>
      )}
      <div className="space-y-4">
        {data?.map((q) => (
          <QuestionCard
            key={q.id}
            q={q}
            bookmarked
            onBookmarkChange={() => qc.invalidateQueries({ queryKey: ["bookmarks"] })}
          />
        ))}
      </div>
    </div>
  );
}
