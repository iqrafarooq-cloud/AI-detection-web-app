import "server-only";

// The open-source detection model runs locally (CPU, ONNX Runtime) through
// Transformers.js: no API key, no per-request cost, and text never leaves this server.

export { DETECTOR_MODEL } from "./model-config.js";
import { DETECTOR_MODEL, modelCacheDir } from "./model-config.js";

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
      t.AutoTokenizer.from_pretrained(DETECTOR_MODEL.id, { revision: DETECTOR_MODEL.revision }),
      t.AutoModelForSequenceClassification.from_pretrained(DETECTOR_MODEL.id, { revision: DETECTOR_MODEL.revision, dtype: DETECTOR_MODEL.dtype }),
    ]);
    return { tokenizer, model };
  })().catch((err) => {
    detectorPromise = null; // allow retry after a failed download
    throw err;
  });
  return detectorPromise;
}

export function warmupModels() {
  return Promise.allSettled([getDetector()]);
}
