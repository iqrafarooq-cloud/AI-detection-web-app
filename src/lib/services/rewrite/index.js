import { config } from "@/lib/config";
import { AppError } from "@/lib/server/http";
import { findMissingProtected } from "@/lib/analysis/preservation";
import { countWords } from "@/lib/text/stats";
import { matchTypography } from "@/lib/text/typography";
import { chunkText } from "@/lib/text/chunk";
import { anthropicProvider } from "./anthropic";
import { groqProvider } from "./groq";
import { RESTRUCTURE_SYSTEM, REFINE_SYSTEM, buildRestructurePrompt, buildRefinePrompt } from "./prompt";

// Register additional providers here. Interface: { id, name, isConfigured(cfg), modelName(cfg), generate({system, user}, cfg) }.
const REWRITE_PROVIDERS = { anthropic: anthropicProvider, groq: groqProvider };

export function getRewriteProvider(cfg = config.rewrite) {
  if (cfg.provider === "auto") {
    // First provider that has a key, in order of preference.
    return [anthropicProvider, groqProvider].find((p) => p.isConfigured(cfg)) || null;
  }
  const p = REWRITE_PROVIDERS[cfg.provider];
  return p && p.isConfigured(cfg) ? p : null;
}

export function getRewriteStatus(cfg = config.rewrite) {
  const p = getRewriteProvider(cfg);
  return p
    ? { configured: true, id: p.id, name: p.name, model: p.modelName(cfg), chunkChars: p.maxChunkChars(cfg) }
    : { configured: false, id: null, name: null, model: null, chunkChars: null };
}

/**
 * Two-step pipeline:
 *   1. Restructure - rewrite from the meaning, without the draft's AI patterns.
 *   2. Refine      - apply the chosen style with natural rhythm and voice.
 * Then: verify facts/citations survived, and re-check both versions with the
 * same AI detector the Detector page uses (when it is available for the text).
 *
 * When a detector is available, the text is checked first and only the parts
 * that read as AI-generated are rewritten. Sentences that already read as
 * human-written are kept exactly as the author wrote them: rewriting them with
 * a language model would turn the author's own writing into AI writing.
 */
export async function improveText(text, controls, { rewriteCfg = config.rewrite, scoreFn = null, detectFn = null } = {}) {
  const provider = getRewriteProvider(rewriteCfg);
  if (!provider) {
    throw new AppError(
      "rewrite_not_configured",
      "Writing improvement is not available because no language-model provider is configured on this server.",
      503
    );
  }

  // Which parts to rewrite: the AI-flagged sentence groups, or everything when
  // the detector can't judge the text.
  let detection = null;
  if (detectFn) {
    try {
      detection = await detectFn(text);
    } catch {
      detection = null;
    }
  }
  const spans = rewriteSpans(text, detection);

  const timing = { restructureMs: 0, refineMs: 0 };
  let model = null;
  let sections = 0;
  let improved = "";
  let cursor = 0;
  for (const span of spans) {
    improved += text.slice(cursor, span.start);
    const original = text.slice(span.start, span.end);
    const lead = original.match(/^\s*/)[0];
    const trail = original.match(/\s*$/)[0];
    const r = await rewriteBlock(provider, original.trim(), controls, rewriteCfg, timing);
    model = r.model ?? model;
    sections += r.sections;
    improved += lead + r.text + trail;
    cursor = span.end;
  }
  improved += text.slice(cursor);
  improved = matchTypography(text, improved.trim());

  const missing = findMissingProtected(text, improved);
  const before = detection?.status === "ok" ? detection.content.ai / 100 : null;
  const recheck = scoreFn ? await recheckScores(text, improved, scoreFn, before) : { available: false, reason: "The detector is not available on this server." };
  const rewrittenWords = spans.reduce((a, s) => a + countWords(text.slice(s.start, s.end)), 0);

  return {
    improvedText: improved,
    provider: { id: provider.id, name: provider.name, model },
    pipeline: [
      { step: "restructure", label: "Restructure sentences", ms: timing.restructureMs },
      { step: "refine", label: "Refine voice & rhythm", ms: timing.refineMs },
    ],
    sections,
    scope: {
      selective: Boolean(detection?.status === "ok"),
      rewrittenWords,
      totalWords: countWords(text),
      unchanged: spans.length === 0,
    },
    preservation: { missing, ok: missing.length === 0 },
    recheck,
  };
}

/**
 * Character ranges to rewrite. With a detection result: every run of
 * consecutive AI-labeled sentence groups (groups a long text skipped count as
 * AI only when the text as a whole reads as AI). Without one: the whole text.
 */
export function rewriteSpans(text, detection) {
  if (detection?.status !== "ok" || !Array.isArray(detection.segments) || !detection.segments.length) {
    return text.trim() ? [{ start: 0, end: text.length }] : [];
  }
  const isAi = (g) => g.classification === "ai" || (g.classification === "not_analyzed" && detection.classification === "ai");
  const spans = [];
  for (const g of detection.segments) {
    if (!isAi(g)) continue;
    const last = spans[spans.length - 1];
    if (last && /^\s*$/.test(text.slice(last.end, g.start))) last.end = g.end;
    else spans.push({ start: g.start, end: g.end });
  }
  return spans;
}

/** Rewrites one block of text, section by section for long blocks. */
async function rewriteBlock(provider, block, controls, rewriteCfg, timing) {
  // Long texts are rewritten section by section so each request stays within
  // the provider's per-request token budget. Chunks run sequentially (not in
  // parallel) so a tokens-per-minute limit can recover between calls.
  const chunks = chunkText(block, provider.maxChunkChars(rewriteCfg));
  let model = null;
  const out = [];
  for (const chunk of chunks) {
    if (!chunk.text.trim()) {
      out.push(chunk.text + chunk.sep);
      continue;
    }
    const t0 = Date.now();
    const step1 = await provider.generate({ system: RESTRUCTURE_SYSTEM, user: buildRestructurePrompt(chunk.text, controls), temperature: 0.8 }, rewriteCfg);
    const t1 = Date.now();
    const step2 = await provider.generate({ system: REFINE_SYSTEM, user: buildRefinePrompt(step1.text, controls), temperature: 0.9 }, rewriteCfg);
    timing.restructureMs += t1 - t0;
    timing.refineMs += Date.now() - t1;
    model = step2.model;
    out.push(step2.text + chunk.sep);
  }
  return { text: out.join("").trim(), model, sections: chunks.length };
}

async function recheckScores(original, improved, scoreFn, knownBefore = null) {
  if (countWords(original) < 20 || countWords(improved) < 20) {
    return { available: false, reason: "The re-check needs at least 20 words for a meaningful score." };
  }
  try {
    const [before, after] = await Promise.all([knownBefore ?? scoreFn(original), improved === original ? (knownBefore ?? scoreFn(original)) : scoreFn(improved)]);
    return { available: true, before, after, delta: after - before };
  } catch {
    return { available: false, reason: "The detector could not be loaded for the re-check. Try again shortly." };
  }
}
