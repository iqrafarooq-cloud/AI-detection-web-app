"use client";

import { useMemo, useState } from "react";
import { Card, cx } from "@/components/ui";

const FLAG_LABELS = {
  stock_phrase: "Formulaic phrase",
  repeated_opener: "Repeated opening",
  repetition: "Repeated phrase",
  long_sentence: "Long sentence",
};

const pct = (n) => `${Math.round(n * 100)}%`;

/** Rebuilds the analysed text as segments, keeping the gaps between sentences. */
function useSegments(text, items) {
  return useMemo(() => {
    const out = [];
    let cursor = 0;
    items.forEach((s, i) => {
      if (s.start > cursor) out.push({ gap: true, text: text.slice(cursor, s.start) });
      out.push({ index: i, text: text.slice(s.start, s.end) });
      cursor = s.end;
    });
    if (cursor < text.length) out.push({ gap: true, text: text.slice(cursor) });
    return out;
  }, [text, items]);
}

function aiClass(p, active) {
  if (active) return "bg-red-200 ring-2 ring-red-400/60";
  if (p >= 0.9) return "bg-red-100 hover:bg-red-200";
  if (p >= 0.7) return "bg-red-50 hover:bg-red-100 ring-1 ring-red-200";
  return "bg-amber-50 hover:bg-amber-100 ring-1 ring-amber-200";
}

export default function SentenceView({ text, patterns, detection }) {
  const modelSentences = detection.status === "ok" ? detection.sentences || [] : [];
  const inlineModel = modelSentences.length > 0 && modelSentences.every((s) => Number.isInteger(s.start));
  const listModel = modelSentences.length > 0 && !inlineModel;
  const [tab, setTab] = useState(modelSentences.length ? "model" : "patterns");
  const [active, setActive] = useState(null);

  const flaggedPatterns = patterns.sentences.filter((s) => s.flags.length).length;
  const flaggedModel = modelSentences.filter((s) => s.flagged ?? s.aiProbability >= 0.5).length;

  function switchTab(t) {
    setTab(t);
    setActive(null);
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Sentence-level analysis</h2>
        <div role="tablist" aria-label="Sentence view" className="inline-flex rounded-xl bg-slate-100 p-1 text-sm">
          {modelSentences.length > 0 && (
            <TabButton selected={tab === "model"} onClick={() => switchTab("model")}>
              AI likelihood ({flaggedModel})
            </TabButton>
          )}
          <TabButton selected={tab === "patterns"} onClick={() => switchTab("patterns")}>
            Writing patterns ({flaggedPatterns})
          </TabButton>
        </div>
      </div>

      {tab === "model" && inlineModel && (
        <>
          <Legend />
          <InlineText
            text={text}
            items={modelSentences}
            active={active}
            onSelect={setActive}
            isMarked={(s) => s.flagged}
            markClass={(s, isActive) => aiClass(s.aiProbability, isActive)}
            detail={
              active !== null ? (
                <ModelDetail s={modelSentences[active]} />
              ) : (
                <Hint>
                  {flaggedModel
                    ? "Select a highlighted sentence to see its scores. Each sentence is scored together with up to two neighbouring sentences, and is only highlighted when its surrounding chunk also reads as AI."
                    : "No sentences read as AI-generated."}
                </Hint>
              )
            }
          />
        </>
      )}

      {tab === "model" && listModel && (
        <div className="mt-5">
          <p className="mb-3 text-xs text-slate-500">Per-sentence AI likelihood as reported by the detector. Single sentences carry little evidence on their own - read them as hints.</p>
          <ol className="max-h-[560px] space-y-1.5 overflow-y-auto">
            {modelSentences.map((s, i) => (
              <li key={i} className={cx("flex items-start gap-3 rounded-lg px-3 py-2 text-sm", s.aiProbability >= 0.5 ? "bg-red-50" : "bg-slate-50")}>
                <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-slate-600">{s.aiProbability === null ? "-" : pct(s.aiProbability)}</span>
                <span className="text-slate-800">{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === "patterns" && (
        <InlineText
          text={text}
          items={patterns.sentences}
          active={active}
          onSelect={setActive}
          isMarked={(s) => s.flags.length > 0}
          markClass={(_, isActive) => (isActive ? "bg-amber-200" : "bg-amber-100/70 underline decoration-amber-400 decoration-2 underline-offset-4 hover:bg-amber-200")}
          detail={
            active !== null ? (
              <PatternDetail s={patterns.sentences[active]} />
            ) : (
              <Hint>
                {flaggedPatterns
                  ? "Select a highlighted sentence to see why it was flagged. These are style issues (formulaic phrases, repetition, very long sentences), not proof of AI use."
                  : "No sentences were flagged for formulaic or repetitive patterns."}
              </Hint>
            )
          }
        />
      )}
    </Card>
  );
}

function InlineText({ text, items, active, onSelect, isMarked, markClass, detail }) {
  const segments = useSegments(text, items);
  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="max-h-[560px] overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50/70 p-4 text-[15px] leading-loose text-slate-800">
        {segments.map((seg, i) => {
          if (seg.gap) return <span key={i}>{seg.text}</span>;
          const s = items[seg.index];
          if (!isMarked(s)) return <span key={i}>{seg.text}</span>;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onSelect(seg.index)}
              aria-pressed={active === seg.index}
              className={cx("rounded px-0.5 text-left transition-colors", markClass(s, active === seg.index))}
            >
              {seg.text}
            </button>
          );
        })}
      </div>
      <div className="lg:sticky lg:top-24 lg:self-start">{detail}</div>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-red-100" /> 90%+ AI likelihood</span>
      <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-red-50 ring-1 ring-red-200" /> 70-90%</span>
      <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-amber-50 ring-1 ring-amber-200" /> 50-70%</span>
      <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded ring-1 ring-slate-200" /> not highlighted</span>
    </div>
  );
}

function Hint({ children }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm leading-relaxed text-slate-500">{children}</div>;
}

function ModelDetail({ s }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50/60 p-4 animate-fade-in">
      <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Sentence scores</p>
      <p className="mt-2 text-sm italic text-slate-700">&ldquo;{s.text}&rdquo;</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        <Row label="AI likelihood (with context)" value={pct(s.aiProbability)} />
        <Row label="Surrounding chunk" value={pct(s.chunkAiProbability)} />
        <Row label="GPT-2 perplexity" value={s.perplexity ?? "-"} />
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">Sentence-level scores are less reliable than the overall score. Use them to see which parts drive the result, not as proof about any single sentence.</p>
    </div>
  );
}

function PatternDetail({ s }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 animate-fade-in">
      <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Why this was flagged</p>
      <p className="mt-2 text-sm italic text-slate-700">&ldquo;{s.text}&rdquo;</p>
      <ul className="mt-3 space-y-2">
        {s.flags.map((f, i) => (
          <li key={i} className="text-sm text-slate-700">
            <span className="font-medium text-slate-900">{FLAG_LABELS[f.type] || f.type}</span>
            {f.match && f.type !== "repeated_opener" && <span className="text-slate-500"> - &ldquo;{f.match}&rdquo;</span>}
            <span className="block text-slate-600">{f.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-slate-600">{label}</dt>
      <dd className="font-semibold tabular-nums text-slate-900">{value}</dd>
    </div>
  );
}

function TabButton({ selected, children, ...props }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      className={cx("rounded-lg px-3 py-1.5 font-medium transition-colors", selected ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}
      {...props}
    >
      {children}
    </button>
  );
}
