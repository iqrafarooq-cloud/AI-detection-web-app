// Central, server-side configuration. Never import this from client components.

function int(name, fallback) {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

export const config = {
  detection: {
    provider: (process.env.DETECTION_PROVIDER || "local").toLowerCase(),
    saplingKey: process.env.SAPLING_API_KEY || "",
    gptzeroKey: process.env.GPTZERO_API_KEY || "",
    timeoutMs: int("DETECTION_TIMEOUT_MS", 30_000),
  },
  rewrite: {
    provider: (process.env.REWRITE_PROVIDER || "auto").toLowerCase(),
    anthropicKey: process.env.ANTHROPIC_API_KEY || "",
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-5-5",
    groqKey: process.env.GROQ_API_KEY || "",
    groqModel: process.env.GROQ_MODEL || "openai/gpt-oss-120b",
    timeoutMs: int("REWRITE_TIMEOUT_MS", 180_000),
    // Max characters rewritten per request; longer texts are split into sections.
    // 0 = provider default (Groq 5,000 to fit its free tier's 8,000 tokens/minute; Anthropic 40,000).
    chunkChars: Number.parseInt(process.env.REWRITE_CHUNK_CHARS ?? "", 10) || 0,
  },
  limits: {
    analyzeMaxChars: int("ANALYZE_MAX_CHARS", 50_000),
    humanizeMaxChars: int("HUMANIZE_MAX_CHARS", 20_000),
    // Grammar and summaries are single model calls; these defaults keep one request
    // inside the Groq free tier's 8,000 tokens-per-minute limit.
    grammarMaxChars: int("GRAMMAR_MAX_CHARS", 12_000),
    summarizeMaxChars: int("SUMMARIZE_MAX_CHARS", 15_000),
    minChars: 1,
    uploadMaxBytes: int("UPLOAD_MAX_BYTES", 4 * 1024 * 1024),
    rateWindowMs: int("RATE_LIMIT_WINDOW_MS", 60_000),
    analyzePerWindow: int("RATE_LIMIT_ANALYZE", 20),
    humanizePerWindow: int("RATE_LIMIT_HUMANIZE", 10),
    grammarPerWindow: int("RATE_LIMIT_GRAMMAR", 10),
    summarizePerWindow: int("RATE_LIMIT_SUMMARIZE", 10),
    uploadPerWindow: int("RATE_LIMIT_UPLOAD", 20),
  },
};
