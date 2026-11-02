import { config } from "@/lib/config";
import { analyzePatterns } from "@/lib/analysis/patterns";
import { DETECTION_PROVIDERS } from "./providers";
import { countWords, looksEnglish } from "@/lib/text/stats";

export const DISCLAIMER =
  "AI detection is probabilistic. No detector can reliably determine who wrote a text in every case, and results should never be used as the sole evidence of authorship.";

export function getDetectionProvider(cfg = config.detection) {
  const provider = DETECTION_PROVIDERS[cfg.provider];
  if (!provider || !provider.isConfigured(cfg)) return null;
  return provider;
}

export function getDetectionStatus(cfg = config.detection) {
  const provider = getDetectionProvider(cfg);
  return provider
    ? { configured: true, id: provider.id, name: provider.name, url: provider.url }
    : { configured: false, id: null, name: null, url: null };
}

/**
 * Runs the writing-pattern analysis (always) and the configured detection
 * provider (only when one is configured). Never fabricates a detection result.
 */
export async function analyzeText(text, cfg = config.detection) {
  const patterns = analyzePatterns(text);
  const provider = getDetectionProvider(cfg);

  let detection;
  if (!provider) {
    detection = {
      status: "not_configured",
      message:
        "No AI-detection model is configured on this server, so no authorship estimate is shown. The writing-pattern analysis below describes style only and is not an AI detector.",
    };
  } else if (provider.englishOnly && !looksEnglish(text)) {
    detection = {
      status: "unsupported_language",
      provider: { id: provider.id, name: provider.name, url: provider.url },
      message:
        "The detection model was trained on English text only, so it cannot give a reliable estimate for this language. We show no score rather than an unreliable one.",
    };
  } else if (countWords(text) < provider.minWords) {
    detection = {
      status: "too_short",
      provider: { id: provider.id, name: provider.name, url: provider.url },
      message: `Detection needs at least ${provider.minWords} words to produce a meaningful estimate.`,
    };
  } else {
    try {
      const result = await provider.detect(text, cfg);
      detection = {
        status: "ok",
        provider: { id: provider.id, name: provider.name, url: provider.url },
        ...result,
      };
    } catch (err) {
      detection = {
        status: "error",
        provider: { id: provider.id, name: provider.name, url: provider.url },
        code: err?.code || "provider_error",
        message: err?.message || "The detection provider failed.",
      };
    }
  }

  return { detection, patterns, disclaimer: DISCLAIMER };
}
