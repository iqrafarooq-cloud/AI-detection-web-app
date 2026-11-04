// Calibrates and evaluates the local AI detector on labeled data.
//
//   node scripts/eval/build-dataset.mjs                                       # once: download + build the dataset
//   node --import ./tests/setup/register.mjs scripts/eval/evaluate.mjs fit    # fit calibration on the calibration split
//   node --import ./tests/setup/register.mjs scripts/eval/evaluate.mjs test   # evaluate the full pipeline on the test split
//
// "fit" writes src/lib/services/detection/local/calibration-data.js.
// "test" runs every test sample through analyzeText() - the same function the
// /api/analyze route calls - and writes docs/detector-evaluation.md.

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const MODE = process.argv[2];
// --sample N: use at most N human and N AI texts per split (chosen by a hash of
// the id, so the choice is reproducible). For slow models; all other labeled
// sets (fresh AI samples, grammar-corrected, mixed documents) are always kept.
const SAMPLE = Number(process.argv[process.argv.indexOf("--sample") + 1]) || 0;
function stratified(list) {
  if (!SAMPLE) return list;
  const keyed = (x) => crypto.createHash("sha256").update(x.id).digest("hex");
  const keep = new Set();
  for (const label of ["human", "ai"]) {
    const pool = list.filter((x) => x.label === label && (x.source === "MAGE" || x.source === "artnitolog"));
    for (const x of [...pool].sort((a, b) => keyed(a).localeCompare(keyed(b))).slice(0, SAMPLE)) keep.add(x.id);
  }
  return list.filter((x) => keep.has(x.id) || !(x.source === "MAGE" || x.source === "artnitolog") || x.label === "mixed");
}
const ROOT = process.cwd();
const DATASET = path.join(ROOT, ".cache", "eval", "dataset.json");
const CALIBRATION_FILE = path.join(ROOT, "src", "lib", "services", "detection", "local", "calibration-data.js");
const REPORT = path.join(ROOT, "docs", "detector-evaluation.md");
const RESULTS = path.join(ROOT, ".cache", "eval", "results.json");
const SCORES_CACHE = path.join(ROOT, ".cache", "eval", "calibration-scores.json");
const EVAL_SUMMARY_FILE = path.join(ROOT, "src", "lib", "services", "detection", "local", "evaluation-data.js");

if (!["fit", "test"].includes(MODE)) {
  console.error("Usage: evaluate.mjs fit|test");
  process.exit(1);
}
if (!fs.existsSync(DATASET)) {
  console.error("Dataset missing. Run: node scripts/eval/build-dataset.mjs");
  process.exit(1);
}
const dataset = JSON.parse(fs.readFileSync(DATASET, "utf8"));

function progress(i, n, t0) {
  const rate = (Date.now() - t0) / 1000 / Math.max(i, 1);
  process.stdout.write(`\r  ${i}/${n}  (~${Math.round(rate * (n - i))}s left)   `);
}

// ---------------------------------------------------------------------------
if (MODE === "fit") {
  const { rawScores } = await import("../../src/lib/services/detection/local/detector.js");
  const { DETECTOR_MODEL } = await import("../../src/lib/services/detection/local/model-config.js");
  const { STYLE_FEATURES } = await import("../../src/lib/services/detection/local/features.js");
  const { fitCalibration, calibrate, chooseThresholds } = await import("../../src/lib/services/detection/local/calibration.js");

  // Calibrate for the AI text people actually submit today: AI samples from
  // language models released before 2023 (OPT, Flan-T5, T0, GPT-J, GPT-NeoX,
  // BLOOM, GLM, LLaMA-1, text-davinci) are left out. Including them made the
  // calibration push every score towards "AI" to make up for old models the
  // detector rarely recognizes, which more than doubled false accusations of
  // human writers. They stay in the test set and are reported separately.
  const LEGACY_GENERATOR = /opt_|flan_t5|t0_|gpt_j|gpt_neox|bloom|GLM|^7B$|^13B$|^30B$|^65B$|text-davinci|opt_iml/;
  const samples = stratified(dataset.filter((s) => s.split === "calibration" && (s.label === "human" || s.label === "ai"))).filter(
    (s) => s.label === "human" || !LEGACY_GENERATOR.test(s.generator || "")
  );
  // Model outputs are cached per model build, so refitting (e.g. after a
  // change to the scoring layer) doesn't require re-running the model.
  // Entries store a hash of the exact text that was scored (after the
  // pipeline's normalization), so any change to the input invalidates them.
  const { normalizeForScoring } = await import("../../src/lib/services/detection/local/features.js");
  const textHash = (t) => crypto.createHash("sha256").update(normalizeForScoring(t)).digest("hex").slice(0, 16);
  const cacheKey = `v4:${DETECTOR_MODEL.id}@${DETECTOR_MODEL.revision}:${DETECTOR_MODEL.dtype}`;
  const cached = fs.existsSync(SCORES_CACHE) ? JSON.parse(fs.readFileSync(SCORES_CACHE, "utf8")) : null;
  const hashes = new Map(samples.map((s) => [s.id, textHash(s.text)]));
  const previous = cached?.key === cacheKey ? cached.scores : [];
  const known = new Map(previous.filter((r) => r.hash === hashes.get(r.id)).map((r) => [r.id, r]));
  const scored = [];
  const todo = samples.filter((s) => !known.has(s.id)).length;
  console.log(`Scoring ${todo} of ${samples.length} calibration samples with ${DETECTOR_MODEL.id} (${samples.length - todo} cached)...`);
  const t0 = Date.now();
  let done = 0;
  for (const s of samples) {
    let row = known.get(s.id);
    if (!row) {
      const r = await rawScores(s.text);
      row = {
        id: s.id,
        hash: hashes.get(s.id),
        margin: r.margin,
        words: r.words,
        style: r.style,
        groups: r.groups.filter((g) => g.margin !== null).map((g) => ({ margin: g.margin, words: g.words })),
      };
      known.set(s.id, row);
      if (++done % 10 === 0) {
        progress(done, todo, t0);
        fs.writeFileSync(SCORES_CACHE, JSON.stringify({ key: cacheKey, scores: [...known.values()] }));
      }
    }
    scored.push({ ...row, label: s.label === "ai" ? 1 : 0, group: s.id.replace(/:(human|ai)(:short)?$/, "") });
  }
  process.stdout.write("\n");
  fs.writeFileSync(SCORES_CACHE, JSON.stringify({ key: cacheKey, scores: [...known.values()] }));

  // Model selection by 5-fold cross-validation inside the calibration split.
  // Folds are grouped by prompt so a human text and the AI answer to the same
  // prompt are never on both sides. Criterion: log loss, and the false
  // positive rate at the thresholds each fold would choose.
  const folds = 5;
  const foldOf = (g) => [...g].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % folds;
  function crossValidate(features) {
    let logLoss = 0;
    let fp = 0;
    let humans = 0;
    let tp = 0;
    let ais = 0;
    let correctAtHalf = 0;
    for (let k = 0; k < folds; k++) {
      const train = scored.filter((s) => foldOf(s.group) !== k);
      const held = scored.filter((s) => foldOf(s.group) === k);
      const params = fitCalibration(train, { features });
      const thr = chooseThresholds(train.map((s) => ({ ...s, p: calibrate(s, params) })));
      for (const s of held) {
        const p = Math.min(1 - 1e-9, Math.max(1e-9, calibrate(s, params)));
        logLoss -= s.label ? Math.log(p) : Math.log(1 - p);
        if ((p >= 0.5) === (s.label === 1)) correctAtHalf++;
        if (s.label === 0) (humans++, (fp += p >= thr.ai ? 1 : 0));
        else (ais++, (tp += p >= thr.ai ? 1 : 0));
      }
    }
    return { features, logLoss: logLoss / scored.length, fpr: fp / humans, recall: tp / ais, accuracyAtHalf: correctAtHalf / scored.length };
  }
  const candidates = [crossValidate([]), crossValidate(STYLE_FEATURES)];
  console.table(candidates.map((c) => ({ features: c.features.join(", ") || "(classifier only)", logLoss: c.logLoss.toFixed(4), fpr: c.fpr.toFixed(4), recall: c.recall.toFixed(4), accuracyAtHalf: c.accuracyAtHalf.toFixed(4) })));
  // Prefer the simpler model unless the features clearly help without raising false positives.
  const [base, full] = candidates;
  const chosen = full.logLoss < base.logLoss - 0.005 && full.fpr <= base.fpr + 0.002 ? full : base;
  console.log("Chosen:", chosen.features.length ? "classifier + style features" : "classifier only");

  const params = fitCalibration(scored, { features: chosen.features });
  const withP = scored.map((s) => ({ ...s, p: calibrate(s, params) }));
  const targets = { maxFalsePositiveRate: 0.01, maxFalseNegativeRate: 0.05 };
  const thresholds = chooseThresholds(withP, targets);

  // Sentence groups get their own calibration (they are short excerpts, not
  // whole documents), fitted on every scored group of the calibration texts.
  // A group inherits its document's label; it is called AI at P(AI) >= 50%.
  const groupSamples = scored.flatMap((s) => s.groups.map((g) => ({ ...g, label: s.label })));
  const groupParams = fitCalibration(groupSamples, { features: [] });
  const calibration = {
    modelId: DETECTOR_MODEL.id,
    revision: DETECTOR_MODEL.revision,
    dtype: DETECTOR_MODEL.dtype,
    params: {
      features: params.features,
      means: roundObj(params.means),
      sds: roundObj(params.sds),
      weights: params.weights.map((w) => round(w, 6)),
    },
    thresholds,
    targets,
    groups: {
      params: { features: [], means: {}, sds: {}, weights: groupParams.weights.map((w) => round(w, 6)) },
      samples: groupSamples.length,
    },
    crossValidation: candidates.map((c) => ({ features: c.features, logLoss: round(c.logLoss, 4), fpr: round(c.fpr, 4), recall: round(c.recall, 4) })),
    samples: scored.length,
    humanSamples: scored.filter((s) => s.label === 0).length,
    aiSamples: scored.filter((s) => s.label === 1).length,
    fittedAt: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(
    CALIBRATION_FILE,
    `// Generated by scripts/eval/evaluate.mjs fit. Do not edit by hand; re-run the script instead.
export const CALIBRATION = ${JSON.stringify(calibration, null, 2)};
`
  );
  console.log("Wrote", path.relative(ROOT, CALIBRATION_FILE));
  console.log(JSON.stringify(calibration, null, 2));
  process.exit(0);
}

function roundObj(o) {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, round(v, 6)]));
}

// ---------------------------------------------------------------------------
const { analyzeText } = await import("../../src/lib/services/detection/index.js");
const { CALIBRATION, DETECTOR_MODEL } = await import("../../src/lib/services/detection/local/model-config.js");

// Writing type of each source domain, for the per-type breakdown.
const WRITING_TYPE = {
  sci: "academic", pubmed: "academic", essay: "academic essay",
  cnn: "professional / news", xsum: "professional / news", reuters: "professional / news", squad: "technical / expository",
  eli5: "informal / conversational", cmv: "informal / conversational", yelp: "informal / conversational", imdb: "informal / conversational",
  tldr: "informal / conversational", dialogsum: "informal / conversational",
  wp: "creative / narrative", roct: "creative / narrative", hswag: "creative / narrative",
};
const writingType = (s) =>
  s.category === "human-ai-grammar-corrected" ? "human + AI grammar correction" : s.source === "claude-samples" ? `claude: ${s.domain}` : WRITING_TYPE[s.domain] || s.domain;

const test = stratified(dataset.filter((s) => s.split === "test"));
console.log(`Evaluating ${test.length} test samples through analyzeText() with ${DETECTOR_MODEL.id}...`);
const results = [];
const t0 = Date.now();
for (const [i, s] of test.entries()) {
  const { detection: d } = await analyzeText(s.text, { provider: "local" });
  results.push({
    id: s.id,
    label: s.label,
    source: s.source,
    domain: s.domain,
    generator: s.generator,
    category: s.category,
    writingType: writingType(s),
    length: s.length,
    words: s.words,
    status: d.status,
    prediction: d.status === "ok" ? d.classification : "no_result",
    pAi: d.status === "ok" ? d.probabilities.ai : null,
    content: d.status === "ok" ? d.content : null,
    aiWordShare: s.aiWordShare ?? (s.label === "ai" ? 1 : s.label === "human" ? 0 : null),
    percentagesSum: d.status === "ok" ? d.percentages.ai + d.percentages.human : null,
    confidence: d.status === "ok" ? d.confidence : null,
    elapsedMs: d.elapsedMs ?? null,
  });
  if (i % 10 === 0) progress(i, test.length, t0);
}
process.stdout.write("\n");
fs.writeFileSync(RESULTS, JSON.stringify(results));

// Consistency: the same input must give the same result.
let deterministic = true;
for (const s of test.slice(0, 20)) {
  const again = (await analyzeText(s.text, { provider: "local" })).detection;
  const first = results.find((r) => r.id === s.id);
  if ((again.status === "ok" ? again.probabilities.ai : null) !== first.pAi || (again.status === "ok" ? again.classification : "no_result") !== first.prediction) {
    deterministic = false;
  }
}

// --- Metrics -----------------------------------------------------------------
const PRED = ["ai", "human", "mixed", "inconclusive", "no_result"];
const binary = results.filter((r) => r.label === "human" || r.label === "ai");
const mixedDocs = results.filter((r) => r.label === "mixed");

function metrics(rows) {
  const h = rows.filter((r) => r.label === "human");
  const a = rows.filter((r) => r.label === "ai");
  const count = (list, preds) => list.filter((r) => preds.includes(r.prediction)).length;
  // Positive class = AI. "Flagged" = AI-Written or Mixed (any AI accusation).
  const tp = count(a, ["ai"]);
  const fn = count(a, ["human"]);
  const fp = count(h, ["ai", "mixed"]);
  const tn = count(h, ["human"]);
  const decided = tp + fn + fp + tn + count(a, ["mixed"]);
  const correct = tp + tn;
  const precision = tp + fp ? tp / (tp + fp) : null;
  const recall = a.length ? tp / a.length : null;
  return {
    n: rows.length,
    humans: h.length,
    ais: a.length,
    accuracyAll: rows.length ? correct / rows.length : null,
    accuracyDecided: decided ? correct / decided : null,
    coverage: rows.length ? decided / rows.length : null,
    precision,
    recall,
    f1: precision !== null && recall ? (2 * precision * recall) / (precision + recall) : null,
    fpr: h.length ? fp / h.length : null,
    fnr: a.length ? fn / a.length : null,
    humanInconclusive: h.length ? count(h, ["inconclusive"]) / h.length : null,
    aiInconclusive: a.length ? count(a, ["inconclusive"]) / a.length : null,
  };
}

function calibrationQuality(rows) {
  const valid = rows.filter((r) => r.pAi !== null);
  const y = (r) => (r.label === "ai" ? 1 : 0);
  const brier = valid.reduce((s, r) => s + (r.pAi - y(r)) ** 2, 0) / valid.length;
  let ece = 0;
  for (let b = 0; b < 10; b++) {
    const bin = valid.filter((r) => Math.min(9, Math.floor(r.pAi * 10)) === b);
    if (!bin.length) continue;
    const conf = bin.reduce((s, r) => s + r.pAi, 0) / bin.length;
    const acc = bin.reduce((s, r) => s + y(r), 0) / bin.length;
    ece += (bin.length / valid.length) * Math.abs(conf - acc);
  }
  return { brier, ece };
}

function confusion(rows, labels) {
  return labels.map((label) => {
    const list = rows.filter((r) => r.label === label);
    return [label, ...PRED.map((p) => list.filter((r) => r.prediction === p).length), list.length];
  });
}

const groupBy = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    const k = typeof key === "function" ? key(r) : r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return [...m.entries()].sort((x, y) => String(x[0]).localeCompare(String(y[0])));
};

const pct = (n) => (n === null || n === undefined ? "-" : `${(n * 100).toFixed(1)}%`);
const overall = metrics(binary);
const cal = calibrationQuality(binary);
const sumsOk = results.every((r) => r.percentagesSum === null || r.percentagesSum === 100);
const latency = results.map((r) => r.elapsedMs).filter(Boolean).sort((a, b) => a - b);

const lines = [];
lines.push("# Detector evaluation");
lines.push("");
lines.push("Generated by `scripts/eval/evaluate.mjs test`. Do not edit by hand; re-run the script instead.");
lines.push("");
lines.push(`- Model: \`${DETECTOR_MODEL.id}\` (${DETECTOR_MODEL.dtype})`);
lines.push(`- Calibration: fitted on ${CALIBRATION.samples} labeled texts (${CALIBRATION.humanSamples} human, ${CALIBRATION.aiSamples} AI) on ${CALIBRATION.fittedAt}`);
lines.push(`- Sentence groups: AI at calibrated P(AI) >= 50%, human below; verdict: the larger share of the words`);
lines.push(`- Test set: ${binary.length} labeled texts (${overall.humans} human, ${overall.ais} AI) and ${mixedDocs.length} mixed documents, disjoint from the calibration texts`);
lines.push(`- Run on ${new Date().toISOString().slice(0, 10)} through \`analyzeText()\`, the function behind \`/api/analyze\``);
lines.push(`- AI % + Human % = 100 for every result: ${sumsOk ? "yes" : "NO"}`);
lines.push(`- Same input gives the same result (20 texts scored twice): ${deterministic ? "yes" : "NO"}`);
lines.push(`- Median detection time: ${latency.length ? Math.round(latency[Math.floor(latency.length / 2)]) : "-"} ms (this machine, CPU)`);
lines.push("");
lines.push("## Overall (human vs AI texts)");
lines.push("");
lines.push("Positive class = AI. A false positive is a human text with the verdict Likely AI-Generated. Every text gets a verdict, so accuracy on all texts and on decided texts are the same.");
lines.push("");
lines.push("| Metric | Value |");
lines.push("|---|---|");
lines.push(`| Accuracy (all texts, Inconclusive counted as wrong) | ${pct(overall.accuracyAll)} |`);
lines.push(`| Accuracy (decided texts only) | ${pct(overall.accuracyDecided)} |`);
lines.push(`| Coverage (texts not Inconclusive) | ${pct(overall.coverage)} |`);
lines.push(`| Precision (AI-Written) | ${pct(overall.precision)} |`);
lines.push(`| Recall (AI-Written) | ${pct(overall.recall)} |`);
lines.push(`| F1 score | ${pct(overall.f1)} |`);
lines.push(`| **False positive rate** (human -> AI-Written or Mixed) | **${pct(overall.fpr)}** |`);
lines.push(`| False negative rate (AI -> Human-Written) | ${pct(overall.fnr)} |`);
lines.push(`| Human texts marked Inconclusive | ${pct(overall.humanInconclusive)} |`);
lines.push(`| AI texts marked Inconclusive | ${pct(overall.aiInconclusive)} |`);
lines.push(`| Brier score (calibrated P(AI), lower is better) | ${cal.brier.toFixed(3)} |`);
lines.push(`| Expected calibration error (10 bins) | ${pct(cal.ece)} |`);
lines.push("");
// Before / after: the previous pipeline (scripts/eval/baseline-previous.mjs) on the same test texts.
const BASELINE = path.join(ROOT, ".cache", "eval", "baseline-previous.json");
let baseline = null;
if (fs.existsSync(BASELINE)) {
  const prev = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const tested = new Set(results.map((r) => r.id));
  const prevBinary = prev.filter((r) => (r.label === "human" || r.label === "ai") && tested.has(r.id));
  const humanAt50 = (rows) => rows.filter((r) => r.label === "human" && r.pAi !== null && r.pAi >= 0.5).length / rows.filter((r) => r.label === "human" && r.pAi !== null).length;
  baseline = { overall: metrics(prevBinary), humanScoredAbove50: humanAt50(prevBinary), byType: {} };
  const typeOf = new Map(results.map((r) => [r.id, r.writingType]));
  for (const [g, list] of groupBy(prevBinary.map((r) => ({ ...r, writingType: typeOf.get(r.id) })), "writingType")) baseline.byType[g] = metrics(list);
  const nowAbove50 = binary.filter((r) => r.label === "human" && r.pAi !== null && r.pAi >= 0.5).length / binary.filter((r) => r.label === "human" && r.pAi !== null).length;
  lines.push("## Before and after (same test texts)");
  lines.push("");
  lines.push("Before = the previous pipeline (TMR RoBERTa raw softmax, fixed 65% / 35% cut-offs, 40-word minimum). After = this pipeline.");
  lines.push("");
  lines.push("| Metric | Before | After |");
  lines.push("|---|---|---|");
  const b = baseline.overall;
  lines.push(`| **False positive rate** (human -> AI or Mixed) | **${pct(b.fpr)}** | **${pct(overall.fpr)}** |`);
  lines.push(`| Human texts shown with AI likelihood >= 50% | ${pct(baseline.humanScoredAbove50)} | ${pct(nowAbove50)} |`);
  lines.push(`| False negative rate (AI -> Human) | ${pct(b.fnr)} | ${pct(overall.fnr)} |`);
  lines.push(`| Precision | ${pct(b.precision)} | ${pct(overall.precision)} |`);
  lines.push(`| Recall | ${pct(b.recall)} | ${pct(overall.recall)} |`);
  lines.push(`| F1 | ${pct(b.f1)} | ${pct(overall.f1)} |`);
  lines.push(`| Accuracy (all texts) | ${pct(b.accuracyAll)} | ${pct(overall.accuracyAll)} |`);
  lines.push(`| Coverage (decided results) | ${pct(b.coverage)} | ${pct(overall.coverage)} |`);
  lines.push("");
  lines.push("False positive rate on human texts by writing type:");
  lines.push("");
  lines.push("| Writing type | Human n | Before | After |");
  lines.push("|---|---|---|---|");
  for (const [g, list] of groupBy(binary, "writingType")) {
    const m = metrics(list);
    if (!m.humans) continue;
    lines.push(`| ${g} | ${m.humans} | ${pct(baseline.byType[g]?.fpr)} | ${pct(m.fpr)} |`);
  }
  lines.push("");
  baseline.humanAbove50After = nowAbove50;
}

lines.push("## Confusion matrix");
lines.push("");
lines.push(`| True \\ Predicted | ${PRED.map((p) => p.replace("_", " ")).join(" | ")} | Total |`);
lines.push(`|---|${PRED.map(() => "---").join("|")}|---|`);
for (const row of confusion(results, ["human", "ai", "mixed"])) lines.push(`| ${row.join(" | ")} |`);
lines.push("");

function breakdown(title, key, rows = binary) {
  lines.push(`## By ${title}`);
  lines.push("");
  lines.push("| Group | Human n | AI n | Accuracy (all) | Precision | Recall | FPR | FNR | Inconclusive |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const [g, list] of groupBy(rows, key)) {
    const m = metrics(list);
    const inc = list.filter((r) => r.prediction === "inconclusive").length / list.length;
    lines.push(`| ${g} | ${m.humans} | ${m.ais} | ${pct(m.accuracyAll)} | ${pct(m.precision)} | ${pct(m.recall)} | ${pct(m.fpr)} | ${pct(m.fnr)} | ${pct(inc)} |`);
  }
  lines.push("");
}
breakdown("length", (r) => ({ short: "short (20-59 words)", medium: "medium (60-249 words)", long: "long (250+ words)" })[r.length]);
breakdown("writing type", "writingType");
breakdown("source / domain", (r) => `${r.source}: ${r.domain}`);
breakdown("text category", "category");
breakdown("AI generator (AI texts only)", (r) => r.generator || "(human)", binary.filter((r) => r.label === "ai"));

lines.push("## Confidence by length");
lines.push("");
lines.push("| Length | High | Medium | Low | No result |");
lines.push("|---|---|---|---|---|");
for (const [g, list] of groupBy(binary, "length")) {
  const c = (v) => list.filter((r) => r.confidence === v).length;
  lines.push(`| ${g} | ${c("high")} | ${c("medium")} | ${c("low")} | ${list.filter((r) => r.status !== "ok").length} |`);
}
lines.push("");

// Content breakdown: how much of each text the sentence groups call AI.
const avg = (xs) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null);
const withContent = results.filter((r) => r.content);
const contentStats = {
  humanDocs: { aiContent: avg(withContent.filter((r) => r.label === "human").map((r) => r.content.ai / 100)), humanContent: avg(withContent.filter((r) => r.label === "human").map((r) => r.content.human / 100)) },
  aiDocs: { aiContent: avg(withContent.filter((r) => r.label === "ai").map((r) => r.content.ai / 100)), humanContent: avg(withContent.filter((r) => r.label === "ai").map((r) => r.content.human / 100)) },
};
lines.push("## Content breakdown");
lines.push("");
lines.push("Average share of the words that sentence groups labeled AI or Human.");
lines.push("");
lines.push("| Texts | AI content | Human content |");
lines.push("|---|---|---|");
lines.push(`| Human-written | ${pct(contentStats.humanDocs.aiContent)} | ${pct(contentStats.humanDocs.humanContent)} |`);
lines.push(`| AI-generated | ${pct(contentStats.aiDocs.aiContent)} | ${pct(contentStats.aiDocs.humanContent)} |`);
lines.push("");

lines.push("## Mixed documents");
lines.push("");
lines.push("Human paragraphs and AI paragraphs answering the same prompt, joined into one document at a known AI share of the words. The detector does not know the share; the table compares its estimate with the truth.");
lines.push("");
lines.push("| True AI share | Docs | Estimated AI content (mean) | Estimated human content (mean) | Mean absolute error of AI share | Verdict AI |");
lines.push("|---|---|---|---|---|---|");
const mixedByRatio = groupBy(mixedDocs.filter((r) => r.content), (r) => `${Math.round(r.aiWordShare * 10) * 10}%`);
const mixedSummary = {};
for (const [g, list] of mixedByRatio) {
  const mae = avg(list.map((r) => Math.abs(r.content.ai / 100 - r.aiWordShare)));
  const est = avg(list.map((r) => r.content.ai / 100));
  const estH = avg(list.map((r) => r.content.human / 100));
  const verdictAi = list.filter((r) => r.prediction === "ai").length / list.length;
  mixedSummary[g] = { n: list.length, estimatedAi: round(est, 4), estimatedHuman: round(estH, 4), mae: round(mae, 4), verdictAi: round(verdictAi, 4) };
  lines.push(`| ${g} | ${list.length} | ${pct(est)} | ${pct(estH)} | ${pct(mae)} | ${pct(verdictAi)} |`);
}
lines.push("");

fs.mkdirSync(path.dirname(REPORT), { recursive: true });
fs.writeFileSync(REPORT, lines.join("\n"));
console.log(lines.join("\n"));
console.log("\nWrote", path.relative(ROOT, REPORT));

// Summary for the "How it works" page, so the site never shows hand-copied numbers.
const byLength = Object.fromEntries(groupBy(binary, "length").map(([g, list]) => [g, metrics(list)]));

const summary = {
  modelId: DETECTOR_MODEL.id,
  evaluatedAt: new Date().toISOString().slice(0, 10),
  testTexts: binary.length,
  humanTexts: overall.humans,
  aiTexts: overall.ais,
  mixedTexts: mixedDocs.length,
  overall: roundAll(overall),
  calibration: roundAll(cal),
  byLength: Object.fromEntries(Object.entries(byLength).map(([k, v]) => [k, roundAll(v)])),
  content: { humanDocs: roundAll(contentStats.humanDocs), aiDocs: roundAll(contentStats.aiDocs) },
  mixed: mixedSummary,
  baseline: baseline
    ? { overall: roundAll(baseline.overall), humanScoredAbove50: round(baseline.humanScoredAbove50, 4), humanScoredAbove50After: round(baseline.humanAbove50After, 4) }
    : null,
  byWritingType: Object.fromEntries(groupBy(binary, "writingType").map(([g, list]) => [g, roundAll(metrics(list))])),
  confusion: confusion(results, ["human", "ai", "mixed"]).map(([label, ...counts]) => ({ label, ...Object.fromEntries(PRED.map((p, i) => [p, counts[i]])), total: counts[PRED.length] })),
};
fs.writeFileSync(
  EVAL_SUMMARY_FILE,
  `// Generated by scripts/eval/evaluate.mjs test. Do not edit by hand; re-run the script instead.\nexport const EVALUATION = ${JSON.stringify(summary, null, 2)};\n`
);
console.log("Wrote", path.relative(ROOT, EVAL_SUMMARY_FILE));

function roundAll(obj) {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === "number" && !Number.isInteger(v) ? round(v, 4) : v]));
}

function round(n, d) {
  return Math.round(n * 10 ** d) / 10 ** d;
}
