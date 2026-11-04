// The detection engine registry. There is exactly one detection engine: the
// local model with its fitted scoring layer. Every text - typed, pasted or
// extracted from an uploaded file - is scored by it. DETECTION_PROVIDER=none
// turns detection off (only the writing-pattern analysis runs); nothing ever
// invents a score in its place.

import { AppError } from "@/lib/server/http";
import { detectLocal } from "./local/detector";
import { DETECTOR_MODEL } from "./local/model-config";

/**
 * @typedef {Object} NormalizedDetection
 * @property {"ai"|"human"} classification   the verdict
 * @property {{ai:number, human:number, uncertain:number}} content  share of analyzed words per group label, sums to 100
 * @property {{ai:number, human:number}} probabilities  0..1, ai + human = 1
 * @property {{ai:number, human:number}} percentages    integers, ai + human = 100
 * @property {"high"|"medium"|"low"} confidence
 * @property {boolean} calibrated
 * @property {string} explanation   short plain-language reason for the classification
 * @property {Array<{start:number, end:number, words:number, aiProbability:number, classification:string}>} segments
 * @property {string} basis         how the classification was derived
 */

// --- Local open-source model (default) --------------------------------------
// Runs one open-source classification model on this server, with calibrated probabilities.
export const localProvider = {
  id: "local",
  name: "Open-source AI detector",
  url: DETECTOR_MODEL.url,
  minWords: 20,
  englishOnly: true,
  cacheable: true,
  isConfigured: () => true,
  async detect(text) {
    try {
      return await detectLocal(text);
    } catch (err) {
      if (err instanceof AppError) throw err;
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
};
