import "server-only";
import path from "node:path";

// Open-source models that run locally (CPU, ONNX Runtime) through Transformers.js.
// No API key, no per-request cost, and the text never leaves this server.

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

let transformersPromise = null;
async function loadTransformers() {
  transformersPromise ??= import("@huggingface/transformers").then((t) => {
    // Vercel/serverless filesystems are read-only except /tmp.
    t.env.cacheDir = process.env.HF_CACHE_DIR || path.join(process.cwd(), ".cache", "huggingface");
    t.env.allowLocalModels = false;
    return t;
  });
  return transformersPromise;
}

let detectorPromise = null;
export function getDetector() {
  detectorPromise ??= (async () => {
    const t = await loadTransformers();
    const [tokenizer, model] = await Promise.all([
      t.AutoTokenizer.from_pretrained(DETECTOR_MODEL.id),
      t.AutoModelForSequenceClassification.from_pretrained(DETECTOR_MODEL.id, { dtype: DETECTOR_MODEL.dtype }),
    ]);
    return { tokenizer, model };
  })().catch((err) => {
    detectorPromise = null; // allow retry after a failed download
    throw err;
  });
  return detectorPromise;
}

let lmPromise = null;
export function getLanguageModel() {
  lmPromise ??= (async () => {
    const t = await loadTransformers();
    const [tokenizer, model] = await Promise.all([
      t.AutoTokenizer.from_pretrained(PERPLEXITY_MODEL.id),
      t.AutoModelForCausalLM.from_pretrained(PERPLEXITY_MODEL.id, { dtype: PERPLEXITY_MODEL.dtype }),
    ]);
    return { tokenizer, model, Tensor: t.Tensor };
  })().catch((err) => {
    lmPromise = null;
    throw err;
  });
  return lmPromise;
}

export function warmupModels() {
  return Promise.allSettled([getDetector(), getLanguageModel()]);
}
