import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { analyzeText, getDetectionStatus } from "@/lib/services/detection";
import { DETECTION_PROVIDERS } from "@/lib/services/detection/providers";
import { AppError as ProviderError } from "@/lib/server/http";
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
  assert.equal(r.detection.probabilities, undefined);
  assert.equal(r.detection.classification, undefined);
  assert.ok(r.patterns.metrics.words > 0);
  assert.match(r.disclaimer, /probabilistic/);
});

test("there is exactly one detection engine, and unknown providers are not configured", () => {
  assert.deepEqual(Object.keys(DETECTION_PROVIDERS), ["local"]);
  assert.equal(getDetectionStatus({ provider: "local" }).configured, true);
  assert.equal(getDetectionStatus({ provider: "sapling" }).configured, false);
  assert.equal(getDetectionStatus({ provider: "none" }).configured, false);
});

test("engine failures surface as errors, never as fake results", async () => {
  DETECTION_PROVIDERS.fake = fakeProvider(async () => {
    throw new ProviderError("model_unavailable", "loading", 503);
  });
  try {
    const r = await analyzeText(LONG, { provider: "fake" });
    assert.equal(r.detection.status, "error");
    assert.equal(r.detection.code, "model_unavailable");
    assert.equal(r.detection.probabilities, undefined);
    assert.equal(r.detection.percentages, undefined);
  } finally {
    delete DETECTION_PROVIDERS.fake;
  }
});

test("text below the minimum is not scored: an explicit too-short result, no number", async () => {
  let calls = 0;
  DETECTION_PROVIDERS.fake = { ...fakeProvider(async () => (calls++, fakeResult(0.1))), minWords: 20 };
  try {
    const r = await analyzeText("Too short to judge.", { provider: "fake" });
    assert.equal(r.detection.status, "too_short");
    assert.equal(r.detection.percentages, undefined);
    assert.equal(calls, 0);
  } finally {
    delete DETECTION_PROVIDERS.fake;
  }
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

test("re-check also runs for non-English text", async () => {
  const { groqProvider } = await import("@/lib/services/rewrite/groq");
  const original = groqProvider.generate;
  const es = "Las ventas crecieron un 42% este año en todas las regiones del país y la empresa espera seguir creciendo. ".repeat(4);
  groqProvider.generate = async () => ({ text: es, model: "m" });
  try {
    const r = await improveText(es, DEFAULT_CONTROLS, {
      rewriteCfg: { provider: "groq", groqKey: "k", groqModel: "m" },
      scoreFn: async () => 0.5,
    });
    assert.equal(r.recheck.available, true);
  } finally {
    groqProvider.generate = original;
  }
});

function fakeProvider(detect) {
  return { id: "fake", name: "Fake", url: "", englishOnly: true, minWords: 5, isConfigured: () => true, detect };
}
const fakeResult = (p) => ({
  classification: p >= 0.5 ? "ai" : "human",
  probabilities: { ai: p, human: 1 - p },
  percentages: { ai: Math.round(p * 100), human: 100 - Math.round(p * 100) },
  confidence: "high",
  calibrated: true,
  explanation: "x",
  segments: [],
});

test("non-English text keeps its verdict but never gets more than low confidence", async () => {
  const { DETECTION_PROVIDERS } = await import("@/lib/services/detection/providers");
  DETECTION_PROVIDERS.fake = fakeProvider(async () => fakeResult(0.97));
  try {
    const es = await analyzeText("El cambio climático es uno de los problemas más urgentes de nuestro tiempo y afecta a los ecosistemas del mundo.", { provider: "fake" });
    assert.equal(es.detection.status, "ok");
    assert.equal(es.detection.classification, "ai");
    assert.equal(es.detection.confidence, "low");
    assert.equal(es.detection.percentages.ai, 97);
    assert.ok(es.detection.warnings.some((w) => w.code === "language"));
    // English with few function words (a resume) is not mistaken for another language.
    const resume = await analyzeText("Senior Software Engineer Skills JavaScript React Node.js Python AWS Docker Experience Led development microservices architecture Improved performance APIs reduced latency Mentored junior engineers", { provider: "fake" });
    assert.equal(resume.detection.classification, "ai");
    assert.ok(!resume.detection.warnings.some((w) => w.code === "language"));
    assert.ok(resume.detection.warnings.some((w) => w.code === "short_text"));
  } finally {
    delete DETECTION_PROVIDERS.fake;
  }
});

test("identical texts submitted at the same time share one detection run", async () => {
  const { DETECTION_PROVIDERS } = await import("@/lib/services/detection/providers");
  let calls = 0;
  DETECTION_PROVIDERS.fake = fakeProvider(async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 30));
    return fakeResult(0.1);
  });
  try {
    const [a, b] = await Promise.all([analyzeText(LONG, { provider: "fake" }), analyzeText(LONG, { provider: "fake" })]);
    assert.equal(calls, 1);
    assert.equal(a.detection.classification, "human");
    assert.equal(b.detection.classification, "human");
    await analyzeText(LONG, { provider: "fake" });
    assert.equal(calls, 2, "a finished run is not cached; later requests are scored again");
  } finally {
    delete DETECTION_PROVIDERS.fake;
  }
});

test("finished results of the cacheable engine are reused for identical text", async () => {
  let calls = 0;
  DETECTION_PROVIDERS.fake = { ...fakeProvider(async () => (calls++, fakeResult(0.8))), cacheable: true };
  try {
    const text = LONG + " cache-test";
    const a = await analyzeText(text, { provider: "fake" });
    const b = await analyzeText(text, { provider: "fake" });
    assert.equal(calls, 1);
    assert.deepEqual(b.detection.percentages, a.detection.percentages);
    assert.equal(b.detection.cached, true);
  } finally {
    delete DETECTION_PROVIDERS.fake;
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

test("humanizer keeps human-written sentences exactly and rewrites only AI-labeled groups", async () => {
  const { groqProvider } = await import("@/lib/services/rewrite/groq");
  const { rewriteSpans } = await import("@/lib/services/rewrite");
  const human = "I wrote this part myself last week after the meeting ran long.";
  const ai = "Furthermore, it is important to note that synergy plays a crucial role.";
  const text = `${human} ${ai}`;
  const detection = {
    status: "ok",
    classification: "human",
    content: { ai: 40, human: 60 },
    segments: [
      { start: 0, end: human.length, classification: "human", words: 12 },
      { start: human.length + 1, end: text.length, classification: "ai", words: 12 },
    ],
  };
  assert.deepEqual(rewriteSpans(text, detection), [{ start: human.length + 1, end: text.length }]);
  assert.deepEqual(rewriteSpans(text, { status: "too_short" }), [{ start: 0, end: text.length }]);

  const seen = [];
  const original = groqProvider.generate;
  groqProvider.generate = async ({ user }) => {
    seen.push(user);
    return { text: "Teamwork matters here.", model: "fake" };
  };
  try {
    const r = await improveText(text, DEFAULT_CONTROLS, {
      rewriteCfg: { provider: "groq", groqKey: "k", groqModel: "fake" },
      detectFn: async () => detection,
      scoreFn: async (t) => (t === text ? 0.4 : 0.2),
    });
    assert.ok(r.improvedText.startsWith(human), "human sentence kept verbatim");
    assert.ok(r.improvedText.endsWith("Teamwork matters here."));
    assert.ok(seen.every((u) => !u.includes(human)), "human text never sent to the rewriter");
    assert.equal(r.scope.selective, true);

    // All human: nothing is rewritten.
    seen.length = 0;
    const allHuman = { ...detection, segments: [{ start: 0, end: text.length, classification: "human", words: 24 }] };
    const r2 = await improveText(text, DEFAULT_CONTROLS, { rewriteCfg: { provider: "groq", groqKey: "k", groqModel: "fake" }, detectFn: async () => allHuman });
    assert.equal(r2.improvedText, text);
    assert.equal(r2.scope.unchanged, true);
    assert.equal(seen.length, 0);
  } finally {
    groqProvider.generate = original;
  }
});
