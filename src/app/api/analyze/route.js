import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { enforceRateLimit, handleRouteError, readJson, validateText } from "@/lib/server/http";
import { analyzeText } from "@/lib/services/detection";
import { recordActivity } from "@/lib/server/history";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  try {
    enforceRateLimit(request, "analyze", config.limits.analyzePerWindow);
    const body = await readJson(request, config.limits.analyzeMaxChars * 4 + 1024);
    const text = validateText(body.text, config.limits.analyzeMaxChars);

    const result = await analyzeText(text);

    const history = await recordActivity("analysis", ({ storeOriginal }) => {
      const d = result.detection;
      // Without consent, keep only aggregate results - no sentence text.
      const summary = {
        detection: {
          status: d.status,
          verdict: d.verdict ?? null,
          scores: d.scores ?? null,
          confidence: d.confidence ?? null,
        },
        metrics: result.patterns.metrics,
        signals: result.patterns.signals.map((s) => s.title),
      };
      return {
        table: "analysis_history",
        row: {
          original_text: storeOriginal ? text : null,
          analysis_result: storeOriginal ? { ...summary, sentences: d.sentences ?? [] } : summary,
          detection_provider: d.provider?.id ?? null,
        },
      };
    });

    return NextResponse.json({ ...result, history });
  } catch (err) {
    return handleRouteError(err, "analyze");
  }
}
