// Model choices for the local detector, used by models.js.
import path from "node:path";

export const DETECTOR_MODEL = {
  id: process.env.HF_DETECTOR_MODEL || "onnx-community/tmr-ai-text-detector-ONNX",
  dtype: process.env.HF_DETECTOR_DTYPE || "q8",
  // Index of the "AI" class in the model's logits. TMR: {0: human, 1: ai}.
  aiLabelIndex: Number(process.env.HF_DETECTOR_AI_INDEX ?? 1),
  name: "TMR AI Text Detector (RoBERTa-base)",
  url: "https://huggingface.co/Oxidane/tmr-ai-text-detector",
  benchmark: "RAID benchmark: 99.28% AUROC, 90.17% TPR at 1% FPR (self-reported leaderboard result)",
  maxTokens: 512,
};

export const PERPLEXITY_MODEL = {
  id: process.env.HF_PERPLEXITY_MODEL || "Xenova/gpt2",
  dtype: process.env.HF_PERPLEXITY_DTYPE || "fp32",
  name: "GPT-2 (124M)",
  url: "https://huggingface.co/openai-community/gpt2",
  bosTokenId: 50256,
  maxTokens: 256,
};

/** Where Transformers.js stores downloaded models. */
export function modelCacheDir() {
  if (process.env.HF_CACHE_DIR) return process.env.HF_CACHE_DIR;
  // Vercel functions have a read-only filesystem except /tmp.
  if (process.env.VERCEL) return path.join("/tmp", "huggingface");
  return path.join(process.cwd(), ".cache", "huggingface");
}
