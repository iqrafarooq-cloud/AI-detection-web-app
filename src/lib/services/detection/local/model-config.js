// The one detection model used by the local detector, and its calibration.
import path from "node:path";
import { CALIBRATION as FITTED } from "./calibration-data.js";

// Chosen by measurement on labeled data (see docs/detector-evaluation.md and
// the "How it works" page). The calibration below was fitted for exactly this
// model and dtype, so they are fixed here rather than configurable: swapping
// the model without re-running `scripts/eval/evaluate.mjs fit` would make the
// reported probabilities meaningless.
export const DETECTOR_MODEL = {
  // ONNX build (4-bit weights) of ShantanuT01/gradient-ai-text-detector, a
  // DeBERTa-v3-large classifier trained on ~1.1M texts from 2025-26 datasets
  // (MIT). Chosen over the previous Fakespot RoBERTa-base model by measurement
  // on the calibration split (scripts/eval/compare-models.mjs): it flags far
  // fewer human texts and separates current-generation AI text almost
  // perfectly. Pinned to a commit because it is a community conversion.
  id: "batmac/gradient-ai-text-detector-onnx",
  revision: "776d0164ba0de631036c70f6a146d68a7cd4ea4e",
  dtype: "q4",
  // One output logit; P(AI) = sigmoid(logit).
  head: "sigmoid",
  name: "Gradient AI Text Detector (DeBERTa-v3-large)",
  url: "https://huggingface.co/ShantanuT01/gradient-ai-text-detector",
  maxTokens: 512,
};

/** Calibration fitted for DETECTOR_MODEL, or null when it hasn't been fitted for it. */
export const CALIBRATION =
  FITTED && Array.isArray(FITTED.params?.weights) && Array.isArray(FITTED.groups?.params?.weights) && FITTED.modelId === DETECTOR_MODEL.id && FITTED.revision === DETECTOR_MODEL.revision && FITTED.dtype === DETECTOR_MODEL.dtype ? FITTED : null;

/** Where Transformers.js stores downloaded models. */
export function modelCacheDir() {
  if (process.env.HF_CACHE_DIR) return process.env.HF_CACHE_DIR;
  // Vercel functions have a read-only filesystem except /tmp.
  if (process.env.VERCEL) return path.join("/tmp", "huggingface");
  return path.join(process.cwd(), ".cache", "huggingface");
}
