"use client";

// Reads text from an image in the browser with Tesseract (open-source OCR).
// The image never leaves the user's device; the OCR engine and English
// language data are downloaded once from a CDN and cached by the browser.

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "bmp"];
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export async function ocrImage(file, onProgress) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    logger: (m) => {
      if (m.status === "recognizing text" && typeof m.progress === "number") onProgress?.(Math.round(m.progress * 100));
    },
  });
  try {
    const { data } = await worker.recognize(file);
    return { text: (data.text || "").trim(), confidence: Math.round(data.confidence ?? 0) };
  } finally {
    await worker.terminate();
  }
}
