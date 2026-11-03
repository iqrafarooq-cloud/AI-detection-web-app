import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { getDetectionStatus } from "@/lib/services/detection";
import { getRewriteStatus } from "@/lib/services/rewrite";

export const dynamic = "force-dynamic";

// Public, non-sensitive capability info so the UI can be honest about what works.
export function GET() {
  return NextResponse.json({
    detection: getDetectionStatus(),
    rewrite: getRewriteStatus(),
    limits: {
      analyzeMaxChars: config.limits.analyzeMaxChars,
      humanizeMaxChars: config.limits.humanizeMaxChars,
      grammarMaxChars: config.limits.grammarMaxChars,
      summarizeMaxChars: config.limits.summarizeMaxChars,
      uploadMaxBytes: config.limits.uploadMaxBytes,
    },
  });
}
