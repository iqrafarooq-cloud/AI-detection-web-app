import { NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/server/rateLimit";
import { config } from "@/lib/config";

export class AppError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export function jsonError(code, message, status = 400, extra = {}) {
  return NextResponse.json({ error: { code, message, ...extra } }, { status });
}

export function handleRouteError(err, routeName) {
  if (err instanceof AppError) {
    return jsonError(err.code, err.message, err.status, err.extra);
  }
  // Log only the error type/message - never the user's text.
  console.error(`[${routeName}] unexpected error:`, err?.name, err?.message);
  return jsonError("internal_error", "Something went wrong on our side. Please try again.", 500);
}

export function enforceRateLimit(request, bucket, limit) {
  const ip = getClientIp(request);
  const result = rateLimit(`${bucket}:${ip}`, {
    limit,
    windowMs: config.limits.rateWindowMs,
  });
  if (!result.allowed) {
    throw new AppError(
      "rate_limited",
      `Too many requests. Please wait ${result.retryAfterSec}s and try again.`,
      429,
      { retryAfterSec: result.retryAfterSec }
    );
  }
}

export async function readJson(request, maxBytes = 512 * 1024) {
  const type = request.headers.get("content-type") || "";
  if (!type.includes("application/json")) {
    throw new AppError("bad_content_type", "Expected a JSON request body.", 415);
  }
  const raw = await request.text();
  if (raw.length > maxBytes) {
    throw new AppError("payload_too_large", "Request body is too large.", 413);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("invalid_json", "Request body is not valid JSON.", 400);
  }
}

export function validateText(value, maxChars, { minWords = 1 } = {}) {
  if (typeof value !== "string") {
    throw new AppError("invalid_text", "Text is required.");
  }
  const text = value.replace(/\r\n/g, "\n");
  if (!text.trim()) {
    throw new AppError("empty_text", "Please enter some text first.");
  }
  if (text.length > maxChars) {
    throw new AppError(
      "text_too_long",
      `Text is too long (${text.length.toLocaleString()} characters). The limit is ${maxChars.toLocaleString()}.`,
      413
    );
  }
  const words = text.trim().split(/\s+/).length;
  if (words < minWords) {
    throw new AppError(
      "text_too_short",
      `Please provide at least ${minWords} words for a meaningful result.`
    );
  }
  return text;
}
