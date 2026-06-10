"use client";

import { useEffect, useState } from "react";

export function ExamTimer({
  startedAt,
  limitSeconds,
  onExpire,
}: {
  startedAt: string;
  limitSeconds: number;
  onExpire: () => void;
}) {
  const [remaining, setRemaining] = useState(() => computeRemaining(startedAt, limitSeconds));

  useEffect(() => {
    const id = setInterval(() => {
      const r = computeRemaining(startedAt, limitSeconds);
      setRemaining(r);
      if (r <= 0) {
        clearInterval(id);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt, limitSeconds, onExpire]);

  const m = Math.floor(Math.max(remaining, 0) / 60);
  const s = Math.max(remaining, 0) % 60;
  const danger = remaining <= 300;

  return (
    <div
      className={`rounded-lg px-3 py-1.5 font-mono text-sm font-semibold ${
        danger ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700"
      }`}
    >
      {m}:{s.toString().padStart(2, "0")}
    </div>
  );
}

function computeRemaining(startedAt: string, limitSeconds: number): number {
  const start = new Date(startedAt).getTime();
  const elapsed = Math.floor((Date.now() - start) / 1000);
  return limitSeconds - elapsed;
}
