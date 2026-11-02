"use client";

import { useState } from "react";
import Link from "next/link";
import { ScanText, ChevronDown, Layers, ExternalLink, HelpCircle, Shuffle, UserRound } from "lucide-react";
import { Alert, Badge, Card, cx } from "@/components/ui";

const VERDICTS = {
  likely_ai: { label: "Likely AI-generated", tone: "red", icon: ScanText, text: "The model finds strong statistical signs of AI-generated text." },
  likely_human: { label: "Likely human-written", tone: "green", icon: UserRound, text: "The model finds the text consistent with human writing." },
  mixed: { label: "Mixed", tone: "violet", icon: Shuffle, text: "Some parts read as AI-generated and others as human-written. It may be AI-assisted or edited." },
  uncertain: { label: "Uncertain", tone: "amber", icon: HelpCircle, text: "The score sits in the uncertain middle band - the model can't lean either way with confidence." },
};

const TONE = {
  red: { ring: "text-red-500", soft: "bg-red-50 text-red-600" },
  green: { ring: "text-emerald-500", soft: "bg-emerald-50 text-emerald-600" },
  violet: { ring: "text-violet-400", soft: "bg-violet-50 text-violet-600" },
  amber: { ring: "text-amber-500", soft: "bg-amber-50 text-amber-600" },
};

const pct = (n, d = 0) => `${(n * 100).toFixed(d)}%`;

export default function DetectionSummary({ detection, disclaimer }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">AI-detection report</h2>
        {detection.provider && (
          <a href={detection.provider.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-brand-600">
            {detection.provider.name} <ExternalLink className="size-3" aria-hidden />
          </a>
        )}
      </div>
      <div className="mt-5">{detection.status === "ok" ? <Report d={detection} /> : <Unavailable detection={detection} />}</div>
      <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
        {disclaimer}{" "}
        <Link href="/how-it-works" className="font-medium text-brand-600 hover:underline">
          How the score is calculated
        </Link>
      </p>
    </Card>
  );
}

function Gauge({ value, toneClass }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-36 shrink-0">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden>
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-slate-100" />
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" stroke="currentColor" className={cx(toneClass, "transition-[stroke-dashoffset] duration-700")} strokeDasharray={c} strokeDashoffset={c * (1 - value)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-slate-900">{pct(value)}</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">AI probability</span>
      </div>
    </div>
  );
}

function Report({ d }) {
  const [open, setOpen] = useState(false);
  const v = VERDICTS[d.verdict] || VERDICTS.uncertain;
  const tone = TONE[v.tone];
  const Icon = v.icon;
  const isLocal = d.provider?.id === "local";
  const flagged = d.sentences?.filter((s) => s.flagged ?? s.aiProbability >= 0.5).length ?? 0;

  return (
    <div>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <Gauge value={d.scores.ai} toneClass={tone.ring} />
        <div className="w-full">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("inline-flex size-8 items-center justify-center rounded-lg", tone.soft)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <p className="text-xl font-semibold text-slate-900">{v.label}</p>
            {d.confidence && <Badge>Confidence: {d.confidence}</Badge>}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{v.text}</p>
          {typeof d.aiShare === "number" && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs">
                <span className="font-medium text-slate-600">Share of text that reads as AI</span>
                <span className="tabular-nums font-semibold text-slate-800">{pct(d.aiShare)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-red-400" style={{ width: pct(d.aiShare) }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {flagged} of {d.sentences.length} sentences highlighted
              </p>
            </div>
          )}
        </div>
      </div>

      {d.metrics && (
        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Perplexity" value={d.metrics.perplexity} help="How predictable the text is to GPT-2 (lower = more predictable). AI text is often more predictable." />
          <Metric label="Burstiness" value={d.metrics.burstiness} help="Standard deviation of sentence perplexity. Human writing usually varies more from sentence to sentence." />
          <Metric label="Tokens scored" value={d.metrics.tokensScored} />
          <Metric label="Analysis time" value={`${(d.elapsedMs / 1000).toFixed(1)}s`} />
        </dl>
      )}

      {isLocal && (
        <div className="mt-5 rounded-xl border border-slate-200">
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700">
            <span className="inline-flex items-center gap-2">
              <Layers className="size-4 text-brand-600" aria-hidden /> Model details & chunk breakdown
            </span>
            <ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} aria-hidden />
          </button>
          {open && (
            <div className="space-y-4 border-t border-slate-100 px-4 py-4 text-sm animate-fade-in">
              <div className="grid gap-3 sm:grid-cols-2">
                <ModelCard title="Detector" model={d.models.detector} />
                <ModelCard title="Perplexity" model={d.models.perplexity} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-slate-500">
                    <tr>
                      <th className="py-1.5 pr-3 font-medium">Chunk</th>
                      <th className="py-1.5 pr-3 font-medium">Sentences</th>
                      <th className="py-1.5 pr-3 font-medium">Tokens</th>
                      <th className="py-1.5 pr-3 font-medium">Logits [human, AI]</th>
                      <th className="py-1.5 font-medium">P(AI)</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums text-slate-700">
                    {d.chunks.map((c, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="py-1.5 pr-3">{i + 1}</td>
                        <td className="py-1.5 pr-3">{c.sentences}</td>
                        <td className="py-1.5 pr-3">{c.tokens}</td>
                        <td className="py-1.5 pr-3 font-mono">[{c.logits.join(", ")}]</td>
                        <td className="py-1.5 font-semibold">{pct(c.aiProbability, 1)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.sentencesTruncated && <p className="text-xs text-amber-700">Sentence-level details cover the first 200 sentences; the overall score covers the whole text.</p>}
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        <span className="font-medium text-slate-600">How this was derived: </span>
        {d.verdictBasis}
      </p>
    </div>
  );
}

function Metric({ label, value, help }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5" title={help}>
      <dt className="flex items-center gap-1 text-xs text-slate-500">
        {label} {help && <HelpCircle className="size-3" aria-hidden />}
      </dt>
      <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{value ?? "-"}</dd>
      {help && <span className="sr-only">{help}</span>}
    </div>
  );
}

function ModelCard({ title, model }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</p>
      <a href={model.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-slate-800 hover:text-brand-600">
        {model.name} <ExternalLink className="size-3" aria-hidden />
      </a>
      <p className="mt-0.5 break-all font-mono text-[11px] text-slate-500">{model.id}</p>
      {model.benchmark && <p className="mt-1 text-xs text-slate-600">{model.benchmark}</p>}
    </div>
  );
}

function Unavailable({ detection }) {
  const map = {
    not_configured: ["info", "No estimate available"],
    too_short: ["warning", "Text too short for a reliable score"],
    unsupported_language: ["warning", "Language not supported by the detector"],
  };
  const [tone, title] = map[detection.status] || ["error", "Detection unavailable"];
  return (
    <Alert tone={tone} title={title}>
      {detection.message}
      {tone === "error" && " The writing-pattern analysis still ran."}
    </Alert>
  );
}
