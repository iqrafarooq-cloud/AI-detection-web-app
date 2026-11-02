import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { enforceRateLimit, handleRouteError, readJson, validateText } from "@/lib/server/http";
import { checkGrammar } from "@/lib/services/grammar";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request) {
  try {
    enforceRateLimit(request, "grammar", config.limits.grammarPerWindow);
    const body = await readJson(request, config.limits.grammarMaxChars * 4 + 1024);
    const text = validateText(body.text, config.limits.grammarMaxChars, { minWords: 2 });
    const result = await checkGrammar(text);
    return NextResponse.json(result);
  } catch (err) {
    return handleRouteError(err, "grammar");
  }
}
