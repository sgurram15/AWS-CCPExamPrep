const DIFFICULTY_STYLES: Record<string, string> = {
  easy: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  hard: "bg-red-100 text-red-700",
};

export function Badge({ children, tone = "slate" }: { children: React.ReactNode; tone?: string }) {
  const styles =
    DIFFICULTY_STYLES[String(children).toLowerCase()] ||
    (tone === "blue" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600");
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${styles}`}>{children}</span>;
}
