import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { enforceRateLimit, handleRouteError, readJson, validateText } from "@/lib/server/http";
import { improveText } from "@/lib/services/rewrite";
import { sanitizeControls } from "@/lib/services/rewrite/options";
import { recordActivity } from "@/lib/server/history";
import { getDetectionProvider } from "@/lib/services/detection";

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

    // Re-check with the local open-source detector when it is the active provider.
    const detector = getDetectionProvider();
    let scoreFn = null;
    if (detector?.id === "local") {
      const { scoreDocument } = await import("@/lib/services/detection/local/detector");
      scoreFn = scoreDocument;
    }
    const result = await improveText(text, controls, { scoreFn });

    const history = await recordActivity("humanization", ({ storeOriginal }) => ({
      table: "humanization_history",
      row: {
        original_text: storeOriginal ? text : null,
        improved_text: result.improvedText,
        writing_style: controls.style,
      },
    }));

    return NextResponse.json({ ...result, controls, history });
  } catch (err) {
    return handleRouteError(err, "humanize");
  }
}
