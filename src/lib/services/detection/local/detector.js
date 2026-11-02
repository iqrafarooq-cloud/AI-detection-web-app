import "server-only";
import { DETECTOR_MODEL, PERPLEXITY_MODEL, getDetector, getLanguageModel } from "./models";
import { countWords, splitSentences } from "@/lib/text/stats";

// ---------------------------------------------------------------------------
// Thresholds. All are documented on the "How it works" page.
// The model card states it is optimised for a 0.5 decision threshold.
// ---------------------------------------------------------------------------
export const METHOD = { chunkTokens: 256, sentenceWindow: 2 };

export const THRESHOLDS = {
  decision: 0.5,
  uncertainLow: 0.35,
  uncertainHigh: 0.65,
  sentenceFlag: 0.5,
  mixedHigh: 0.8,
  mixedLow: 0.2,
};

const BATCH = 8;
const MAX_SENTENCES = 200;
// Chunk size and sentence window were chosen by measurement (see How it works):
// 256-token chunks localise AI passages inside mixed documents far better than
// full 512-token windows, and ±2 sentences of context avoids the false flags
// that very short inputs cause.
const CHUNK_TOKENS = 256;
const SENTENCE_WINDOW = 2;

function softmaxAi(logitsRow) {
  // Numerically stable softmax over the logits row; returns P(AI).
  const max = Math.max(...logitsRow);
  const exps = logitsRow.map((l) => Math.exp(l - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps[DETECTOR_MODEL.aiLabelIndex] / sum;
}

/** Runs the classifier on a list of texts and returns P(AI) and raw logits for each. */
async function classify(texts) {
  const { tokenizer, model } = await getDetector();
  const results = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const inputs = await tokenizer(batch, { padding: true, truncation: true, max_length: DETECTOR_MODEL.maxTokens });
    const { logits } = await model(inputs);
    const [rows, cols] = logits.dims;
    const data = logits.data;
    for (let r = 0; r < rows; r++) {
      const row = Array.from(data.slice(r * cols, (r + 1) * cols), Number);
      results.push({ aiProbability: softmaxAi(row), logits: row });
    }
  }
  return results;
}

/**
 * Packs consecutive sentences into chunks that fit the model's 512-token window
 * (with a safety margin), so long documents are scored completely instead of
 * being silently truncated.
 */
async function buildChunks(sentences) {
  const { tokenizer } = await getDetector();
  const limit = Math.min(CHUNK_TOKENS, DETECTOR_MODEL.maxTokens - 32);
  const chunks = [];
  let current = { indices: [], tokens: 0 };
  for (let i = 0; i < sentences.length; i++) {
    const n = tokenizer.encode(sentences[i].text, { add_special_tokens: false }).length;
    if (current.indices.length && current.tokens + n > limit) {
      chunks.push(current);
      current = { indices: [], tokens: 0 };
    }
    current.indices.push(i);
    current.tokens += n;
  }
  if (current.indices.length) chunks.push(current);
  return chunks.map((c) => ({ ...c, text: c.indices.map((i) => sentences[i].text).join(" ") }));
}

/** Per-sentence perplexity under GPT-2: exp(mean negative log-likelihood of each token). */
async function sentencePerplexities(sentences) {
  const { tokenizer, model, Tensor } = await getLanguageModel();
  const out = [];
  for (const s of sentences) {
    const ids = [PERPLEXITY_MODEL.bosTokenId, ...tokenizer.encode(s.text, { add_special_tokens: false })].slice(0, PERPLEXITY_MODEL.maxTokens + 1);
    if (ids.length < 3) {
      out.push(null);
      continue;
    }
    const T = ids.length;
    const input_ids = new Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, T]);
    const attention_mask = new Tensor("int64", new BigInt64Array(T).fill(1n), [1, T]);
    const { logits } = await model({ input_ids, attention_mask });
    const V = logits.dims[2];
    const L = logits.data;
    let nll = 0;
    for (let t = 0; t < T - 1; t++) {
      const base = t * V;
      let max = -Infinity;
      for (let v = 0; v < V; v++) if (L[base + v] > max) max = L[base + v];
      let sum = 0;
      for (let v = 0; v < V; v++) sum += Math.exp(L[base + v] - max);
      nll -= L[base + ids[t + 1]] - max - Math.log(sum);
    }
    out.push({ perplexity: Math.exp(nll / (T - 1)), tokens: T - 1, nll });
  }
  return out;
}

function round(n, d = 4) {
  return n === null || n === undefined || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d;
}

/** Overall document score only - used by the humanizer re-check. */
export async function scoreDocument(text) {
  const sentences = splitSentences(text);
  const chunks = await buildChunks(sentences);
  const scored = await classify(chunks.map((c) => c.text));
  const totalTokens = chunks.reduce((a, c) => a + c.tokens, 0) || 1;
  return scored.reduce((a, r, i) => a + r.aiProbability * (chunks[i].tokens / totalTokens), 0);
}

/** Full report: document probability, sentence scores, AI share, perplexity and burstiness. */
export async function detectLocal(text) {
  const started = Date.now();
  const sentences = splitSentences(text);
  const analysed = sentences.slice(0, MAX_SENTENCES);

  // 1) Document-level probability: token-weighted mean over 512-token chunks.
  const chunks = await buildChunks(sentences);
  const chunkScores = await classify(chunks.map((c) => c.text));
  const totalTokens = chunks.reduce((a, c) => a + c.tokens, 0) || 1;
  const ai = chunkScores.reduce((a, r, i) => a + r.aiProbability * (chunks[i].tokens / totalTokens), 0);

  // 2) Sentence-level probability: each sentence is scored together with its
  //    neighbours, because single sentences are too short for reliable scores.
  //    A sentence is only flagged when its chunk also reads as AI, so sentence
  //    highlights never contradict the chunk-level result.
  const chunkOf = [];
  chunks.forEach((c, ci) => c.indices.forEach((i) => (chunkOf[i] = ci)));
  const windows = analysed.map((_, i) =>
    analysed
      .slice(Math.max(0, i - SENTENCE_WINDOW), i + SENTENCE_WINDOW + 1)
      .map((s) => s.text)
      .join(" ")
  );
  const windowScores = await classify(windows);

  // 3) Perplexity + burstiness under GPT-2.
  const ppl = await sentencePerplexities(analysed);
  const valid = ppl.filter(Boolean);
  const totalNll = valid.reduce((a, p) => a + p.nll, 0);
  const totalPplTokens = valid.reduce((a, p) => a + p.tokens, 0);
  const pplValues = valid.map((p) => p.perplexity);
  const meanPpl = pplValues.reduce((a, b) => a + b, 0) / (pplValues.length || 1);
  const sdPpl = Math.sqrt(pplValues.reduce((a, b) => a + (b - meanPpl) ** 2, 0) / (pplValues.length || 1));

  const sentenceResults = analysed.map((s, i) => ({
    text: s.text,
    start: s.start,
    end: s.end,
    aiProbability: round(windowScores[i].aiProbability),
    chunkAiProbability: round(chunkScores[chunkOf[i]].aiProbability),
    flagged: chunkScores[chunkOf[i]].aiProbability >= THRESHOLDS.decision && windowScores[i].aiProbability >= THRESHOLDS.sentenceFlag,
    perplexity: round(ppl[i]?.perplexity ?? null, 2),
  }));

  // AI share: fraction of words in flagged sentences.
  const words = sentenceResults.map((s) => countWords(s.text));
  const totalWords = words.reduce((a, b) => a + b, 0) || 1;
  const aiWords = sentenceResults.reduce((a, s, i) => a + (s.flagged ? words[i] : 0), 0);
  const aiShare = aiWords / totalWords;

  const hi = chunkScores.filter((c) => c.aiProbability >= THRESHOLDS.mixedHigh).length;
  const lo = chunkScores.filter((c) => c.aiProbability <= THRESHOLDS.mixedLow).length;
  let verdict;
  if (hi && lo) verdict = "mixed";
  else if (ai >= THRESHOLDS.uncertainHigh) verdict = "likely_ai";
  else if (ai <= THRESHOLDS.uncertainLow) verdict = "likely_human";
  else verdict = "uncertain";

  return {
    verdict,
    scores: { ai: round(ai), human: round(1 - ai), mixed: null },
    confidence: null,
    aiShare: round(aiShare),
    sentences: sentenceResults,
    sentencesTruncated: sentences.length > MAX_SENTENCES,
    chunks: chunks.map((c, i) => ({
      tokens: c.tokens,
      sentences: c.indices.length,
      aiProbability: round(chunkScores[i].aiProbability),
      logits: chunkScores[i].logits.map((l) => round(l, 3)),
    })),
    metrics: {
      perplexity: round(totalPplTokens ? Math.exp(totalNll / totalPplTokens) : null, 2),
      meanSentencePerplexity: round(meanPpl, 2),
      burstiness: round(sdPpl, 2),
      burstinessRatio: round(meanPpl ? sdPpl / meanPpl : null, 3),
      tokensScored: totalTokens,
    },
    models: {
      detector: { id: DETECTOR_MODEL.id, name: DETECTOR_MODEL.name, url: DETECTOR_MODEL.url, benchmark: DETECTOR_MODEL.benchmark },
      perplexity: { id: PERPLEXITY_MODEL.id, name: PERPLEXITY_MODEL.name, url: PERPLEXITY_MODEL.url },
    },
    thresholds: THRESHOLDS,
    elapsedMs: Date.now() - started,
    verdictBasis: `The AI probability is the softmax of the detector's output logits, averaged over ${chunks.length} chunk${chunks.length === 1 ? "" : "s"} of up to ${CHUNK_TOKENS} tokens (weighted by length). Verdict: 65% or above "likely AI", 35% or below "likely human", in between "uncertain", and "mixed" when one chunk scores 80% or more and another 20% or less.`,
  };
}
