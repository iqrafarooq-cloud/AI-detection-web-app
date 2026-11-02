// Shared (client + server) grammar helpers. No server-only imports here.

export const ISSUE_TYPES = ["grammar", "spelling", "punctuation", "clarity", "wordiness", "style"];

/** Applies the given issues (non-overlapping, with offsets into `text`). */
export function applyIssues(text, issues) {
  let out = text;
  for (const i of [...issues].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, i.start) + i.suggestion + out.slice(i.end);
  }
  return out;
}
