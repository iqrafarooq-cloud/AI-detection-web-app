// Checks that facts which must survive an edit (numbers, citations, URLs, etc.)
// still appear in the improved text. Used server-side after every rewrite.

const PATTERNS = [
  { type: "url", re: /\bhttps?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?]/gi },
  { type: "email", re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { type: "doi", re: /\b10\.\d{4,9}\/[^\s"<>]+[^\s"<>.,;]/g },
  { type: "citation", re: /\((?:[A-Z][\p{L}'’-]+(?:,? (?:et al\.|&|and) ?[A-Z]?[\p{L}'’-]*)*,? (?:\d{4}[a-z]?|n\.d\.)(?:[;,] ?[^)]*)?)\)/gu },
  { type: "citation", re: /\[\d+(?:\s*[,–-]\s*\d+)*\]/g },
  // Numbers, including decimals, thousands separators, percentages and currency.
  { type: "number", re: /(?:[$€£¥]\s?)?\d+(?:[.,]\d+)*(?:\s?%)?/g },
];

function normalize(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function extractProtected(text) {
  const found = new Map();
  for (const { type, re } of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const value = normalize(m[0]);
      if (type === "number" && value.length < 1) continue;
      const key = `${type}:${value}`;
      if (!found.has(key)) found.set(key, { type, value });
    }
  }
  return [...found.values()];
}

function numericCore(v) {
  return v.replace(/[$€£¥%\s]/g, "").replace(/,(?=\d{3}\b)/g, "");
}

/**
 * Returns protected items from `original` that are missing from `improved`.
 * Numbers are compared by their numeric core so "1,000" and "1000" match.
 */
export function findMissingProtected(original, improved) {
  const items = extractProtected(original);
  const improvedNorm = normalize(improved);
  const improvedNumbers = new Set(
    (improved.match(/\d+(?:[.,]\d+)*/g) || []).map(numericCore)
  );
  return items.filter(({ type, value }) => {
    if (type === "number") return !improvedNumbers.has(numericCore(value));
    return !improvedNorm.includes(value);
  });
}
