import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calibrate,
  chooseThresholds,
  confidenceFor,
  contentShares,
  fitCalibration,
  labelFor,
  sigmoid,
  toPercentages,
  verdictFor,
} from "@/lib/services/detection/local/calibration";

test("percentages are integers and always add up to exactly 100", () => {
  for (let i = 0; i <= 1000; i++) {
    const { ai, human } = toPercentages(i / 1000);
    assert.equal(ai + human, 100);
    assert.ok(Number.isInteger(ai) && Number.isInteger(human));
  }
  assert.deepEqual(toPercentages(0.995), { ai: 100, human: 0 });
  assert.deepEqual(toPercentages(0.004), { ai: 0, human: 100 });
});

const sample = (margin, words, style) => ({ margin, words, style });
const logit = (p) => Math.log(p / (1 - p));

test("fitCalibration recovers a known length-aware mapping from labeled data", () => {
  // Labels drawn from a known true model: P(AI) = sigmoid((1.5 + 0.4 L) m - 0.3).
  const truth = { features: [], means: {}, sds: {}, weights: [1.5, -0.3, 0.4] };
  let seed = 7;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const samples = [];
  for (let i = 0; i < 6000; i++) {
    const s = sample(logit(0.02 + 0.96 * rand()), Math.round(20 + rand() * 600));
    samples.push({ ...s, label: rand() < calibrate(s, truth) ? 1 : 0 });
  }
  const fit = fitCalibration(samples, { features: [] });
  fit.weights.forEach((w, i) => assert.ok(Math.abs(w - truth.weights[i]) < 0.2, `w${i}=${w}`));
});

test("fitCalibration stays finite when the classifier's scores are (almost) perfectly separated", () => {
  // A confident classifier puts most texts at extreme margins. The previous
  // fit (on clipped probabilities) diverged to a ≈ 3.4 million here, turning
  // every probability into 0% or 100%.
  const samples = [];
  for (let i = 0; i < 400; i++) samples.push({ ...sample(-9 - (i % 7), 30 + ((i * 13) % 500)), label: 0 });
  for (let i = 0; i < 450; i++) samples.push({ ...sample(9 + (i % 5), 30 + ((i * 17) % 500)), label: 1 });
  samples.push({ ...sample(0.4, 80), label: 0 }, { ...sample(-0.8, 80), label: 1 });
  const fit = fitCalibration(samples, { features: [] });
  for (const v of fit.weights) assert.ok(Number.isFinite(v) && Math.abs(v) < 50, JSON.stringify(fit));
  const mid = calibrate(sample(0, 100), fit);
  assert.ok(mid > 0.3 && mid < 0.7, `margin 0 -> ${mid}`);
  assert.ok(calibrate(sample(11, 100), fit) > 0.95);
  assert.ok(calibrate(sample(-11, 100), fit) < 0.05);
});

test("calibration is monotonic in the classifier margin", () => {
  const params = { features: [], means: {}, sds: {}, weights: [0.6, 0.1, 0.2] };
  let prev = -1;
  for (let m = -8; m < 8; m += 0.25) {
    const p = calibrate(sample(m, 120), params);
    assert.ok(p > prev);
    prev = p;
  }
});

test("style features are standardized, and a missing value has no effect", () => {
  const params = { features: ["sentenceCv"], means: { sentenceCv: 0.5 }, sds: { sentenceCv: 0.2 }, weights: [1, 0, 0, -0.8] };
  const base = calibrate(sample(1, 100, { sentenceCv: null }), params);
  assert.equal(base, calibrate(sample(1, 100, { sentenceCv: 0.5 }), params));
  assert.ok(calibrate(sample(1, 100, { sentenceCv: 0.9 }), params) < base, "more varied sentences lower P(AI) with a negative weight");
});

test("fitCalibration learns a style feature only when it carries signal", () => {
  let seed = 11;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  const samples = [];
  for (let i = 0; i < 3000; i++) {
    const label = rand() < 0.5 ? 1 : 0;
    const margin = (label ? 1 : -1) + (rand() - 0.5) * 6;
    // Informative: AI texts have lower sentence-length variation. Noise: no relation.
    const style = { sentenceCv: (label ? 0.35 : 0.6) + (rand() - 0.5) * 0.3, noise: rand() };
    samples.push({ ...sample(margin, 200, style), label });
  }
  const fit = fitCalibration(samples, { features: ["sentenceCv", "noise"] });
  assert.ok(fit.weights[3] < -0.5, `sentenceCv weight ${fit.weights[3]}`);
  assert.ok(Math.abs(fit.weights[4]) < 0.15, `noise weight ${fit.weights[4]}`);
});

test("thresholds respect the false-positive target on the data they were chosen from", () => {
  const samples = [];
  for (let i = 0; i < 500; i++) samples.push({ p: sigmoid((i - 400) / 40), label: 0 });
  for (let i = 0; i < 500; i++) samples.push({ p: sigmoid((i - 100) / 40), label: 1 });
  const t = chooseThresholds(samples, { maxFalsePositiveRate: 0.01, maxFalseNegativeRate: 0.05 });
  const fp = samples.filter((s) => s.label === 0 && s.p >= t.ai).length;
  const fn = samples.filter((s) => s.label === 1 && s.p <= t.human).length;
  assert.ok(fp <= 5, `fp=${fp}`);
  assert.ok(fn <= 25, `fn=${fn}`);
  assert.ok(t.human <= 0.4 && t.ai >= 0.6);
});

test("every group and every text is called AI or human, split at a calibrated 50%", () => {
  assert.equal(verdictFor(0.5), "ai");
  assert.equal(verdictFor(0.4999), "human");
  assert.equal(verdictFor(0.97), "ai");
  assert.equal(verdictFor(0.02), "human");
  assert.equal(labelFor(0.5, { ai: 0.8, human: 0.25 }), "inconclusive");
});

test("confidence is the calibrated chance the verdict is right, capped for short texts", () => {
  assert.equal(confidenceFor(0.55, 400), "low");
  assert.equal(confidenceFor(0.3, 400), "low", "the whole text leans the other way");
  assert.equal(confidenceFor(0.75, 400), "medium");
  assert.equal(confidenceFor(0.95, 400), "high");
  assert.equal(confidenceFor(0.99, 35), "low");
  assert.equal(confidenceFor(0.99, 100), "medium");
});

test("AI and human shares are word-weighted, skip unanalyzed groups and always add up to 100", () => {
  const g = (classification, words) => ({ classification, words });
  assert.deepEqual(contentShares([g("ai", 50), g("human", 50)]), { ai: 50, human: 50 });
  assert.deepEqual(contentShares([g("ai", 30), g("not_analyzed", 500), g("human", 10)]), { ai: 75, human: 25 });
  assert.deepEqual(contentShares([g("ai", 1), g("human", 2)]), { ai: 33, human: 67 });
  assert.deepEqual(contentShares([]), { ai: 0, human: 100 });
  let seed = 3;
  const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < 500; i++) {
    const groups = Array.from({ length: 1 + Math.floor(rand() * 8) }, () => g(rand() < 0.5 ? "ai" : "human", 1 + Math.floor(rand() * 90)));
    const c = contentShares(groups);
    assert.equal(c.ai + c.human, 100);
    assert.ok(Number.isInteger(c.ai));
  }
});

test("typographic quotes are normalized one-to-one, so pasted and uploaded text score the same", async () => {
  const { normalizeForScoring, styleStats } = await import("@/lib/services/detection/local/features");
  const curly = "We’d been wandering. “Really?” she asked. Yes, we’d been wandering for years and years, honestly, which nobody believed at the time because it sounded made up and strange to everyone there.";
  const plain = "We'd been wandering. \"Really?\" she asked. Yes, we'd been wandering for years and years, honestly, which nobody believed at the time because it sounded made up and strange to everyone there.";
  assert.equal(normalizeForScoring(curly), plain);
  assert.equal(normalizeForScoring(curly).length, curly.length, "offsets into the original text stay valid");
  assert.deepEqual(styleStats(normalizeForScoring(curly)), styleStats(plain));
});
