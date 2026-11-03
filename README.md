# Detectly AI - AI Text Analyzer & Writing Assistant

A free, transparent web app that:

1. **Analyzes text** for AI-like writing patterns, with sentence-level explanations.
2. **Improves writing** so it reads naturally, in seven styles, while keeping meaning, facts and citations.

Built with Next.js 16 (App Router, JavaScript only), React 19, Tailwind CSS 4 (dark and light themes), Lucide icons, **Transformers.js + ONNX Runtime** (local open-source detector) and Groq or Anthropic for rewriting.

## AI detection: how the score is computed

By default the detector runs **locally on the server**. It needs no API key, has no per-request cost, and text is not sent to a third party.

| Step | Model / method |
|---|---|
| AI probability | [TMR AI Text Detector](https://huggingface.co/Oxidane/tmr-ai-text-detector) (RoBERTa-base, MIT, trained on the RAID benchmark, 99.28% AUROC self-reported). `P(AI) = softmax(logits)[ai]` |
| Long texts | Split into chunks of whole sentences of up to 256 tokens, then a token-weighted mean of chunk probabilities |
| Sentence highlights | Each sentence is scored with ±2 neighbouring sentences, and highlighted only if its chunk is also ≥ 50% |
| AI share | % of words in highlighted sentences |
| Perplexity / burstiness | GPT-2 per-sentence perplexity, and its standard deviation. Shown as supporting evidence only, not mixed into the probability |
| Verdict | ≥ 65% likely AI · ≤ 35% likely human · otherwise uncertain · "mixed" when one chunk is ≥ 80% and another ≤ 20% |

English only, at least 40 words. Otherwise no score is shown. The chunk size and gating were chosen by measurement, and the full method, test results (including a false positive) and limitations are on the **/how-it-works** page.

The models (~650 MB) download from Hugging Face on first use into `.cache/huggingface` (configurable with `HF_CACHE_DIR`) and are pre-loaded at server start by `src/instrumentation.js`.

## Honesty by design

- **Detection and rewriting are separate services.** AI-likelihood scores come only from a dedicated detection provider (Sapling or GPTZero). The rewriting LLM is never used as a detector.
- **No fabricated scores.** If no detector is configured, a key is missing, the text is too short or the provider fails, the UI says so and shows **no** percentage.
- **The writing-pattern analysis** (stock phrases, repeated openers, repeated phrases, long sentences, rhythm variation, vocabulary variety) is rule-based, explained and labelled as *style signals, not AI detection*. It never produces a probability.
- **The rewrite is checked afterwards.** Every number, citation, URL, email and DOI from the original is looked for in the output, and anything missing triggers a visible warning.
- The rewrite prompt forbids deliberate errors, invented facts and language switching.

## What works without paid APIs

| Feature | Needs |
|---|---|
| Writing-pattern analysis, sentence highlights | Nothing |
| TXT / DOCX upload, word and character counts | Nothing |
| Compare page, copy, TXT/DOCX download | Nothing |
| AI probability, sentence highlights, perplexity, burstiness | Nothing (local open-source models). Optionally use Sapling or GPTZero instead |
| Humanizer (2-step pipeline + detector re-check) | `GROQ_API_KEY` (free tier) or `ANTHROPIC_API_KEY` |
| PDF / DOC / DOCX / TXT / MD uploads | Nothing (parsed on the server, in memory) |
| PNG / JPG / WebP uploads | Nothing (OCR with Tesseract.js in the browser; the engine loads from the jsDelivr CDN) |

There are no accounts: every tool is open to everyone, and nothing the user submits is stored. Usage is free for end users. API costs fall on the operator, so the app enforces fair-use rate limits and never advertises unlimited use.

## Architecture

```
src/
  app/                      # Pages + route handlers (App Router)
    api/analyze             # POST: pattern analysis + configured detector
    api/humanize            # POST: rewrite via the configured LLM + preservation check
    api/extract             # POST: validated TXT/DOCX text extraction (in memory)
    api/status              # GET : which providers are configured (no secrets)
    api/grammar api/summarize # POST: grammar suggestions, summaries via the configured LLM
    detector/ humanizer/ grammar/ summarizer/ batch/ compare/
    how-it-works/ about/ privacy/
  components/               # UI (ui/, layout/, detector/, humanizer/, ...)
  lib/
    analysis/patterns.js    # Rule-based writing-pattern analysis
    analysis/preservation.js# Facts/citations preservation check
    services/detection/     # Provider registry + Sapling/GPTZero adapters
    services/rewrite/       # Provider registry + Anthropic adapter, prompt, options
    server/                 # Validation, errors, rate limiting
tests/                      # node:test unit tests
```

**Adding a provider:** implement `{ id, name, isConfigured(cfg), detect(text, cfg) }` in `lib/services/detection/providers.js` (or `{ rewrite(text, controls, cfg) }` for rewriting) and register it. No UI changes are needed.

## Installation

Requires Node.js 24.x.

```bash
npm install
cp .env.example .env.local   # then fill in values
npm run dev                  # http://localhost:3000
```

## API configuration

- **Groq (default rewriter):** create a free key at https://console.groq.com and set `GROQ_API_KEY`. The default model is `openai/gpt-oss-120b` (override with `GROQ_MODEL`). `REWRITE_PROVIDER=auto` uses Anthropic when its key is set, otherwise Groq.
- **Anthropic:** create a key at https://console.anthropic.com and set `ANTHROPIC_API_KEY`. The default model is `claude-opus-5-5` (override with `ANTHROPIC_MODEL`). Requests stream and use effort `medium`. Server-side refusal fallbacks (`fallbacks: "default"`) are enabled, so if the primary model declines a request, another model completes it. To turn this off, remove `betas`/`fallbacks` in `src/lib/services/rewrite/anthropic.js`.
- **Sapling:** get a key at https://sapling.ai, then set `DETECTION_PROVIDER=sapling` and `SAPLING_API_KEY`.
- **GPTZero:** get a key at https://gptzero.me, then set `DETECTION_PROVIDER=gptzero` and `GPTZERO_API_KEY`.

How verdicts are derived: GPTZero's class and confidence are shown as reported. Sapling returns a single score; Detectly labels it "likely AI-like" at 0.80 or above, "likely human-like" at 0.20 or below, "mixed" when at least 25% of sentences sit at each extreme, and "uncertain" otherwise. This rule is shown in the UI next to every result.

## Security and privacy

- API keys exist only in server code (`src/lib/config.js`, never imported by client components).
- Input validation on every route: JSON content type, body size, text length, allowed option values, custom instructions capped at 600 characters, and user text wrapped in delimiters in the prompt.
- Uploads: only `.txt`/`.docx`, max 2 MB, MIME and magic-byte checks, binary-content rejection, parsed in memory and never stored.
- Rate limiting per IP and route (in memory). **Note:** on serverless platforms each instance keeps its own counters. For strict global limits, back `src/lib/server/rateLimit.js` with Redis/Upstash, keeping the same interface.
- Logs contain error codes only, never user text.
- Security headers: `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` and `Permissions-Policy`. `X-Powered-By` is disabled.

## Testing

```bash
npm run lint
npm test          # unit tests (analysis, preservation, typography, providers, pipelines, validation, rate limits)
npm run build
```

Manual and E2E checklist (verified against a production build): empty, whitespace-only, too-short and oversized input; invalid JSON and wrong content type; special characters, emoji and HTML in text; multiple paragraphs; non-English text (English phrase checks are skipped); valid and invalid DOCX, TXT, empty, oversized and unsupported uploads; rate limiting (HTTP 429 with retry time); "not configured" states for detector and humanizer; landing -> detector -> humanizer hand-off; compare page; mobile layout at 390px with no horizontal overflow; no browser console errors.

With keys configured, also check: a humanizer run (preservation notice shown), regenerate, undo/redo, restore original, copy, TXT/DOCX download, grammar accept/undo, summaries in every format, and a batch of several files.

## Humanizer pipeline

1. **Restructure:** rebuild sentence structure, remove filler and repetition, keep every fact.
2. **Refine:** apply the chosen style, tone and level with natural rhythm and voice.
3. **Verify:** check numbers, citations, URLs and DOIs, and match typography (`42%`, plain hyphens, quote style) to the original.
4. **Re-check:** score original and result with the same local detector, and report the honest before/after.

The pipeline never adds deliberate errors or invisible characters, and never loops to beat the detector. In testing, AI-rewritten text usually stays high (e.g. 98.6% → 97.0%), and the UI explains why.

## Deployment

**Recommended: a long-running Node server** (Render, Railway, Fly.io, a VPS). The local detector uses `onnxruntime-node` (a native binary) and keeps two models (~650 MB on disk, ~1.5 GB RAM) loaded in memory. That does not fit serverless limits well.

```bash
npm run build && npm start      # set HF_CACHE_DIR to a persistent volume to avoid re-downloads
```

**Vercel:** the site and the LLM tools work, but the local detector likely exceeds the function size and memory limits. On Vercel, set `DETECTION_PROVIDER=sapling` or `gptzero`, or run the detector on a separate Node host.

### Vercel steps (without the local detector)

1. Push the repo to GitHub and import it in Vercel. The framework (Next.js) is auto-detected.
2. Add the environment variables from `.env.example` in **Project -> Settings -> Environment Variables**.
3. Deploy. The humanize route declares `maxDuration = 300`. On plans with lower function limits, long rewrites may time out, so lower `HUMANIZE_MAX_CHARS` accordingly.

## Known limitations

- AI detection is probabilistic. Accuracy depends on the provider and drops for short, mixed, translated or heavily edited text.
- The writing-pattern phrase list and the detector are English-only.
- Sentence highlights are less reliable than the document score. Short human passages between AI passages can be highlighted.
- Scanned PDFs have no text layer. Upload page images for OCR instead. OCR is English-only.
- Rate limits are per server instance (see above).
