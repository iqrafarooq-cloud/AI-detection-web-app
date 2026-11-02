import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { enforceRateLimit, handleRouteError, readJson, validateText } from "@/lib/server/http";
import { summarizeText } from "@/lib/services/summarize";
import { sanitizeSummaryOptions } from "@/lib/services/summarize/options";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request) {
  try {
    enforceRateLimit(request, "summarize", config.limits.summarizePerWindow);
    const body = await readJson(request, config.limits.summarizeMaxChars * 4 + 1024);
    // Summaries of a couple of sentences are pointless; ask for a real passage.
    const text = validateText(body.text, config.limits.summarizeMaxChars, { minWords: 40 });
    const result = await summarizeText(text, sanitizeSummaryOptions(body.options));
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err, "summarize");
  }
}
