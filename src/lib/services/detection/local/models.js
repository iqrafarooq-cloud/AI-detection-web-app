import "server-only";

// Open-source models that run locally (CPU, ONNX Runtime) through Transformers.js.
// No API key, no per-request cost, and the text never leaves this server.

export { DETECTOR_MODEL, PERPLEXITY_MODEL } from "./model-config.js";
import { DETECTOR_MODEL, PERPLEXITY_MODEL, modelCacheDir } from "./model-config.js";

let transformersPromise = null;
async function loadTransformers() {
  transformersPromise ??= import("@huggingface/transformers").then((t) => {
    t.env.cacheDir = modelCacheDir();
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
