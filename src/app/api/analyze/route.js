import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { enforceRateLimit, handleRouteError, readJson, validateText } from "@/lib/server/http";
import { analyzeText } from "@/lib/services/detection";

export const runtime = "nodejs";
// The first request on a fresh server instance downloads the detector models
// (~400 MB on Vercel), which can take well over a minute.
export const maxDuration = 300;

export async function POST(request) {
  try {
    enforceRateLimit(request, "analyze", config.limits.analyzePerWindow);
    const body = await readJson(request, config.limits.analyzeMaxChars * 4 + 1024);
    const text = validateText(body.text, config.limits.analyzeMaxChars);

    const result = await analyzeText(text);


    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err, "analyze");
  }
}
