"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { chunkText } from "@/lib/text/chunk";
import Link from "next/link";
import { ChevronDown, SlidersHorizontal, PenLine } from "lucide-react";
import TextInputPanel from "@/components/text/TextInputPanel";
import { Alert, Button, Card, EmptyState, SelectField, Spinner, cx } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import { useStatus } from "@/lib/client/useStatus";
import { usePersistentState } from "@/lib/client/usePersistentState";
import { DRAFT_KEY, clearSession, loadSession } from "@/lib/client/files";
import { CONTROL_OPTIONS, CUSTOM_INSTRUCTIONS_MAX, DEFAULT_CONTROLS, WRITING_STYLES } from "@/lib/services/rewrite/options";
import ComparisonPanel from "./ComparisonPanel";

const CONTROL_LABELS = {
  tone: "Writing tone",
  formality: "Formality",
  complexity: "Sentence complexity",
  vocabulary: "Vocabulary level",
  paragraphLength: "Paragraph length",
  length: "Text length",
  englishLevel: "English level",
};

export default function HumanizerApp() {
  const status = useStatus();
  const [text, setText] = usePersistentState("humanizer:text", "");
  const [controls, setControls] = usePersistentState("humanizer:controls", DEFAULT_CONTROLS);
  const [showAdvanced, setShowAdvanced] = usePersistentState("humanizer:showAdvanced", false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Result session: the exact text that was submitted + a version history.
  const [session, setSession] = usePersistentState("humanizer:session", null);
  const abortRef = useRef(null);
  const maxChars = status?.limits?.humanizeMaxChars ?? 20000;
  const unavailable = status && !status.rewrite.configured;
  // Mirrors the server's section split so the wait message is honest for long texts.
  const chunkChars = status?.rewrite?.chunkChars;
  const sections = useMemo(() => (chunkChars && loading ? chunkText(text, chunkChars).length : 1), [text, chunkChars, loading]);

  useEffect(() => {
    const draft = loadSession(DRAFT_KEY);
    if (draft?.text) {
       
      setText(draft.text);
      setSession(null);
      clearSession(DRAFT_KEY);
    }
    return () => abortRef.current?.abort();
  }, [setText, setSession]);


  const set = (key) => (value) => setControls((c) => ({ ...c, [key]: value }));

  async function run(sourceText, { regenerate = false } = {}) {
    setError("");
    if (!sourceText.trim()) return setError("Please enter or upload some text to improve.");
    if (sourceText.trim().split(/\s+/).length < 3) return setError("Please provide at least a full sentence (3+ words).");
    if (sourceText.length > maxChars) return setError(`Text is too long. The limit is ${maxChars.toLocaleString()} characters - try splitting it into sections.`);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    // A new submission replaces the previous result immediately, so an old
    // comparison is never shown next to new input. Regenerate keeps the
    // session because it adds a version to it.
    if (!regenerate) setSession(null);
    setLoading(true);
    try {
      const res = await postJson("/api/humanize", { text: sourceText, controls }, { signal: controller.signal });
      const version = {
        text: res.improvedText,
        label: regenerate ? "Regenerated" : "Improved",
        preservation: res.preservation,
        style: res.controls.style,
        recheck: res.recheck,
        scope: res.scope,
        pipeline: res.pipeline,
        model: res.provider.model,
      };
      setSession((prev) => {
        if (regenerate && prev) {
          const versions = [...prev.versions.slice(0, prev.pos + 1), version];
          return { ...prev, versions, pos: versions.length - 1 };
        }
        return { original: sourceText.replace(/\r\n/g, "\n"), versions: [version], pos: 0, provider: res.provider };
      });
      if (!regenerate) {
        requestAnimationFrame(() => document.getElementById("comparison")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      }
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    setText("");
    setSession(null);
    setError("");
    setControls((c) => ({ ...DEFAULT_CONTROLS, style: c.style }));
  }

  return (
    <div className="space-y-8">
      {unavailable && (
        <Alert tone="warning" title="Writing improvement is currently unavailable">
          No language-model provider is configured on this server, so we can&apos;t rewrite text right now. The{" "}
          <Link className="font-medium underline" href="/detector">writing-pattern analysis</Link> still works.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <TextInputPanel
          label="Original text"
          value={text}
          onChange={setText}
          maxChars={maxChars}
          onReset={reset}
          onError={setError}
          disabled={loading}
          placeholder="Paste the text you want to make clearer and more natural..."
        />

        <Card className="flex flex-col gap-4 p-5">
          <SelectField
            id="style"
            label="Writing style"
            value={controls.style}
            onChange={set("style")}
            options={WRITING_STYLES.map((s) => ({ value: s.id, label: s.label }))}
            hint={WRITING_STYLES.find((s) => s.id === controls.style)?.hint}
          />
          <SelectField id="length" label="Text length" value={controls.length} onChange={set("length")} options={CONTROL_OPTIONS.length} />

          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            aria-expanded={showAdvanced}
            className="flex items-center justify-between rounded-xl px-1 py-1 text-sm font-medium text-slate-700 hover:text-brand-700"
          >
            <span className="inline-flex items-center gap-2">
              <SlidersHorizontal className="size-4" aria-hidden /> Advanced controls
            </span>
            <ChevronDown className={cx("size-4 transition-transform", showAdvanced && "rotate-180")} aria-hidden />
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-2 gap-3 animate-fade-in">
              {["tone", "formality", "complexity", "vocabulary", "paragraphLength", "englishLevel"].map((key) => (
                <SelectField key={key} id={key} label={CONTROL_LABELS[key]} value={controls[key]} onChange={set(key)} options={CONTROL_OPTIONS[key]} />
              ))}
              <label htmlFor="custom" className="col-span-2 block">
                <span className="mb-1.5 block text-xs font-medium text-slate-600">Custom instructions</span>
                <textarea
                  id="custom"
                  rows={3}
                  maxLength={CUSTOM_INSTRUCTIONS_MAX}
                  value={controls.customInstructions}
                  onChange={(e) => set("customInstructions")(e.target.value)}
                  placeholder="e.g. Keep British spelling. Don't change the headings."
                  className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-brand-500"
                />
                <span className="mt-1 block text-right text-xs text-slate-400">
                  {controls.customInstructions.length}/{CUSTOM_INSTRUCTIONS_MAX}
                </span>
              </label>
            </div>
          )}

          <Button variant="gradient" size="lg" onClick={() => run(text)} loading={loading && !session} disabled={!text.trim() || unavailable || loading}>
            {!(loading && !session) && <PenLine className="size-5" aria-hidden />}
            {loading && !session ? "Improving..." : "Improve Writing"}
          </Button>
          <p className="text-xs leading-relaxed text-slate-500">
            Two-step edit: restructure, then refine. Facts, numbers and citations are checked after every run, and both versions are re-scored by the same AI detector. Your original is never overwritten.
          </p>
        </Card>
      </div>

      {error && <Alert tone="error" title="Couldn't improve the text">{error}</Alert>}

      <section id="comparison" className="scroll-mt-24" aria-live="polite">
        {loading && !session && (
          <Card className="flex items-center justify-center gap-3 p-10 text-sm text-slate-600">
            <Spinner />
            <span>
              Step 1: restructuring sentences · Step 2: refining voice &amp; rhythm · then re-checking with the detector...
              <span className="mt-1 block text-xs text-slate-500">
                {sections > 1
                  ? `Long text: rewriting it in ${sections} sections, one after another. On the current plan this can take a few minutes - please keep this tab open.`
                  : "Usually 5-20 seconds."}
              </span>
            </span>
          </Card>
        )}
        {!loading && !session && (
          <Card>
            <EmptyState icon={PenLine} title="Your improved text will appear here">
              Choose a style, then select Improve Writing. You&apos;ll get a side-by-side comparison with every change highlighted.
            </EmptyState>
          </Card>
        )}
        {session && (
          <ComparisonPanel
            session={session}
            setSession={setSession}
            loading={loading}
            onRegenerate={() => run(session.original, { regenerate: true })}
          />
        )}
      </section>
    </div>
  );
}
