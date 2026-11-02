import { config } from "@/lib/config";
import { AppError } from "@/lib/server/http";
import { findMissingProtected } from "@/lib/analysis/preservation";
import { countWords, looksEnglish } from "@/lib/text/stats";
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
 *   1. Restructure - rebuild sentence structure, remove filler and repetition.
 *   2. Refine      - apply the chosen style with natural rhythm and voice.
 * Then: verify facts/citations survived, and re-check both versions with the
 * same AI detector the Detector page uses (when it is available for the text).
 */
export async function improveText(text, controls, { rewriteCfg = config.rewrite, scoreFn = null } = {}) {
  const provider = getRewriteProvider(rewriteCfg);
  if (!provider) {
    throw new AppError(
      "rewrite_not_configured",
      "Writing improvement is not available because no language-model provider is configured on this server.",
      503
    );
  }

  // Long texts are rewritten section by section so each request stays within
  // the provider's per-request token budget. Chunks run sequentially (not in
  // parallel) so a tokens-per-minute limit can recover between calls.
  const chunks = chunkText(text, provider.maxChunkChars(rewriteCfg));
  let restructureMs = 0;
  let refineMs = 0;
  let model = null;
  const out = [];
  for (const chunk of chunks) {
    if (!chunk.text.trim()) {
      out.push(chunk.text + chunk.sep);
      continue;
    }
    const t0 = Date.now();
    const step1 = await provider.generate({ system: RESTRUCTURE_SYSTEM, user: buildRestructurePrompt(chunk.text, controls) }, rewriteCfg);
    const t1 = Date.now();
    const step2 = await provider.generate({ system: REFINE_SYSTEM, user: buildRefinePrompt(step1.text, controls) }, rewriteCfg);
    restructureMs += t1 - t0;
    refineMs += Date.now() - t1;
    model = step2.model;
    out.push(step2.text + chunk.sep);
  }
  const improved = matchTypography(text, out.join("").trim());

  const missing = findMissingProtected(text, improved);
  const recheck = scoreFn ? await recheckScores(text, improved, scoreFn) : { available: false, reason: "The detector is not available on this server." };

  return {
    improvedText: improved,
    provider: { id: provider.id, name: provider.name, model },
    pipeline: [
      { step: "restructure", label: "Restructure sentences", ms: restructureMs },
      { step: "refine", label: "Refine voice & rhythm", ms: refineMs },
    ],
    sections: chunks.length,
    preservation: { missing, ok: missing.length === 0 },
    recheck,
  };
}

async function recheckScores(original, improved, scoreFn) {
  if (!looksEnglish(original)) {
    return { available: false, reason: "The detector only supports English, so no re-check was run." };
  }
  if (countWords(original) < 40 || countWords(improved) < 40) {
    return { available: false, reason: "The re-check needs at least 40 words for a meaningful score." };
  }
  try {
    const [before, after] = await Promise.all([scoreFn(original), scoreFn(improved)]);
    return { available: true, before, after, delta: after - before };
  } catch {
    return { available: false, reason: "The detector could not be loaded for the re-check. Try again shortly." };
  }
}
