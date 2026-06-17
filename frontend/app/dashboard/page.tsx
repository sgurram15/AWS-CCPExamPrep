"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/RequireAuth";
import { getDashboard, listHistory } from "@/lib/store";
import { formatDate, formatDuration } from "@/lib/format";
import type { AttemptHistoryItem } from "@/lib/types";

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardInner />
    </RequireAuth>
  );
}

function DashboardInner() {
  const { data: dash } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => getDashboard(),
  });
  const { data: history } = useQuery({
    queryKey: ["history"],
    queryFn: async () => listHistory(),
  });

  const all = history || [];

  const testLabel = (h: AttemptHistoryItem) => {
    if (h.exam_id != null) return `Practice Exam ${h.exam_id}`;
    if (h.mode === "domain" && h.config?.domain) return h.config.domain;
    if (h.mode === "bookmark") return "Bookmarked questions";
    if (h.mode === "review") return "Review of missed questions";
    if (h.mode === "practice") return h.config?.domain ? `Practice — ${h.config.domain}` : "Practice (mixed)";
    return h.mode.replace("_", " ");
  };

  // One row per distinct test (history is newest-first, so the first occurrence
  // is the most recent attempt) — avoids listing the same test multiple times.
  const seenTests = new Set<string>();
  const uniqueAttempts = all.filter((h) => {
    const key =
      h.exam_id != null ? `exam-${h.exam_id}` : `${h.mode}-${h.config?.domain ?? ""}`;
    if (seenTests.has(key)) return false;
    seenTests.add(key);
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/study" className="btn-primary">
          Start studying
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Avg score" value={dash?.average_score?.toString() ?? "—"} hint="scaled / 1000" />
        <Stat label="Best score" value={dash?.best_score?.toString() ?? "—"} hint="pass ≥ 700" />
        <Stat label="Exams passed" value={`${dash?.exams_passed ?? 0}/${dash?.exams_taken ?? 0}`} />
        <Stat label="Study streak" value={`${dash?.study_streak_days ?? 0}d`} hint="consecutive days" />
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold">Accuracy by domain</h2>
        {dash?.domain_stats?.length ? (
          <div className="space-y-2">
            {dash.domain_stats.map((s) => (
              <div key={s.domain} className="flex items-center gap-3">
                <div className="w-56 text-sm text-slate-700">{s.domain}</div>
                <div className="h-2 flex-1 rounded-full bg-slate-100">
                  <div
                    className={`h-2 rounded-full ${s.accuracy >= 0.7 ? "bg-green-600" : "bg-amber-500"}`}
                    style={{ width: `${Math.round(s.accuracy * 100)}%` }}
                  />
                </div>
                <div className="w-24 text-right text-sm font-medium text-slate-600">
                  {s.correct}/{s.answered}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty text="Answer some questions to see your domain accuracy." />
        )}
        {dash?.weak_domains?.length ? (
          <p className="mt-3 text-sm text-amber-700">Focus areas: {dash.weak_domains.join(", ")}</p>
        ) : null}
      </div>

      <div className="card p-5">
        <h2 className="mb-3 font-semibold">Tests attempted</h2>
        {all.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="py-2">Date</th>
                  <th>Test</th>
                  <th>Score</th>
                  <th>Time</th>
                  <th>Result</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {uniqueAttempts.map((h) => {
                  const done = h.status === "submitted";
                  return (
                    <tr key={h.id} className="border-t border-slate-100">
                      <td className="py-2">{formatDate(done ? h.submitted_at : h.started_at)}</td>
                      <td>{testLabel(h)}</td>
                      <td className="font-medium">
                        {done ? `${h.correct_count}/${h.total_questions}` : "—"}
                      </td>
                      <td>{done ? formatDuration(h.time_taken_seconds) : "—"}</td>
                      <td>
                        {!done ? (
                          <span className="font-medium text-amber-600">In progress</span>
                        ) : h.passed == null ? (
                          "—"
                        ) : h.passed ? (
                          <span className="font-medium text-green-600">Passed</span>
                        ) : (
                          <span className="font-medium text-red-600">Failed</span>
                        )}
                      </td>
                      <td className="text-right">
                        {done ? (
                          <Link href={`/exam/${h.id}/review`} className="text-blue-600 hover:underline">
                            Review
                          </Link>
                        ) : (
                          <Link href={`/exam/${h.id}`} className="font-medium text-amber-700 hover:underline">
                            Resume →
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty text="No tests yet — take your first one!" />
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {hint && <div className="text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

function Empty({ text = "No data yet." }: { text?: string }) {
  return <div className="py-8 text-center text-sm text-slate-400">{text}</div>;
}
