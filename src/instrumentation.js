// Runs once when the Next.js server starts. Pre-loads the local detection
// models in the background so the first analysis doesn't wait for them.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if ((process.env.DETECTION_PROVIDER || "local").toLowerCase() !== "local") return;
  if (process.env.HF_WARMUP === "false") return;
  const { warmupModels } = await import("@/lib/services/detection/local/models");
  warmupModels().then((results) => {
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length) console.error("[detector] warm-up failed:", failed.map((f) => f.reason?.message?.slice(0, 160)));
    else console.log("[detector] models ready");
  });
}
