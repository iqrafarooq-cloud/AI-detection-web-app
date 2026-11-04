"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { History, ScanSearch, ShieldQuestion, PenLine, Trash2 } from "lucide-react";
import TextInputPanel from "@/components/text/TextInputPanel";
import { Alert, Badge, Button, Card, EmptyState, Spinner } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import { useStatus } from "@/lib/client/useStatus";
import { usePersistentState } from "@/lib/client/usePersistentState";
import { DRAFT_KEY, clearSession, loadSession, saveSession } from "@/lib/client/files";
import DetectionSummary, { CLASSIFICATIONS } from "./DetectionSummary";
import PatternReport from "./PatternReport";
import SentenceView from "./SentenceView";

export default function DetectorApp() {
  const status = useStatus();
  const [text, setText] = usePersistentState("detector:text", "");
  const [result, setResult] = usePersistentState("detector:result", null);
  const [analyzedText, setAnalyzedText] = usePersistentState("detector:analyzedText", "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortRef = useRef(null);
  const [history, setHistory] = useReportHistory();
  const maxChars = status?.limits?.analyzeMaxChars ?? 50000;

  useEffect(() => {
    const draft = loadSession(DRAFT_KEY);
    if (draft?.text) {
      // Hydrate from the landing page hand-off once on mount.
       
      setText(draft.text);
      setResult(null);
      setAnalyzedText("");
      clearSession(DRAFT_KEY);
    }
    return () => abortRef.current?.abort();
  }, [setText, setResult, setAnalyzedText]);

  async function analyze() {
    if (loading) return; // one request at a time
    setError("");
    if (!text.trim()) return setError("Please enter or upload some text to analyze.");
    if (text.length > maxChars) return setError(`Text is too long. The limit is ${maxChars.toLocaleString()} characters.`);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await postJson("/api/analyze", { text }, { signal: controller.signal });
      const analyzed = text.replace(/\r\n/g, "\n");
      setResult(res);
      setAnalyzedText(analyzed);
      if (res.detection?.status === "ok") {
        setHistory((h) => [{ id: `${Date.now()}`, at: new Date().toISOString(), text: analyzed, result: res }, ...h].slice(0, HISTORY_MAX));
      }
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
            <p className="font-semibold text-slate-900">Detect AI writing</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              {!status || status.detection.configured
                ? "AI detection running on our server (your text is not sent to a third party), plus writing-pattern analysis. Calibrated for English, 20+ words."
                : "Writing-pattern analysis only."}
            </p>
          </div>
          <Button variant="gradient" size="lg" onClick={analyze} loading={loading} disabled={!text.trim()}>
            {!loading && <ScanSearch className="size-5" aria-hidden />}
            {loading ? "Detecting..." : "Detect AI"}
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
              Running the detection model and pattern analysis...
              <span className="mt-1 block text-xs text-slate-500">The first detection after a server restart can take up to a minute while the model loads.</span>
            </span>
          </Card>
        )}
        {!loading && !result && (
          <Card>
            <EmptyState icon={ShieldQuestion} title="Your analysis will appear here">
              Paste text above and select Detect AI. You&apos;ll get a classification with AI and human probabilities, plus style signals and passage-level highlights.
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

      {history.length > 0 && (
        <ReportHistory
          items={history}
          onOpen={(item) => {
            abortRef.current?.abort();
            setText(item.text);
            setAnalyzedText(item.text);
            setResult(item.result);
            setError("");
            requestAnimationFrame(() => document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
          }}
          onClear={() => setHistory([])}
        />
      )}
    </div>
  );
}

// Recent reports are kept only in this browser (localStorage), never on the server.
const HISTORY_KEY = "detectly:report-history";
const HISTORY_MAX = 10;

function useReportHistory() {
  const [items, setItems] = useState([]);
  const loaded = useRef(false);
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      try {
        const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
        // eslint-disable-next-line react-hooks/set-state-in-effect
        if (Array.isArray(stored) && stored.length) setItems(stored);
      } catch {
        /* storage unavailable or corrupt: start empty */
      }
      return;
    }
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    } catch {
      // Quota exceeded: keep the newest half.
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, Math.ceil(items.length / 2))));
      } catch {
        /* storage unavailable */
      }
    }
  }, [items]);
  return [items, setItems];
}

function ReportHistory({ items, onOpen, onClear }) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
          <History className="size-5 text-brand-600" aria-hidden /> Recent reports
        </h2>
        <Button variant="secondary" size="sm" onClick={onClear}>
          <Trash2 className="size-3.5" aria-hidden /> Clear history
        </Button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Saved only in this browser. Nothing is stored on our server.</p>
      <ul className="mt-4 divide-y divide-slate-100">
        {items.map((item) => {
          const d = item.result.detection;
          const c = CLASSIFICATIONS[d.classification];
          return (
            <li key={item.id}>
              <button type="button" onClick={() => onOpen(item)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-2 py-3 text-left hover:bg-slate-50">
                {c && <Badge tone={c.tone}>{c.label}</Badge>}
                {d.content && (
                  <span className="text-xs tabular-nums text-slate-600">
                    AI {d.content.ai}% · Human {d.content.human}%
                  </span>
                )}
                <span className="min-w-0 flex-1 basis-full truncate text-sm text-slate-700 sm:basis-auto">{item.text.slice(0, 120)}</span>
                <span className="text-xs text-slate-400">{new Date(item.at).toLocaleString()}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

