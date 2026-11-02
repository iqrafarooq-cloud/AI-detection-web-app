import { WRITING_STYLES } from "@/lib/services/rewrite/options";

export const VERDICT = {
  likely_ai: { label: "Likely AI-like", tone: "violet" },
  likely_human: { label: "Likely human-like", tone: "green" },
  mixed: { label: "Mixed", tone: "amber" },
  uncertain: { label: "Uncertain", tone: "neutral" },
};

export function verdictInfo(v) {
  return VERDICT[v] || { label: "No detector estimate", tone: "neutral" };
}

export function styleLabel(id) {
  return WRITING_STYLES.find((s) => s.id === id)?.label || id;
}

export function formatDateTime(iso) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const UNITS = [
  ["year", 365 * 86400],
  ["month", 30 * 86400],
  ["week", 7 * 86400],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "3 hours ago", "yesterday", "just now". */
export function timeAgo(iso, now = Date.now()) {
  const secs = Math.round((new Date(iso).getTime() - now) / 1000);
  if (Math.abs(secs) < 60) return "just now";
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size) return rtf.format(Math.round(secs / size), unit);
  }
  return "just now";
}

export function percent(x) {
  return x == null || Number.isNaN(x) ? null : `${Math.round(x * 100)}%`;
}
