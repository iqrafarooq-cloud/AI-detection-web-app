import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { analyzeText, getDetectionStatus } from "@/lib/services/detection";
import { saplingProvider, gptzeroProvider } from "@/lib/services/detection/providers";
import { improveText } from "@/lib/services/rewrite";
import { sanitizeControls, DEFAULT_CONTROLS } from "@/lib/services/rewrite/options";
import { buildRefinePrompt, buildRestructurePrompt } from "@/lib/services/rewrite/prompt";
import { validateText, AppError } from "@/lib/server/http";
import { rateLimit, _resetRateLimits } from "@/lib/server/rateLimit";

const LONG = "This is a sample sentence written for testing purposes only. ".repeat(6);
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(status, body) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };
  return calls;
}

test("no provider configured: no verdict and no scores are fabricated", async () => {
  const r = await analyzeText(LONG, { provider: "none", timeoutMs: 1000 });
  assert.equal(r.detection.status, "not_configured");
  assert.equal(r.detection.scores, undefined);
  assert.equal(r.detection.verdict, undefined);
  assert.ok(r.patterns.metrics.words > 0);
  assert.match(r.disclaimer, /probabilistic/);
});

test("provider selected but missing key counts as not configured", () => {
  assert.equal(getDetectionStatus({ provider: "sapling", saplingKey: "" }).configured, false);
  assert.equal(getDetectionStatus({ provider: "sapling", saplingKey: "k" }).configured, true);
});

test("Sapling scores are passed through unchanged", async () => {
  const calls = mockFetch(200, {
    score: 0.91,
    sentence_scores: [
      { sentence: "A.", score: 0.95 },
      { sentence: "B.", score: 0.88 },
    ],
  });
  const r = await saplingProvider.detect("hello", { saplingKey: "k", timeoutMs: 1000 });
  assert.equal(r.scores.ai, 0.91);
  assert.equal(r.verdict, "likely_ai");
  assert.equal(r.sentences[1].aiProbability, 0.88);
  assert.equal(JSON.parse(calls[0].init.body).key, "k");
});

test("Sapling mid-range score is reported as uncertain", async () => {
  mockFetch(200, { score: 0.5, sentence_scores: [] });
  const r = await saplingProvider.detect("x", { saplingKey: "k", timeoutMs: 1000 });
  assert.equal(r.verdict, "uncertain");
});

test("GPTZero response is normalized", async () => {
  mockFetch(200, {
    documents: [
      {
        predicted_class: "mixed",
        confidence_category: "medium",
        class_probabilities: { ai: 0.4, human: 0.35, mixed: 0.25 },
        sentences: [{ sentence: "S1", generated_prob: 0.7 }],
      },
    ],
  });
  const r = await gptzeroProvider.detect("x", { gptzeroKey: "k", timeoutMs: 1000 });
  assert.equal(r.verdict, "mixed");
  assert.equal(r.confidence, "medium");
  assert.deepEqual(r.scores, { ai: 0.4, human: 0.35, mixed: 0.25 });
});

test("provider failures surface as errors, never as fake results", async () => {
  mockFetch(429, { error: "limit" });
  const r = await analyzeText(LONG, { provider: "sapling", saplingKey: "k", timeoutMs: 1000 });
  assert.equal(r.detection.status, "error");
  assert.equal(r.detection.code, "provider_rate_limited");
  assert.equal(r.detection.scores, undefined);

  globalThis.fetch = async () => {
    throw new TypeError("fetch failed");
  };
  const r2 = await analyzeText(LONG, { provider: "sapling", saplingKey: "k", timeoutMs: 1000 });
  assert.equal(r2.detection.code, "provider_unreachable");
});

test("short text is not sent to the detection provider", async () => {
  const calls = mockFetch(200, { score: 0.1 });
  const r = await analyzeText("Too short to judge.", { provider: "sapling", saplingKey: "k", timeoutMs: 1000 });
  assert.equal(r.detection.status, "too_short");
  assert.equal(calls.length, 0);
});

test("rewrite without a configured provider fails clearly", async () => {
  await assert.rejects(improveText("Some text here.", DEFAULT_CONTROLS, { rewriteCfg: { provider: "auto", anthropicKey: "", groqKey: "" } }), (e) => e.code === "rewrite_not_configured" && e.status === 503);
});

test("Groq 413 (request larger than the tokens-per-minute limit) is reported as text too long, not a temporary problem", async () => {
  const { groqProvider } = await import("@/lib/services/rewrite/groq");
  const calls = mockFetch(413, {
    error: { message: "Request too large for model on tokens per minute (TPM): Limit 8000, Requested 10679", type: "tokens", code: "rate_limit_exceeded" },
  });
  const realError = console.error;
  console.error = () => {};
  try {
    await assert.rejects(
      groqProvider.generate({ system: "s", user: "u" }, { groqKey: "k", groqModel: "openai/gpt-oss-120b", timeoutMs: 1000 }),
      (e) => e instanceof AppError && e.code === "text_too_long" && e.status === 413 && /split it into smaller sections/.test(e.message)
    );
  } finally {
    console.error = realError;
  }
  assert.equal(calls.length, 1, "a 413 must not be retried");
});

test("controls are sanitized to allowed values", () => {
  const c = sanitizeControls({ style: "evil", tone: "warm", length: "x", customInstructions: "a".repeat(5000) });
  assert.equal(c.style, "natural");
  assert.equal(c.tone, "warm");
  assert.equal(c.length, "maintain");
  assert.equal(c.customInstructions.length, 600);
});

test("pipeline prompts wrap user text in delimiters and include controls", () => {
  const c = sanitizeControls({ style: "academic", length: "shorten" });
  const refine = buildRefinePrompt("Hello <b>world</b>", c);
  assert.match(refine, /<text>\nHello <b>world<\/b>\n<\/text>$/);
  assert.match(refine, /Academic/);
  assert.match(refine, /never by dropping facts/);
  assert.match(refine, /Contractions: no/);
  assert.match(buildRestructurePrompt("Hi there.", c), /<text>\nHi there\.\n<\/text>$/);
});

test("pipeline runs restructure then refine, checks facts and re-checks the score", async () => {
  const { groqProvider } = await import("@/lib/services/rewrite/groq");
  const original = groqProvider.generate;
  const calls = [];
  groqProvider.generate = async ({ system }) => {
    const step = system.includes("step 1") ? "restructure" : "refine";
    calls.push(step);
    return { text: `${step} output with 42%. `.repeat(12).trim(), model: "fake-model" };
  };
  try {
    const text = "Sales grew 42% this year across all regions. ".repeat(8).trim();
    const r = await improveText(text, DEFAULT_CONTROLS, {
      rewriteCfg: { provider: "groq", groqKey: "k", groqModel: "fake-model" },
      scoreFn: async (t) => (t === text ? 0.9 : 0.3),
    });
    assert.deepEqual(calls, ["restructure", "refine"]);
    assert.match(r.improvedText, /^refine output/);
    assert.equal(r.preservation.ok, true);
    assert.equal(r.recheck.available, true);
    assert.equal(r.recheck.before, 0.9);
    assert.equal(r.recheck.after, 0.3);
    assert.equal(r.pipeline.length, 2);
  } finally {
    groqProvider.generate = original;
  }
});

test("re-check is honestly skipped for non-English text", async () => {
  const { groqProvider } = await import("@/lib/services/rewrite/groq");
  const original = groqProvider.generate;
  groqProvider.generate = async () => ({ text: "Texto final con 42%.", model: "m" });
  try {
    const r = await improveText("Las ventas crecieron un 42% este año en todas las regiones del país.", DEFAULT_CONTROLS, {
      rewriteCfg: { provider: "groq", groqKey: "k", groqModel: "m" },
      scoreFn: async () => 0.5,
    });
    assert.equal(r.recheck.available, false);
    assert.match(r.recheck.reason, /English/);
  } finally {
    groqProvider.generate = original;
  }
});

test("validateText rejects empty, whitespace and oversized input", () => {
  assert.throws(() => validateText("", 100), (e) => e instanceof AppError && e.code === "empty_text");
  assert.throws(() => validateText("   \n ", 100), (e) => e.code === "empty_text");
  assert.throws(() => validateText("x".repeat(101), 100), (e) => e.code === "text_too_long" && e.status === 413);
  assert.throws(() => validateText("two words", 100, { minWords: 3 }), (e) => e.code === "text_too_short");
  assert.throws(() => validateText(42, 100), (e) => e.code === "invalid_text");
  assert.equal(validateText("a\r\nb", 100), "a\nb");
});

test("rate limiter blocks after the limit within a window", () => {
  _resetRateLimits();
  const opts = { limit: 2, windowMs: 60_000 };
  assert.equal(rateLimit("t", opts).allowed, true);
  assert.equal(rateLimit("t", opts).allowed, true);
  const third = rateLimit("t", opts);
  assert.equal(third.allowed, false);
  assert.ok(third.retryAfterSec > 0);
  assert.equal(rateLimit("other", opts).allowed, true);
});
