// The detector's scoring layer: one logistic model that turns the classifier's
// evidence and a few linguistic features into a calibrated P(AI).
// Pure functions (no model, no I/O) so they can be unit-tested and are shared
// by the production pipeline and the evaluation script (scripts/eval).
//
// A classifier's softmax output is not a probability you can report: a raw
// "0.97" does not mean 97 of 100 such texts are AI, and on writing unlike its
// training data (formal, academic, technical human text) the classifier is
// often confidently wrong. So its output is only one input here:
//
//   m = classifier logit margin (AI minus human)     L = ln(words / 100)
//   z = [ m, 1, m * L, standardized style features... ]
//   P(AI) = sigmoid( w . z )
//
// The weights w are fitted on the calibration half of a labeled dataset. The
// m * L term lets the data decide how much to trust the classifier at a given
// length (short texts are pulled towards 50%). Style features are standardized
// with the training mean and spread, and a missing value (text too short to
// measure it) is treated as average, so it has no effect.

import { STYLE_FEATURES } from "./features.js";

export function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

function lengthTerm(words) {
  return Math.log(Math.max(words, 1) / 100);
}

/**
 * @param {{margin:number, words:number, style?:Object}} s
 * @param {{features:string[], means:Object, sds:Object}} spec
 */
function featureVector(s, spec) {
  const L = lengthTerm(s.words);
  const z = [s.margin, 1, s.margin * L];
  for (const f of spec.features) {
    const v = s.style?.[f];
    z.push(v === null || v === undefined || !Number.isFinite(v) ? 0 : (v - spec.means[f]) / (spec.sds[f] || 1));
  }
  return z;
}

/** Calibrated P(AI) for one scored text or passage. */
export function calibrate(sample, params) {
  const z = featureVector(sample, params);
  return sigmoid(z.reduce((a, zi, i) => a + zi * params.weights[i], 0));
}

/**
 * Fits the scoring weights by maximum likelihood (damped Newton-Raphson on the
 * logistic loss) with Platt's smoothed targets, which keeps the fit finite
 * when the classes are almost perfectly separated. Style weights get a
 * stronger penalty than the classifier terms, so a feature only gets weight
 * when the data clearly supports it.
 *
 * @param {{margin:number, words:number, style?:Object, label:0|1}[]} samples label 1 = AI
 */
export function fitCalibration(samples, { features = STYLE_FEATURES, iterations = 100, l2 = 1e-3, styleL2 = 2 } = {}) {
  const means = {};
  const sds = {};
  for (const f of features) {
    const vals = samples.map((s) => s.style?.[f]).filter((v) => v !== null && v !== undefined && Number.isFinite(v));
    const m = vals.reduce((a, b) => a + b, 0) / (vals.length || 1);
    means[f] = m;
    sds[f] = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (vals.length || 1)) || 1;
  }
  const spec = { features, means, sds };
  const nPos = samples.filter((s) => s.label === 1).length;
  const nNeg = samples.length - nPos;
  const hi = (nPos + 1) / (nPos + 2);
  const lo = 1 / (nNeg + 2);
  const rows = samples.map((s) => ({ f: featureVector(s, spec), t: s.label === 1 ? hi : lo }));
  const k = 3 + features.length;
  const penalty = Array.from({ length: k }, (_, i) => (i < 3 ? l2 : styleL2));

  const loss = (w) => {
    let total = 0;
    for (const { f, t } of rows) {
      const z = dot(w, f);
      total += softplus(z) - t * z;
    }
    return total + w.reduce((a, wi, i) => a + (penalty[i] / 2) * wi * wi, 0);
  };

  let w = Array.from({ length: k }, (_, i) => (i === 0 ? 1 : 0));
  let current = loss(w);
  for (let it = 0; it < iterations; it++) {
    const g = new Array(k).fill(0);
    const H = Array.from({ length: k }, () => new Array(k).fill(0));
    for (const { f, t } of rows) {
      const p = sigmoid(dot(w, f));
      const r = p - t;
      const v = Math.max(p * (1 - p), 1e-12);
      for (let i = 0; i < k; i++) {
        g[i] += r * f[i];
        for (let j = 0; j < k; j++) H[i][j] += v * f[i] * f[j];
      }
    }
    for (let i = 0; i < k; i++) {
      g[i] += penalty[i] * w[i];
      H[i][i] += penalty[i];
    }
    // Damped Newton: halve the step until the loss actually goes down.
    const step = solve(H, g);
    let scale = 1;
    let next = w;
    let nextLoss = Infinity;
    for (let n = 0; n < 40; n++, scale /= 2) {
      next = w.map((wi, i) => wi - scale * step[i]);
      nextLoss = loss(next);
      if (Number.isFinite(nextLoss) && nextLoss <= current) break;
    }
    if (!(nextLoss <= current)) break;
    const moved = Math.max(...step.map((s) => Math.abs(scale * s)));
    w = next;
    const improved = current - nextLoss;
    current = nextLoss;
    if (moved < 1e-9 || improved < 1e-10) break;
  }
  return { features, means, sds, weights: w };
}

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function softplus(z) {
  return z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z));
}

/** Gaussian elimination with partial pivoting. */
function solve(A, y) {
  const n = y.length;
  const m = A.map((row, i) => [...row, y[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col] / m[col][col];
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/**
 * Chooses the decision thresholds on calibrated probabilities.
 * - ai: the lowest value at which at most `maxFalsePositiveRate` of human
 *   texts would be called AI (false accusations are the costly error).
 * - human: the highest value at which at most `maxFalseNegativeRate` of AI
 *   texts would be called human.
 * Everything in between is Mixed / Uncertain.
 */
export function chooseThresholds(samples, { maxFalsePositiveRate = 0.01, maxFalseNegativeRate = 0.05 } = {}) {
  const human = samples.filter((s) => s.label === 0).map((s) => s.p).sort((x, y) => y - x);
  const ai = samples.filter((s) => s.label === 1).map((s) => s.p).sort((x, y) => x - y);
  const fpIndex = Math.floor(human.length * maxFalsePositiveRate);
  const fnIndex = Math.floor(ai.length * maxFalseNegativeRate);
  // Strictly above the (fpIndex)-th highest human score, never below 0.6.
  const aiThreshold = Math.min(0.99, Math.max(0.6, (human[fpIndex] ?? 0.6) + 1e-4));
  // Strictly below the (fnIndex)-th lowest AI score, never above 0.4.
  const humanThreshold = Math.max(0.01, Math.min(0.4, (ai[fnIndex] ?? 0.4) - 1e-4));
  return { ai: round(aiThreshold, 4), human: round(humanThreshold, 4) };
}

function round(n, d) {
  return Math.round(n * 10 ** d) / 10 ** d;
}

/** Integer percentages that always add up to exactly 100. */
export function toPercentages(pAi) {
  const ai = Math.min(100, Math.max(0, Math.round(pAi * 100)));
  return { ai, human: 100 - ai };
}

export function labelFor(p, thresholds) {
  if (p >= thresholds.ai) return "ai";
  if (p <= thresholds.human) return "human";
  return "inconclusive";
}

/**
 * AI or human for one calibrated probability. Because it is calibrated, 50%
 * is the point where both are equally likely.
 */
export function verdictFor(p) {
  return p >= 0.5 ? "ai" : "human";
}

/**
 * Confidence in a verdict from the calibrated probability that it is right
 * (for a calibrated model, the expected share of such calls that are
 * correct), capped for short texts because they carry little evidence.
 */
export function confidenceFor(pCorrect, words = Infinity) {
  let level = pCorrect >= 0.85 ? "high" : pCorrect >= 0.7 ? "medium" : "low";
  if (words < 60) level = "low";
  else if (words < 150 && level === "high") level = "medium";
  return level;
}

/**
 * Share of the analyzed words in AI and in Human sentence groups, as integers
 * that always add up to exactly 100. Groups that were not analyzed are left out.
 */
export function contentShares(groups) {
  let ai = 0;
  let human = 0;
  for (const g of groups) {
    if (g.classification === "ai") ai += g.words;
    else if (g.classification === "human") human += g.words;
  }
  if (!ai && !human) return { ai: 0, human: 100 };
  const aiPct = Math.round((ai / (ai + human)) * 100);
  return { ai: aiPct, human: 100 - aiPct };
}
