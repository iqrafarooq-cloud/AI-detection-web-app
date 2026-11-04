"use client";

import { useMemo, useState } from "react";
import { Card, cx } from "@/components/ui";
import { GROUP_LABELS } from "./DetectionSummary";

const FLAG_LABELS = {
  stock_phrase: "Formulaic phrase",
  repeated_opener: "Repeated opening",
  repetition: "Repeated phrase",
  long_sentence: "Long sentence",
};

const pct = (n) => `${Math.round(n * 100)}%`;

const MARK = {
  ai: { idle: "bg-red-100/80 hover:bg-red-200", active: "bg-red-200 ring-2 ring-red-400/60" },
  human: { idle: "bg-emerald-100/70 hover:bg-emerald-200", active: "bg-emerald-200 ring-2 ring-emerald-400/60" },
};

const WHY = {
  ai: "The sentence group this sentence belongs to has word-sequence patterns the model strongly associates with AI-generated text.",
  human: "The sentence group this sentence belongs to has word-sequence patterns the model associates with human writing.",
  not_analyzed: "This part of a long text was not scored, to keep the analysis fast. The overall result is based on evenly spaced samples of the text.",
};

/** Rebuilds the analysed text as segments, keeping the gaps between sentences. */
function useSegments(text, items) {
  return useMemo(() => {
    const out = [];
    let cursor = 0;
    items.forEach((s, i) => {
      if (s.start < cursor) return;
      if (s.start > cursor) out.push({ gap: true, text: text.slice(cursor, s.start) });
      out.push({ index: i, text: text.slice(s.start, s.end) });
      cursor = s.end;
    });
    if (cursor < text.length) out.push({ gap: true, text: text.slice(cursor) });
    return out;
  }, [text, items]);
}

export default function SentenceView({ text, patterns, detection }) {
  const ok = detection.status === "ok";
  const sentences = useMemo(() => (ok && Array.isArray(detection.sentences) ? detection.sentences : []), [ok, detection.sentences]);
  const [tab, setTab] = useState(sentences.length ? "model" : "patterns");
  const [active, setActive] = useState(null);

  // Writing-pattern flags and length of each sentence, matched by position.
  const patternByStart = useMemo(() => new Map(patterns.sentences.map((s) => [s.start, s])), [patterns]);
  const avgWords = patterns.metrics.avgSentenceLength || 0;

  const counts = useMemo(() => {
    const c = { ai: 0, human: 0 };
    for (const s of sentences) if (s.classification in c) c[s.classification]++;
    return c;
  }, [sentences]);
  const flaggedPatterns = patterns.sentences.filter((s) => s.flags.length).length;

  function switchTab(t) {
    setTab(t);
    setActive(null);
  }

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Sentence-level analysis</h2>
        <div role="tablist" aria-label="Sentence view" className="inline-flex rounded-xl bg-slate-100 p-1 text-sm">
          {sentences.length > 0 && (
            <TabButton selected={tab === "model"} onClick={() => switchTab("model")}>
              AI / Human ({sentences.length})
            </TabButton>
          )}
          <TabButton selected={tab === "patterns"} onClick={() => switchTab("patterns")}>
            Writing patterns ({flaggedPatterns})
          </TabButton>
        </div>
      </div>

      {tab === "model" && sentences.length > 0 && (
        <>
          <Legend counts={counts} />
          <InlineText
            text={text}
            items={sentences}
            active={active}
            onSelect={setActive}
            isMarked={(s) => s.classification in MARK}
            markClass={(s, isActive) => MARK[s.classification][isActive ? "active" : "idle"]}
            detail={
              active !== null ? (
                <SentenceDetail
                  s={sentences[active]}
                  text={text}
                  group={detection.segments?.[sentences[active].group]}
                  pattern={patternByStart.get(sentences[active].start)}
                  avgWords={avgWords}
                />
              ) : (
                <Hint>
                  Select any highlighted sentence to see why it got its label. Sentences are judged in small groups of neighbouring sentences, because a single sentence carries too little evidence on its own.
                </Hint>
              )
            }
          />
        </>
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

function Legend({ counts }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-600">
      <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-red-200" /> AI-generated ({counts.ai})</span>
      <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded bg-emerald-200" /> Human-written ({counts.human})</span>
      <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded ring-1 ring-slate-300" /> Not analyzed</span>
    </div>
  );
}

function Hint({ children }) {
  return <div className="rounded-xl border border-dashed border-slate-200 p-4 text-sm leading-relaxed text-slate-500">{children}</div>;
}

function strengthOf(p) {
  const d = Math.abs(p - 0.5);
  return d >= 0.4 ? "Strong" : d >= 0.25 ? "Moderate" : "Weak";
}

function SentenceDetail({ s, text, group, pattern, avgWords }) {
  const label = GROUP_LABELS[s.classification] ?? GROUP_LABELS.not_analyzed;
  const p = group?.aiProbability;
  const indicators = [];
  if (avgWords && s.words >= avgWords * 1.8) indicators.push(["Much longer than average", `${s.words} words vs. ${avgWords} on average. Varied sentence length is common in human writing.`]);
  else if (avgWords && s.words <= avgWords * 0.45) indicators.push(["Much shorter than average", `${s.words} words vs. ${avgWords} on average. Varied sentence length is common in human writing.`]);
  for (const f of pattern?.flags ?? []) indicators.push([FLAG_LABELS[f.type] || f.type, f.reason]);
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 animate-fade-in">
      <p className={cx("text-xs font-semibold uppercase tracking-wide", label.text)}>{label.label}</p>
      <p className="mt-2 text-sm italic text-slate-700">&ldquo;{text.slice(s.start, s.end)}&rdquo;</p>
      {typeof p === "number" && (
        <dl className="mt-3 space-y-1.5 text-sm">
          <Row label="Group AI likelihood" value={pct(p)} />
          <Row label="Signal strength" value={strengthOf(p)} />
          <Row label="Group size" value={`${group.sentences} sentence${group.sentences === 1 ? "" : "s"}, ${group.words} words`} />
        </dl>
      )}
      <p className="mt-3 text-sm leading-relaxed text-slate-600">{WHY[s.classification] ?? WHY.not_analyzed}</p>
      {indicators.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Style indicators in this sentence</p>
          <ul className="mt-2 space-y-1.5">
            {indicators.map(([title, why], i) => (
              <li key={i} className="text-sm text-slate-700">
                <span className="font-medium text-slate-900">{title}</span>
                <span className="block text-xs text-slate-600">{why}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-slate-500">Style indicators are shown for context. They do not change the label.</p>
        </div>
      )}
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
      <dd className="text-right font-semibold tabular-nums text-slate-900">{value}</dd>
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
