import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { enforceRateLimit, handleRouteError, readJson, validateText } from "@/lib/server/http";
import { analyzeText } from "@/lib/services/detection";

export const runtime = "nodejs";
export const maxDuration = 60;

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
