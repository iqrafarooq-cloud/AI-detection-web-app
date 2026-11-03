"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, FileText, ListCollapse } from "lucide-react";
import TextInputPanel from "@/components/text/TextInputPanel";
import Segmented from "@/components/tools/Segmented";
import { Alert, Button, Card, EmptyState, Spinner } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import { useStatus } from "@/lib/client/useStatus";
import { usePersistentState } from "@/lib/client/usePersistentState";
import { DRAFT_KEY, clearSession, copyToClipboard, downloadTxt, loadSession } from "@/lib/client/files";
import { DEFAULT_SUMMARY_OPTIONS, SUMMARY_FORMATS, SUMMARY_LENGTHS } from "@/lib/services/summarize/options";

const MIN_WORDS = 40;

export default function SummarizerApp() {
  const status = useStatus();
  const [text, setText] = usePersistentState("summarizer:text", "");
  const [options, setOptions] = usePersistentState("summarizer:options", DEFAULT_SUMMARY_OPTIONS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = usePersistentState("summarizer:result", null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);
  const maxChars = status?.limits?.summarizeMaxChars ?? 15000;
  const unavailable = status && !status.rewrite.configured;

  useEffect(() => {
    const draft = loadSession(DRAFT_KEY);
    if (draft?.text) {
       
      setText(draft.text);
      setResult(null);
      clearSession(DRAFT_KEY);
    }
    return () => abortRef.current?.abort();
  }, [setText, setResult]);

  const set = (key) => (value) => setOptions((o) => ({ ...o, [key]: value }));

  async function summarize() {
    setError("");
    if (!text.trim()) return setError("Please enter or upload some text to summarize.");
    if (text.trim().split(/\s+/).length < MIN_WORDS) return setError(`Please provide at least ${MIN_WORDS} words - shorter text doesn't need a summary.`);
    if (text.length > maxChars) return setError(`Text is too long. The limit is ${maxChars.toLocaleString()} characters - summarize it in sections.`);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await postJson("/api/summarize", { text, options }, { signal: controller.signal });
      setResult(res);
      requestAnimationFrame(() => document.getElementById("summary-result")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function copy() {
    if (await copyToClipboard(result.summary)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setText("");
    setResult(null);
    setError("");
  }

  return (
    <div className="space-y-8">
      {unavailable && (
        <Alert tone="warning" title="Summarizing is currently unavailable">
          No language-model provider is configured on this server.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <TextInputPanel
          value={text}
          onChange={setText}
          maxChars={maxChars}
          onReset={reset}
          onError={setError}
          disabled={loading}
          placeholder="Paste an article, report, essay or meeting notes (40+ words)..."
        />
        <Card className="flex flex-col gap-4 p-5">
          <Segmented id="format" label="Format" value={options.format} onChange={set("format")} options={SUMMARY_FORMATS} />
          <p className="-mt-2 text-xs text-slate-500">{SUMMARY_FORMATS.find((f) => f.id === options.format)?.hint}</p>
          <Segmented id="length" label="Length" value={options.length} onChange={set("length")} options={SUMMARY_LENGTHS} />
          <Button variant="gradient" size="lg" onClick={summarize} loading={loading} disabled={!text.trim() || unavailable}>
            {!loading && <ListCollapse className="size-5" aria-hidden />}
            {loading ? "Summarizing..." : "Summarize"}
          </Button>
          <p className="text-xs leading-relaxed text-slate-500">
            Summaries only use what&apos;s in your text. Numbers that don&apos;t match the original are flagged for you to check.
          </p>
        </Card>
      </div>

      {error && <Alert tone="error" title="Couldn't summarize the text">{error}</Alert>}

      <section id="summary-result" aria-live="polite" className="scroll-mt-24">
        {loading && (
          <Card className="flex items-center justify-center gap-3 p-10 text-sm text-slate-600">
            <Spinner />
            <span>Reading and condensing your text... usually 5-30 seconds.</span>
          </Card>
        )}
        {!loading && !result && (
          <Card>
            <EmptyState icon={FileText} title="Your summary will appear here">
              Choose a format and length, then select Summarize.
            </EmptyState>
          </Card>
        )}
        {!loading && result && (
          <div className="space-y-4 animate-fade-in">
            <div className="grid gap-4 sm:grid-cols-3">
              <Stat label="Original" value={`${result.stats.originalWords.toLocaleString()} words`} />
              <Stat label="Summary" value={`${result.stats.summaryWords.toLocaleString()} words`} />
              <Stat label="Shorter by" value={`${result.stats.reduction}%`} highlight />
            </div>
            {result.unsupportedFigures?.length > 0 && (
              <Alert tone="warning" title="Check these figures against your original">
                The summary contains {result.unsupportedFigures.map((f, i) => (
                  <span key={f}>
                    {i > 0 && ", "}
                    <strong>{f}</strong>
                  </span>
                ))}
                , which {result.unsupportedFigures.length === 1 ? "doesn't" : "don't"} appear exactly in your text. Edit before using it.
              </Alert>
            )}
            <Card className="p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-semibold text-slate-900">
                  {SUMMARY_FORMATS.find((f) => f.id === result.options.format)?.label} ·{" "}
                  <span className="font-normal text-slate-500">{SUMMARY_LENGTHS.find((l) => l.id === result.options.length)?.label}</span>
                </h2>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={copy}>
                    {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => downloadTxt(result.summary, "detectly-summary.txt")}>
                    <Download className="size-3.5" aria-hidden /> .txt
                  </Button>
                </div>
              </div>
              <SummaryBody text={result.summary} />
            </Card>
            <p className="text-xs text-slate-500">
              Summarized by {result.provider.name} ({result.provider.model}). Always check a summary against the source before relying on it.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={highlight ? "mt-1 text-xl font-semibold tabular-nums text-brand-700" : "mt-1 text-xl font-semibold tabular-nums text-slate-900"}>{value}</p>
    </Card>
  );
}

/** Renders "- " bullet lines as a list and everything else as paragraphs. */
function SummaryBody({ text: raw }) {
  // Models sometimes add markdown bold; show it as plain text.
  const text = raw.replace(/\*\*(.+?)\*\*/g, "$1");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullet = /^[-*•]\s+/;
  if (lines.length && lines.every((l) => bullet.test(l))) {
    return (
      <ul className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-slate-800 marker:text-brand-600">
        {lines.map((l, i) => (
          <li key={i}>{l.replace(bullet, "")}</li>
        ))}
      </ul>
    );
  }
  return (
    <div className="space-y-3 text-[15px] leading-relaxed text-slate-800">
      {text.split(/\n\s*\n/).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  );
}
