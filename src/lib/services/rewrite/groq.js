import Groq from "groq-sdk";
import { AppError } from "@/lib/server/http";

let client = null;
function getClient(cfg) {
  // Extra retries: a long text is rewritten in several sequential requests, and on
  // the free tier a later request can hit the tokens-per-minute limit (429). The
  // SDK waits for Groq's retry-after before retrying, so the run continues.
  if (!client) client = new Groq({ apiKey: cfg.groqKey, timeout: cfg.timeoutMs, maxRetries: 12 });
  return client;
}

const DEFAULT_CHUNK_CHARS = 5000;

/**
 * Output budget sized to the input. Groq reserves part of max_completion_tokens
 * against the tokens-per-minute limit when admitting a request, so a fixed huge
 * value makes mid-sized texts fail with 413. Room for: same-length output, +30%
 * for "expand", and short reasoning.
 */
export function groqMaxTokens(userPrompt) {
  const promptTokens = Math.ceil(userPrompt.length / 3.5);
  return Math.min(16000, Math.ceil(promptTokens * 1.5) + 1536);
}

export const groqProvider = {
  id: "groq",
  name: "Groq",
  isConfigured: (cfg) => Boolean(cfg.groqKey),
  modelName: (cfg) => cfg.groqModel,
  maxChunkChars: (cfg) => cfg.chunkChars || DEFAULT_CHUNK_CHARS,

  async generate({ system, user, temperature = 0.5 }, cfg) {
    const groq = getClient(cfg);
    const isReasoningModel = /gpt-oss|qwen3/i.test(cfg.groqModel);
    let completion;
    try {
      completion = await groq.chat.completions.create({
        model: cfg.groqModel,
        temperature,
        max_completion_tokens: groqMaxTokens(user),
        // Reasoning models: keep thinking short and out of the returned text.
        ...(isReasoningModel ? { reasoning_effort: /gpt-oss/i.test(cfg.groqModel) ? "low" : undefined, include_reasoning: false } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      });
    } catch (err) {
      throw mapGroqError(err);
    }

    const choice = completion.choices?.[0];
    if (choice?.finish_reason === "length") {
      throw new AppError("output_truncated", "The text is too long to rewrite in one pass. Please split it into smaller sections.", 413);
    }
    const improved = stripWrappers(choice?.message?.content || "");
    if (!improved) throw new AppError("empty_output", "The writing model returned no text. Please try again.", 502);
    return { text: improved, model: completion.model || cfg.groqModel };
  },
};

// Defensive cleanup in case a model echoes our delimiter tags or leaks <think> blocks.
function stripWrappers(s) {
  return s
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^\s*<\/?(?:original_)?text>\s*/i, "")
    .replace(/\s*<\/?(?:original_)?text>\s*$/i, "")
    .trim();
}

function mapGroqError(err) {
  if (err instanceof Groq.APIError) {
    // Log the provider's own status and message (never the user's text) so failures are diagnosable.
    console.error(`[groq] ${err.status ?? "no-status"} ${err.constructor.name}: ${err.message}`);
  }
  // 413: a single request is larger than the account's tokens-per-minute limit
  // (Groq counts the prompt plus an output estimate). Retrying cannot succeed.
  if (err instanceof Groq.APIError && err.status === 413) {
    return new AppError(
      "text_too_long",
      "This text is too long for the writing service to handle in one go. Please split it into smaller sections and improve them one at a time.",
      413
    );
  }
  if (err instanceof Groq.RateLimitError) {
    return new AppError("provider_rate_limited", "The writing service's free usage limit was reached. Please try again in a minute.", 503);
  }
  if (err instanceof Groq.AuthenticationError || err instanceof Groq.PermissionDeniedError) {
    return new AppError("provider_auth", "The writing service rejected the server's API key. The site operator needs to check the configuration.", 502);
  }
  if (err instanceof Groq.BadRequestError) {
    const tooLong = /context|too long|tokens/i.test(err.message || "");
    return new AppError(
      tooLong ? "text_too_long" : "provider_bad_request",
      tooLong ? "This text is too long for the writing model. Please split it into smaller sections." : "The writing service could not process this request.",
      tooLong ? 413 : 502
    );
  }
  if (err instanceof Groq.APIConnectionTimeoutError) {
    return new AppError("provider_timeout", "The writing service took too long to respond. Try a shorter text.", 504);
  }
  if (err instanceof Groq.APIConnectionError) {
    return new AppError("provider_unreachable", "Could not reach the writing service. Please try again.", 502);
  }
  if (err instanceof Groq.APIError) {
    return new AppError("provider_error", "The writing service had a temporary problem. Please try again.", 502);
  }
  return err;
}
