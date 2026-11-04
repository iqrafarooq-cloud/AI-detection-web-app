// Compares candidate detection models on the CALIBRATION split only (never
// the test split), plus scripts/eval/selection-ai-samples.json: fresh texts
// from a current AI model, used only for choosing a model.
//
//   node --import ./tests/setup/register.mjs scripts/eval/compare-models.mjs
//
// Reports AUROC, the share of AI texts caught when at most 5% of human texts
// are flagged, accuracy at P(AI) = 0.5, the mean P(AI) on the fresh samples,
// and the time per 256-token passage on this machine.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = process.cwd();
const t = await import("@huggingface/transformers");
t.env.cacheDir = path.join(ROOT, ".cache", "huggingface");
t.env.allowLocalModels = false;

export const CANDIDATES = [
  { id: "hbhanushali/fakespot-ai-detector-onnx", revision: "e2fddfefe101446f4626061424e156c9058092e0", dtype: "q8", head: "softmax", aiIndex: 1, name: "Fakespot RoBERTa-base (current)" },
  { id: "onnx-community/answerdotai-ModernBERT-base-ai-detector-ONNX", revision: "6f91c75ddff04093a1d9d364d0d525f863b0b694", dtype: "q8", head: "softmax", aiIndex: 1, name: "ModernBERT-base (DAIGT)" },
  { id: "batmac/gradient-ai-text-detector-onnx", revision: "776d0164ba0de631036c70f6a146d68a7cd4ea4e", dtype: "q4", head: "sigmoid", name: "Gradient DeBERTa-v3-large (q4)" },
];

const only = process.argv[2];
const dataset = JSON.parse(fs.readFileSync(path.join(ROOT, ".cache", "eval", "dataset.json"), "utf8"));
const pick = (list, n) => [...list].sort((a, b) => hash(a.id).localeCompare(hash(b.id))).slice(0, n);
const hash = (s) => crypto.createHash("sha256").update(s).digest("hex");
const cal = dataset.filter((s) => s.split === "calibration");
const human = pick(cal.filter((s) => s.label === "human"), 150);
const ai = pick(cal.filter((s) => s.label === "ai"), 150);
const modern = cal.filter((s) => s.label === "ai" && s.source === "artnitolog" && s.category === "natural");
const fresh = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "eval", "selection-ai-samples.json"), "utf8")).map((s, i) => ({ id: `fresh:${i}`, text: s.text, label: "ai" }));
const items = [...new Map([...human, ...ai, ...modern, ...fresh].map((s) => [s.id, s])).values()];

function auroc(pos, neg) {
  let wins = 0;
  for (const p of pos) for (const n of neg) wins += p > n ? 1 : p === n ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

const results = [];
for (const c of CANDIDATES.filter((x) => !only || x.id.includes(only))) {
  const tokenizer = await t.AutoTokenizer.from_pretrained(c.id, { revision: c.revision });
  const model = await t.AutoModelForSequenceClassification.from_pretrained(c.id, { revision: c.revision, dtype: c.dtype });
  const score = async (text) => {
    const { logits } = await model(await tokenizer(text, { truncation: true, max_length: 256 }));
    const row = Array.from(logits.data, Number);
    if (c.head === "sigmoid") return 1 / (1 + Math.exp(-row[0]));
    const m = Math.max(...row);
    const e = row.map((l) => Math.exp(l - m));
    return e[c.aiIndex] / e.reduce((a, b) => a + b, 0);
  };
  await score("Warm-up text for the model.");
  const p = new Map();
  const t0 = Date.now();
  for (const s of items) p.set(s.id, await score(s.text));
  const msPer = (Date.now() - t0) / items.length;
  const H = human.map((s) => p.get(s.id));
  const A = ai.map((s) => p.get(s.id));
  const M = modern.map((s) => p.get(s.id));
  const F = fresh.map((s) => p.get(s.id));
  const thr5 = [...H].sort((x, y) => y - x)[Math.floor(H.length * 0.05)];
  const r = {
    model: c.name,
    auroc: auroc(A, H).toFixed(3),
    aurocModern: auroc(M, H).toFixed(3),
    aurocFresh: auroc(F, H).toFixed(3),
    caughtAt5pctFpr: (A.filter((x) => x > thr5).length / A.length).toFixed(3),
    freshCaughtAt5pctFpr: (F.filter((x) => x > thr5).length / F.length).toFixed(3),
    accuracyAtHalf: ((H.filter((x) => x < 0.5).length + A.filter((x) => x >= 0.5).length) / (H.length + A.length)).toFixed(3),
    humanFlaggedAtHalf: (H.filter((x) => x >= 0.5).length / H.length).toFixed(3),
    freshMeanPAi: (F.reduce((a, b) => a + b, 0) / F.length).toFixed(3),
    msPerPassage: Math.round(msPer),
  };
  results.push(r);
  console.log(JSON.stringify(r));
}
console.table(results);
