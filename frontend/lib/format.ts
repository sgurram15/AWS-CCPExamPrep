export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

export const DOMAIN_SHORT: Record<string, string> = {
  "Cloud Concepts": "Cloud Concepts",
  "Security and Compliance": "Security",
  "Cloud Technology and Services": "Technology",
  "Billing, Pricing, and Support": "Billing",
};
