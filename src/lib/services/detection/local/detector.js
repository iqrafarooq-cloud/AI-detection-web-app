import "server-only";
import { DETECTOR_MODEL, getDetector } from "./models";
import { CALIBRATION } from "./model-config";
import { calibrate, confidenceFor, contentShares, verdictFor } from "./calibration";
import { normalizeForScoring, styleStats } from "./features";
import { countWords, splitSentences } from "@/lib/text/stats";
import { AppError } from "@/lib/server/http";

// One model pass per text. The text is split into groups of consecutive whole
// sentences of up to GROUP_TOKENS tokens. Each group is scored once by the
// classifier; the same scores give
//   - the AI / Human share of the text and the sentence highlights (each group
//     calibrated on its own and labeled AI or Human; every sentence in it
//     shares that label), and
//   - the confidence (token-weighted mean of the group scores, then the
//     document calibration).
// Single sentences carry too little evidence to be scored alone, so a group
// of a few sentences (up to GROUP_TOKENS) is the smallest unit judged.
export const GROUP_TOKENS = 256;
// Speed: the model costs ~10 ms per token on a typical CPU. Texts longer than this
// budget are scored on evenly spaced groups that fit in it (the rest is shown
// as not analyzed), so a result arrives in seconds whatever the length.
export const MAX_SCORED_TOKENS = Number(process.env.DETECTION_MAX_TOKENS) > 0 ? Number(process.env.DETECTION_MAX_TOKENS) : 768;
const MAX_SENTENCES = 3000;

/** Packs consecutive sentences into groups that fit GROUP_TOKENS. */
async function buildGroups(text) {
  const { tokenizer } = await getDetector();
  const sentences = splitSentences(text).slice(0, MAX_SENTENCES);
  const groups = [];
  let current = null;
  for (const s of sentences) {
    const n = tokenizer.encode(s.text, { add_special_tokens: false }).length;
    if (current && current.tokens + n > GROUP_TOKENS) {
      groups.push(current);
      current = null;
    }
    current ??= { start: s.start, end: s.end, tokens: 0, sentences: [] };
    current.sentences.push({ start: s.start, end: s.end, words: countWords(s.text) });
    current.end = s.end;
    current.tokens += Math.min(n, DETECTOR_MODEL.maxTokens - 2);
  }
  if (current) groups.push(current);
  return groups.map((g) => {
    const groupText = text.slice(g.start, g.end).replace(/\s*\n+\s*/g, " ");
    return { ...g, text: groupText, words: g.sentences.reduce((a, s) => a + s.words, 0) };
  });
}

/** Indices of the groups to score: all of them, or an evenly spaced, deterministic subset within the token budget. */
export function selectGroups(groups, budget) {
  const total = groups.reduce((a, g) => a + g.tokens, 0);
  if (total <= budget) return groups.map((_, i) => i);
  const avg = total / groups.length;
  const m = Math.max(1, Math.min(groups.length, Math.floor(budget / avg)));
  const picked = new Set();
  for (let i = 0; i < m; i++) picked.add(Math.floor(((i + 0.5) * groups.length) / m));
  return [...picked].sort((a, b) => a - b);
}

/** The classifier's logit margin (AI minus human) for each text, one at a time (faster than padded batches on CPU). */
async function modelMargins(texts) {
  const { tokenizer, model } = await getDetector();
  const out = [];
  for (const t of texts) {
    const { logits } = await model(await tokenizer(t, { truncation: true, max_length: DETECTOR_MODEL.maxTokens }));
    const row = Array.from(logits.data, Number);
    // Logit margin of AI over human: the single logit of a sigmoid head, or the
    // difference of the two logits of a softmax head.
    out.push(DETECTOR_MODEL.head === "sigmoid" ? row[0] : row[DETECTOR_MODEL.aiLabelIndex] - row[1 - DETECTOR_MODEL.aiLabelIndex]);
  }
  return out;
}

/**
 * Everything the scoring layer needs for a document, from one model pass.
 * Used by the pipeline and by the calibration fit in scripts/eval, so both
 * always score text the same way.
 */
export async function rawScores(input, { budget = MAX_SCORED_TOKENS } = {}) {
  const text = normalizeForScoring(input);
  const groups = await buildGroups(text);
  const selected = selectGroups(groups, budget);
  const margins = await modelMargins(selected.map((i) => groups[i].text));
  const byIndex = new Map(selected.map((i, k) => [i, margins[k]]));
  const scored = selected.map((i) => groups[i]);
  const scoredTokens = scored.reduce((a, g) => a + g.tokens, 0) || 1;
  const margin = scored.reduce((a, g, k) => a + margins[k] * (g.tokens / scoredTokens), 0);
  return {
    margin,
    words: scored.reduce((a, g) => a + g.words, 0),
    totalWords: countWords(text),
    style: styleStats(text),
    groups: groups.map((g, i) => ({ ...g, margin: byIndex.has(i) ? byIndex.get(i) : null })),
  };
}

function requireCalibration() {
  if (!CALIBRATION) {
    // Never report uncalibrated numbers as probabilities.
    throw new AppError(
      "not_calibrated",
      "The detection model has not been calibrated on this server, so no reliable probability can be given. The operator needs to run the calibration script.",
      503
    );
  }
  return CALIBRATION;
}

/** Calibrated document P(AI) only - used by the humanizer re-check. */
export async function scoreDocument(text) {
  const { params } = requireCalibration();
  return calibrate(await rawScores(text), params);
}

const VERDICT_TEXT = {
  ai: "Most of the text has word-sequence patterns the model associates with AI-generated writing.",
  human: "Most of the text has word-sequence patterns the model associates with human writing.",
};

function summaryFor(classification, content) {
  const parts = [VERDICT_TEXT[classification]];
  if (content.ai >= 15 && content.human >= 15) {
    parts.push("Some sentence groups read as AI-generated while others read as human-written, so the text may combine both or be AI-edited.");
  }
  parts.push("These are statistical estimates, not proof of authorship.");
  return parts.join(" ");
}

/** Full result: verdict, AI / Human share of the text, confidence and sentence-level labels. */
export async function detectLocal(text) {
  const started = Date.now();
  const { params, groups: groupCal, fittedAt, samples } = requireCalibration();
  const scores = await rawScores(text);

  // Each sentence group is labeled AI or Human by its own calibrated probability.
  const segments = scores.groups.map((g) => {
    if (g.margin === null) return { start: g.start, end: g.end, words: g.words, sentences: g.sentences.length, aiProbability: null, classification: "not_analyzed" };
    const p = calibrate({ margin: g.margin, words: g.words }, groupCal.params);
    return { start: g.start, end: g.end, words: g.words, sentences: g.sentences.length, aiProbability: round(p), classification: verdictFor(p) };
  });
  // The headline numbers: share of the analyzed words in AI and in Human groups.
  const content = contentShares(segments);
  const classification = content.ai >= 50 ? "ai" : "human";
  // Confidence: the calibrated probability of the whole text agreeing with the verdict.
  const pAi = calibrate(scores, params);
  const sentences = scores.groups.flatMap((g, gi) => g.sentences.map((s) => ({ start: s.start, end: s.end, words: s.words, group: gi, classification: segments[gi].classification })));
  const analyzed = segments.filter((s) => s.classification !== "not_analyzed");

  return {
    classification,
    percentages: content,
    content,
    probabilities: { ai: round(pAi), human: round(1 - pAi) },
    confidence: confidenceFor(classification === "ai" ? pAi : 1 - pAi, scores.words),
    calibrated: true,
    explanation: summaryFor(classification, content),
    segments,
    sentences,
    coverage: {
      totalWords: scores.totalWords,
      analyzedWords: scores.words,
      sentences: sentences.length,
      analyzedSentences: analyzed.reduce((a, s) => a + s.sentences, 0),
      sampled: analyzed.length < segments.length,
    },
    model: { id: DETECTOR_MODEL.id, name: DETECTOR_MODEL.name, url: DETECTOR_MODEL.url },
    calibration: { samples, fittedAt },
    elapsedMs: Date.now() - started,
    basis: `The text was split into ${segments.length} group${segments.length === 1 ? "" : "s"} of whole sentences (up to ${GROUP_TOKENS} tokens each)${analyzed.length < segments.length ? `; it is long, so ${analyzed.length} evenly spaced groups were scored` : ""}. Each group was scored once by the classifier and calibrated on labeled human and AI texts: 50% or more is AI-generated, below 50% human-written. The AI and Human percentages are the shares of the analyzed words in each kind of group, and the verdict follows the larger share. Confidence is the calibrated probability of the whole text agreeing with the verdict.`,
  };
}

function round(n, d = 4) {
  return Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null;
}
