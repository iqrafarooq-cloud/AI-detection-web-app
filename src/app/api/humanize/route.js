import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { enforceRateLimit, handleRouteError, readJson, validateText } from "@/lib/server/http";
import { improveText } from "@/lib/services/rewrite";
import { sanitizeControls } from "@/lib/services/rewrite/options";
import { analyzeText, getDetectionProvider } from "@/lib/services/detection";

export const runtime = "nodejs";
// Long texts on a low tokens-per-minute plan are rewritten section by section and can take a few
// minutes. 300 s is the maximum Vercel allows on the Hobby plan (Pro allows up to 800).
export const maxDuration = 300;

export async function POST(request) {
  try {
    enforceRateLimit(request, "humanize", config.limits.humanizePerWindow);
    const body = await readJson(request, config.limits.humanizeMaxChars * 4 + 8192);
    const text = validateText(body.text, config.limits.humanizeMaxChars, { minWords: 3 });
    const controls = sanitizeControls(body.controls);

    // Re-check both versions with exactly what the Detector page shows (same
    // engine, same headline number, shared cache), so pasting the result into
    // the Detector gives the same percentage.
    // The same detection also decides which parts get rewritten: sentences
    // that already read as human-written are kept exactly as written.
    let scoreFn = null;
    let detectFn = null;
    if (getDetectionProvider()) {
      detectFn = async (t) => (await analyzeText(t)).detection;
      scoreFn = async (t) => {
        const detection = await detectFn(t);
        if (detection.status !== "ok") throw new Error(detection.message || "Detection unavailable");
        return detection.content.ai / 100;
      };
    }
    const result = await improveText(text, controls, { scoreFn, detectFn });

    return NextResponse.json({ ...result, controls });
  } catch (err) {
    return handleRouteError(err, "humanize");
  }
}
