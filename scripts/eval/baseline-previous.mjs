// Scores the evaluation test split with the PREVIOUS detection pipeline
// (commit 63345a1): the TMR RoBERTa detector's raw softmax, averaged over
// 256-token chunks, with fixed cut-offs (65% likely AI, 35% likely human,
// "mixed" when one chunk is >= 80% and another <= 20%, 40-word minimum).
// Kept only to report before/after numbers on the same texts.
//
//   node --import ./tests/setup/register.mjs scripts/eval/baseline-previous.mjs

import fs from "node:fs";
import path from "node:path";
import { splitSentences, countWords } from "../../src/lib/text/stats.js";

const ROOT = process.cwd();
const dataset = JSON.parse(fs.readFileSync(path.join(ROOT, ".cache", "eval", "dataset.json"), "utf8"));
const OUT = path.join(ROOT, ".cache", "eval", "baseline-previous.json");

const t = await import("@huggingface/transformers");
t.env.cacheDir = path.join(ROOT, ".cache", "huggingface");
const ID = "onnx-community/tmr-ai-text-detector-ONNX";
const tokenizer = await t.AutoTokenizer.from_pretrained(ID);
const model = await t.AutoModelForSequenceClassification.from_pretrained(ID, { dtype: "q8" });

async function score(text) {
  const sentences = splitSentences(text);
  const chunks = [];
  let cur = { texts: [], tokens: 0 };
  for (const s of sentences) {
    const n = tokenizer.encode(s.text, { add_special_tokens: false }).length;
    if (cur.texts.length && cur.tokens + n > 256) (chunks.push(cur), (cur = { texts: [], tokens: 0 }));
    cur.texts.push(s.text);
    cur.tokens += n;
  }
  if (cur.texts.length) chunks.push(cur);
  const probs = [];
  for (let i = 0; i < chunks.length; i += 8) {
    const batch = chunks.slice(i, i + 8).map((c) => c.texts.join(" "));
    const { logits } = await model(await tokenizer(batch, { padding: true, truncation: true, max_length: 512 }));
    const [rows, cols] = logits.dims;
    for (let r = 0; r < rows; r++) {
      const row = Array.from(logits.data.slice(r * cols, (r + 1) * cols), Number);
      const max = Math.max(...row);
      const e = row.map((l) => Math.exp(l - max));
      probs.push(e[1] / e.reduce((a, b) => a + b, 0));
    }
  }
  const total = chunks.reduce((a, c) => a + c.tokens, 0) || 1;
  const ai = probs.reduce((a, p, i) => a + p * (chunks[i].tokens / total), 0);
  const hi = probs.some((p) => p >= 0.8);
  const lo = probs.some((p) => p <= 0.2);
  const prediction = hi && lo ? "mixed" : ai >= 0.65 ? "ai" : ai <= 0.35 ? "human" : "inconclusive";
  return { ai, prediction };
}

const test = dataset.filter((s) => s.split === "test");
const results = [];
for (const [i, s] of test.entries()) {
  if (countWords(s.text) < 40) {
    results.push({ id: s.id, label: s.label, length: s.length, category: s.category, domain: s.domain, source: s.source, prediction: "no_result", pAi: null });
    continue;
  }
  const r = await score(s.text);
  results.push({ id: s.id, label: s.label, length: s.length, category: s.category, domain: s.domain, source: s.source, prediction: r.prediction, pAi: r.ai });
  if (i % 25 === 0) process.stdout.write(`\r  ${i}/${test.length}   `);
}
fs.writeFileSync(OUT, JSON.stringify(results));
console.log("\nWrote", path.relative(ROOT, OUT));
