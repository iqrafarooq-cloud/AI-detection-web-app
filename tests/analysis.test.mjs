import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzePatterns } from "@/lib/analysis/patterns";
import { findMissingProtected, extractProtected } from "@/lib/analysis/preservation";
import { splitSentences, countWords, countCharacters } from "@/lib/text/stats";

test("splitSentences keeps exact offsets, including multiple paragraphs", () => {
  const text = "First sentence here.  Second one!\n\nA new paragraph? Yes.";
  const s = splitSentences(text);
  assert.equal(s.length, 4);
  for (const seg of s) assert.equal(text.slice(seg.start, seg.end), seg.text);
});

test("counts handle emoji, special characters and empty input", () => {
  assert.equal(countWords(""), 0);
  assert.equal(countCharacters(""), 0);
  assert.equal(countCharacters("héllo 👋"), 7);
  assert.equal(countWords("Hello, world! It's 2026 - café & co."), 6);
});

test("pattern analysis flags stock phrases with explanations", () => {
  const text =
    "In today's fast-paced world, technology plays a crucial role in education. It's important to note that teachers delve into new tools every year. Students learn faster.";
  const r = analyzePatterns(text);
  const flags = r.sentences.flatMap((s) => s.flags);
  assert.ok(flags.some((f) => f.type === "stock_phrase" && /fast-paced/.test(f.match)));
  assert.ok(flags.every((f) => typeof f.reason === "string" && f.reason.length > 10));
  assert.equal(r.metrics.englishChecksApplied, true);
});

test("pattern analysis never outputs an AI probability", () => {
  const r = analyzePatterns("Plain, well-written text. It is correct and clear. Nothing unusual here at all.");
  const json = JSON.stringify(r);
  assert.ok(!/probab|ai_score|aiScore/i.test(json));
});

test("grammatically clean, varied prose is not flagged", () => {
  const text =
    "I missed the bus again. So I walked, which took forty minutes in the drizzle, and arrived soaked but oddly cheerful. My manager laughed. Then she handed me a towel and a stack of invoices that had been waiting since Friday.";
  const r = analyzePatterns(text);
  assert.equal(r.sentences.filter((s) => s.flags.length).length, 0);
  assert.equal(r.signals.length, 0);
});

test("repeated sentence openers are detected", () => {
  const text = "The system is fast. The system is cheap. The system is reliable. Users like it.";
  const r = analyzePatterns(text);
  assert.ok(r.sentences.filter((s) => s.flags.some((f) => f.type === "repeated_opener")).length === 3);
});

test("non-English text skips English phrase checks", () => {
  const text = "Hoy es un día muy bonito. Vamos a la playa con mis amigos. Después comemos paella en el puerto.";
  const r = analyzePatterns(text);
  assert.equal(r.metrics.englishChecksApplied, false);
  assert.ok(r.signals.some((s) => s.id === "non_english"));
});

test("preservation finds citations, numbers, URLs and DOIs", () => {
  const original = "Sales rose 12.5% to $1,200 in 2024 (Smith et al., 2023) [3]. See https://example.com/report and doi 10.1000/xyz123.";
  const items = extractProtected(original).map((i) => i.value);
  for (const v of ["12.5%", "$1,200", "2024", "(Smith et al., 2023)", "[3]", "https://example.com/report", "10.1000/xyz123"]) {
    assert.ok(items.includes(v), `missing ${v}: ${items.join(" | ")}`);
  }
});

test("preservation reports nothing missing when facts are kept", () => {
  const original = "Revenue grew 12.5% to 1,000 units (Lee, 2021).";
  const improved = "Revenue increased by 12.5%, reaching 1000 units (Lee, 2021).";
  assert.deepEqual(findMissingProtected(original, improved), []);
});

test("preservation reports changed numbers and dropped citations", () => {
  const original = "Revenue grew 12.5% in 2021 (Lee, 2021).";
  const improved = "Revenue grew about 13% in 2021.";
  const missing = findMissingProtected(original, improved).map((m) => m.value);
  assert.ok(missing.includes("12.5%"));
  assert.ok(missing.includes("(Lee, 2021)"));
});

test("matchTypography restores the author's number and punctuation style", async () => {
  const { matchTypography } = await import("@/lib/text/typography");
  const original = "Sales grew 42% in the 2-year period. It's \"fine\".";
  const improved = "Sales grew 42 % over the 2‑year period — it’s “fine”.";
  assert.equal(matchTypography(original, improved), "Sales grew 42% over the 2-year period - it's \"fine\".");
  // Leaves the author's own conventions alone.
  assert.equal(matchTypography("Il a 42 % d’avance.", "Il a 42 % d’avance."), "Il a 42 % d’avance.");
});
