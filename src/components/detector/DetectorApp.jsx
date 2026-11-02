"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ScanSearch, ShieldQuestion, PenLine } from "lucide-react";
import TextInputPanel from "@/components/text/TextInputPanel";
import { Alert, Button, Card, EmptyState, Spinner } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import { useStatus } from "@/lib/client/useStatus";
import { DRAFT_KEY, clearSession, loadSession, saveSession } from "@/lib/client/files";
import DetectionSummary from "./DetectionSummary";
import PatternReport from "./PatternReport";
import SentenceView from "./SentenceView";

export default function DetectorApp() {
  const status = useStatus();
  const [text, setText] = useState("");
  const [result, setResult] = useState(null);
  const [analyzedText, setAnalyzedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const maxChars = status?.limits?.analyzeMaxChars ?? 50000;

  useEffect(() => {
    const draft = loadSession(DRAFT_KEY);
    if (draft?.text) {
      // Hydrate from the landing page hand-off once on mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(draft.text);
      clearSession(DRAFT_KEY);
    }
    return () => abortRef.current?.abort();
  }, []);

  async function analyze() {
    setError("");
    if (!text.trim()) return setError("Please enter or upload some text to analyze.");
    if (text.length > maxChars) return setError(`Text is too long. The limit is ${maxChars.toLocaleString()} characters.`);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await postJson("/api/analyze", { text }, { signal: controller.signal });
      setResult(res);
      setAnalyzedText(text.replace(/\r\n/g, "\n"));
      requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setText("");
    setResult(null);
    setAnalyzedText("");
    setError("");
  }

  function sendToHumanizer() {
    saveSession(DRAFT_KEY, { text: analyzedText || text });
  }

  return (
    <div className="space-y-8">
      {status && !status.detection.configured && (
        <Alert tone="info" title="No AI-detection model is configured on this server">
          You can still run the transparent writing-pattern analysis (style signals like repetition and formulaic phrasing), but Detectly will not show an AI-authorship estimate until the operator connects a detection provider. We never invent detection scores.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <TextInputPanel
          value={text}
          onChange={setText}
          maxChars={maxChars}
          onReset={reset}
          onError={setError}
          disabled={loading}
          placeholder="Paste at least a few sentences. Longer passages (150+ words) give more meaningful results."
        />
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <p className="font-semibold text-slate-900">Analyze text</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              {status?.detection.configured ? (
                <>
                  Detection by <span className="font-medium text-slate-700">{status.detection.name}</span>
                  {status.detection.id === "local" ? " running on our server (your text is not sent to a third party)" : ""}, plus writing-pattern analysis. English only, 40+ words.
                </>
              ) : (
                "Writing-pattern analysis only."
              )}
            </p>
          </div>
          <Button variant="gradient" size="lg" onClick={analyze} loading={loading} disabled={!text.trim()}>
            {!loading && <ScanSearch className="size-5" aria-hidden />}
            {loading ? "Analyzing..." : "Analyze Text"}
          </Button>
          <p className="text-xs leading-relaxed text-slate-500">
            Results are statistical estimates, not proof of authorship. Clear, grammatical writing is not a sign of AI on its own.
          </p>
        </Card>
      </div>

      {error && <Alert tone="error" title="Couldn't analyze the text">{error}</Alert>}

      <section id="results" aria-live="polite" className="scroll-mt-24">
        {loading && (
          <Card className="flex items-center justify-center gap-3 p-10 text-sm text-slate-600">
            <Spinner />
            <span>
              Running the detector model, perplexity scoring and pattern analysis...
              <span className="mt-1 block text-xs text-slate-500">The first analysis after a server restart can take up to a minute while the models load.</span>
            </span>
          </Card>
        )}
        {!loading && !result && (
          <Card>
            <EmptyState icon={ShieldQuestion} title="Your analysis will appear here">
              Paste text above and select Analyze Text. You&apos;ll see an overall estimate (when a detector is configured), style signals and sentence-level highlights with explanations.
            </EmptyState>
          </Card>
        )}
        {!loading && result && (
          <div className="space-y-6 animate-fade-in">
            <div className="grid gap-6 lg:grid-cols-2">
              <DetectionSummary detection={result.detection} disclaimer={result.disclaimer} />
              <PatternReport patterns={result.patterns} />
            </div>
            <SentenceView text={analyzedText} patterns={result.patterns} detection={result.detection} />
            {result.history?.signedIn && (
              <p className="text-xs text-slate-500">
                {result.history.saved ? "Saved to your history." : "Not saved - history saving is off."}{" "}
                <Link href="/dashboard" className="font-medium text-brand-600 hover:underline">
                  Manage in dashboard
                </Link>
              </p>
            )}
            <Card className="flex flex-col items-start justify-between gap-4 p-5 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium text-slate-900">Want clearer, more natural writing?</p>
                <p className="text-sm text-slate-500">Send this text to the Humanizer. Your original stays untouched.</p>
              </div>
              <Link
                href="/humanizer"
                onClick={sendToHumanizer}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-medium text-on-accent shadow-sm hover:bg-brand-hover"
              >
                <PenLine className="size-4" aria-hidden /> Improve this text
              </Link>
            </Card>
          </div>
        )}
      </section>
    </div>
  );
}
