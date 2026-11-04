import crypto from "node:crypto";
import { config } from "@/lib/config";
import { analyzePatterns } from "@/lib/analysis/patterns";
import { DETECTION_PROVIDERS } from "./providers";
import { countWords, looksEnglish } from "@/lib/text/stats";

export const DISCLAIMER =
  "AI detection is probabilistic. No detector can reliably determine who wrote a text in every case, and results should never be used as the sole evidence of authorship.";

// Below this length a result is still shown, but with a caution note.
const RELIABLE_WORDS = 60;

export function getDetectionProvider(cfg = config.detection) {
  const provider = DETECTION_PROVIDERS[cfg.provider];
  if (!provider || !provider.isConfigured(cfg)) return null;
  return provider;
}

export function getDetectionStatus(cfg = config.detection) {
  const provider = getDetectionProvider(cfg);
  return provider
    ? { configured: true, id: provider.id, name: provider.name, url: provider.url, minWords: provider.minWords }
    : { configured: false, id: null, name: null, url: null, minWords: null };
}

// Identical texts submitted while one is still being scored share the same
// model run instead of starting a second one (double clicks, retries, tabs),
// and recent results are kept in memory, keyed by a hash of the text, so a
// repeat analysis returns instantly. Results contain scores and character
// offsets only, never the text itself, and nothing is written to disk.
const inFlight = new Map();
const recent = new Map();
const RECENT_MAX = 100;

function detectOnce(provider, text, cfg) {
  const key = `${provider.id}:${crypto.createHash("sha256").update(text).digest("hex")}`;
  if (recent.has(key)) {
    const hit = recent.get(key);
    recent.delete(key);
    recent.set(key, hit); // most recently used last
    return Promise.resolve({ ...hit, elapsedMs: 0, cached: true });
  }
  if (!inFlight.has(key)) {
    const run = provider
      .detect(text, cfg)
      .then((result) => {
        if (provider.cacheable) {
          recent.set(key, result);
          if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value);
        }
        return result;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, run);
  }
  return inFlight.get(key);
}

/**
 * Runs the writing-pattern analysis (always) and the configured detection
 * provider (only when one is configured). Never fabricates a detection result.
 * Submitted text is processed in memory only and never stored.
 */
export async function analyzeText(text, cfg = config.detection) {
  const patterns = analyzePatterns(text);
  const provider = getDetectionProvider(cfg);
  const words = countWords(text);

  let detection;
  if (!provider) {
    detection = {
      status: "not_configured",
      message:
        "No AI-detection model is configured on this server, so no authorship estimate is shown. The writing-pattern analysis describes style only and is not an AI detector.",
    };
  } else if (words < provider.minWords) {
    detection = {
      status: "too_short",
      provider: { id: provider.id, name: provider.name, url: provider.url },
      message: `Detection needs at least ${provider.minWords} words to produce a meaningful estimate. This text has ${words}.`,
    };
  } else {
    try {
      const result = await detectOnce(provider, text, cfg);
      detection = { status: "ok", provider: { id: provider.id, name: provider.name, url: provider.url }, ...result, warnings: [] };
      if (words < RELIABLE_WORDS) {
        detection.warnings.push({
          code: "short_text",
          title: "Short text: less evidence",
          message: `This text has ${words} words. Short texts carry little evidence, so this result has low confidence. ${RELIABLE_WORDS}+ words give a more reliable result.`,
        });
      }
      if (provider.englishOnly && !looksEnglish(text)) {
        // The model was trained and calibrated on English only: the result is
        // shown, but never with more than low confidence.
        detection.confidence = "low";
        detection.warnings.push({
          code: "language",
          title: "Language not validated",
          message: "This text does not appear to be in English. The model was trained and calibrated on English only, so this result is unreliable for this language.",
        });
      }
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
