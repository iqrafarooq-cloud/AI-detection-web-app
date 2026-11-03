// Third-party AI-text detection adapters. Each adapter normalizes the provider's
// response into the same shape. Scores are passed through exactly as the
// provider reports them - nothing here invents or rescales probabilities.

import { AppError } from "@/lib/server/http";
import { detectLocal } from "./local/detector";
import { DETECTOR_MODEL } from "./local/models";

/**
 * @typedef {Object} NormalizedDetection
 * @property {"likely_ai"|"likely_human"|"mixed"|"uncertain"} verdict
 * @property {{ai:number|null, human:number|null, mixed:number|null}} scores  0..1, as reported
 * @property {string|null} confidence  provider-reported confidence label, if any
 * @property {Array<{text:string, aiProbability:number|null}>} sentences
 * @property {string} verdictBasis   human-readable explanation of how the verdict was derived
 */

async function fetchJson(url, init, timeoutMs, providerName) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const timeout = err?.name === "TimeoutError" || err?.name === "AbortError";
    throw new AppError(
      timeout ? "provider_timeout" : "provider_unreachable",
      timeout
        ? `${providerName} did not respond in time. Please try again.`
        : `Could not reach ${providerName}. Please try again later.`,
      502
    );
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    if (res.status === 429) {
      throw new AppError("provider_rate_limited", `${providerName} usage limit reached. Please try again later.`, 503);
    }
    if (res.status === 401 || res.status === 403) {
      throw new AppError("provider_auth", `${providerName} rejected the server's API key. The site operator needs to check the configuration.`, 502);
    }
    throw new AppError("provider_error", `${providerName} returned an error (HTTP ${res.status}).`, 502);
  }
  return body;
}

function clamp01(n) {
  return typeof n === "number" && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
}

// --- Sapling AI Detector ---------------------------------------------------
// Docs: https://sapling.ai/docs/api/detector  (POST /api/v1/aidetect)
export const saplingProvider = {
  id: "sapling",
  name: "Sapling AI Detector",
  url: "https://sapling.ai/ai-content-detector",
  minWords: 20,
  isConfigured: (cfg) => Boolean(cfg.saplingKey),
  async detect(text, cfg) {
    const body = await fetchJson(
      "https://api.sapling.ai/api/v1/aidetect",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: cfg.saplingKey, text, sent_scores: true }),
      },
      cfg.timeoutMs,
      "Sapling"
    );
    const ai = clamp01(body?.score);
    if (ai === null) {
      throw new AppError("provider_bad_response", "Sapling returned an unexpected response.", 502);
    }
    const sentences = Array.isArray(body.sentence_scores)
      ? body.sentence_scores.map((s) => ({
          text: String(s.sentence ?? ""),
          aiProbability: clamp01(s.score),
        }))
      : [];
    const high = sentences.filter((s) => s.aiProbability !== null && s.aiProbability >= 0.8).length;
    const low = sentences.filter((s) => s.aiProbability !== null && s.aiProbability <= 0.2).length;
    let verdict = "uncertain";
    if (sentences.length >= 4 && high / sentences.length >= 0.25 && low / sentences.length >= 0.25) verdict = "mixed";
    else if (ai >= 0.8) verdict = "likely_ai";
    else if (ai <= 0.2) verdict = "likely_human";
    return {
      verdict,
      scores: { ai, human: 1 - ai, mixed: null },
      confidence: null,
      sentences,
      verdictBasis:
        "Sapling reports a single AI-likelihood score. Detectly labels it \"likely AI-like\" at 0.80 or above, \"likely human-like\" at 0.20 or below, \"mixed\" when at least a quarter of sentences sit at each extreme, and \"uncertain\" otherwise.",
    };
  },
};

// --- GPTZero ----------------------------------------------------------------
// Docs: https://gptzero.me/docs  (POST /v2/predict/text)
export const gptzeroProvider = {
  id: "gptzero",
  name: "GPTZero",
  url: "https://gptzero.me",
  minWords: 20,
  isConfigured: (cfg) => Boolean(cfg.gptzeroKey),
  async detect(text, cfg) {
    const body = await fetchJson(
      "https://api.gptzero.me/v2/predict/text",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "x-api-key": cfg.gptzeroKey },
        body: JSON.stringify({ document: text }),
      },
      cfg.timeoutMs,
      "GPTZero"
    );
    const doc = body?.documents?.[0];
    if (!doc) {
      throw new AppError("provider_bad_response", "GPTZero returned an unexpected response.", 502);
    }
    const p = doc.class_probabilities || {};
    const predicted = String(doc.predicted_class || "").toLowerCase();
    const verdict =
      predicted === "ai" ? "likely_ai" : predicted === "human" ? "likely_human" : predicted === "mixed" ? "mixed" : "uncertain";
    return {
      verdict,
      scores: { ai: clamp01(p.ai), human: clamp01(p.human), mixed: clamp01(p.mixed) },
      confidence: doc.confidence_category ? String(doc.confidence_category) : null,
      sentences: Array.isArray(doc.sentences)
        ? doc.sentences.map((s) => ({ text: String(s.sentence ?? ""), aiProbability: clamp01(s.generated_prob) }))
        : [],
      verdictBasis: "Classification and confidence category are reported directly by GPTZero.",
    };
  },
};

// --- Local open-source model (default) --------------------------------------
// Runs the TMR RoBERTa detector + GPT-2 perplexity on this server.
export const localProvider = {
  id: "local",
  name: "Open-source AI detector",
  url: DETECTOR_MODEL.url,
  minWords: 40,
  englishOnly: true,
  isConfigured: () => true,
  async detect(text) {
    try {
      return await detectLocal(text);
    } catch (err) {
      console.error("[detector] local model failed:", err);
      throw new AppError(
        "model_unavailable",
        "The AI-detection model is still loading on the server. Please try again in a minute.",
        503
      );
    }
  },
};

export const DETECTION_PROVIDERS = {
  local: localProvider,
  sapling: saplingProvider,
  gptzero: gptzeroProvider,
};
