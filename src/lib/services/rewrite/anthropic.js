import Anthropic from "@anthropic-ai/sdk";
import { AppError } from "@/lib/server/http";

let client = null;
function getClient(cfg) {
  if (!client) {
    client = new Anthropic({ apiKey: cfg.anthropicKey, timeout: cfg.timeoutMs, maxRetries: 2 });
  }
  return client;
}

export const anthropicProvider = {
  id: "anthropic",
  name: "Anthropic Claude",
  isConfigured: (cfg) => Boolean(cfg.anthropicKey),
  modelName: (cfg) => cfg.anthropicModel,
  maxChunkChars: (cfg) => cfg.chunkChars || 40000,

  async generate({ system, user }, cfg) {
    const anthropic = getClient(cfg);
    let message;
    try {
      // Streaming avoids HTTP timeouts on long texts; finalMessage() collects it.
      // Server-side fallbacks re-run the request on another model if the
      // primary model declines (no extra code path needed here).
      const stream = anthropic.beta.messages.stream({
        model: cfg.anthropicModel,
        max_tokens: 32000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium" },
        system,
        messages: [{ role: "user", content: user }],
      });
      message = await stream.finalMessage();
    } catch (err) {
      throw mapAnthropicError(err);
    }

    if (message.stop_reason === "refusal") {
      throw new AppError("provider_refusal", "The writing model declined to edit this text.", 422);
    }
    if (message.stop_reason === "max_tokens") {
      throw new AppError("output_truncated", "The text is too long to rewrite in one pass. Please split it into smaller sections.", 413);
    }
    const improved = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!improved) {
      throw new AppError("empty_output", "The writing model returned no text. Please try again.", 502);
    }
    return { text: improved, model: message.model };
  },
};

function mapAnthropicError(err) {
  if (err instanceof Anthropic.APIError) {
    // Log the provider's own status and message (never the user's text) so failures are diagnosable.
    console.error(`[anthropic] ${err.status ?? "no-status"} ${err.constructor.name}: ${err.message}`);
  }
  // 413 request_too_large: retrying the same request cannot succeed.
  if (err instanceof Anthropic.APIError && err.status === 413) {
    return new AppError(
      "text_too_long",
      "This text is too long for the writing service to handle in one go. Please split it into smaller sections and improve them one at a time.",
      413
    );
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AppError("provider_rate_limited", "The writing service is busy or its usage limit was reached. Please try again in a minute.", 503);
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new AppError("provider_auth", "The writing service rejected the server's API key. The site operator needs to check the configuration.", 502);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new AppError("provider_bad_request", "The writing service could not process this request.", 502);
  }
  if (err instanceof Anthropic.APIConnectionTimeoutError) {
    return new AppError("provider_timeout", "The writing service took too long to respond. Try a shorter text.", 504);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AppError("provider_unreachable", "Could not reach the writing service. Please try again.", 502);
  }
  if (err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIError) {
    return new AppError("provider_error", "The writing service had a temporary problem. Please try again.", 502);
  }
  return err;
}
