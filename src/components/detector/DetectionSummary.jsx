"use client";

import { useState } from "react";
import Link from "next/link";
import { Bot, ChevronDown, ExternalLink, Layers, UserRound } from "lucide-react";
import { Alert, Badge, Card, cx } from "@/components/ui";

// The verdict is always one of these two, shared by every page that shows a result.
export const CLASSIFICATIONS = {
  ai: { label: "Likely AI-Generated", tone: "red", icon: Bot, ring: "text-red-500", bar: "bg-red-500", soft: "bg-red-50 text-red-600" },
  human: { label: "Likely Human-Written", tone: "green", icon: UserRound, ring: "text-emerald-500", bar: "bg-emerald-500", soft: "bg-emerald-50 text-emerald-600" },
};

// Labels of sentence groups (content breakdown and highlights).
export const GROUP_LABELS = {
  ai: { label: "AI-generated", dot: "bg-red-500", bar: "bg-red-500", text: "text-red-600" },
  human: { label: "Human-written", dot: "bg-emerald-500", bar: "bg-emerald-500", text: "text-emerald-600" },
  not_analyzed: { label: "Not analyzed", dot: "bg-slate-300", bar: "bg-slate-300", text: "text-slate-500" },
};

const CONFIDENCE = { high: "High", medium: "Medium", low: "Low" };

export default function DetectionSummary({ detection, disclaimer }) {
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">AI-detection report</h2>
      </div>
      <div className="mt-5">{detection.status === "ok" ? <Report d={detection} /> : <Unavailable detection={detection} />}</div>
      {disclaimer && (
        <p className="mt-6 border-t border-slate-100 pt-4 text-xs leading-relaxed text-slate-500">
          {disclaimer}{" "}
          <Link href="/how-it-works" className="font-medium text-brand-600 hover:underline">
            How the result is calculated
          </Link>
        </p>
      )}
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
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke="currentColor"
          className={cx(toneClass, "transition-[stroke-dashoffset] duration-700")}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums text-slate-900">{value}%</span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">AI-generated</span>
      </div>
    </div>
  );
}

function Report({ d }) {
  // A result saved by an older version may lack the newer fields.
  const share = d.content ?? d.percentages;
  const c = CLASSIFICATIONS[d.classification] || (share.ai >= 50 ? CLASSIFICATIONS.ai : CLASSIFICATIONS.human);
  const Icon = c.icon;
  return (
    <div>
      {d.warnings?.map((w) => (
        <Alert key={w.code} tone="warning" title={w.title} className="mb-5">
          {w.message}
        </Alert>
      ))}
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <Gauge value={share.ai} toneClass={c.ring} />
        <div className="w-full">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("inline-flex size-8 items-center justify-center rounded-lg", c.soft)}>
              <Icon className="size-4" aria-hidden />
            </span>
            <p className="text-xl font-semibold text-slate-900">{c.label}</p>
            {d.confidence && <Badge tone={d.confidence === "high" ? "brand" : "neutral"}>Confidence: {CONFIDENCE[d.confidence]}</Badge>}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{d.explanation}</p>
        </div>
      </div>

      <ContentBreakdown share={share} coverage={d.coverage} />

      {d.segments?.length > 0 && <Details d={d} />}

      {d.basis && (
        <p className="mt-4 text-xs leading-relaxed text-slate-500">
          <span className="font-medium text-slate-600">How this was derived: </span>
          {d.basis}
        </p>
      )}
    </div>
  );
}

function ContentBreakdown({ share, coverage }) {
  const keys = ["ai", "human"];
  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-3">
        {keys.map((k) => (
          <div key={k} className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <span className={cx("size-2.5 shrink-0 rounded-full", GROUP_LABELS[k].dot)} aria-hidden />
              {GROUP_LABELS[k].label}
            </p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-slate-900">{share[k]}%</p>
          </div>
        ))}
      </div>
      <div
        className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-slate-100"
        role="img"
        aria-label={`AI-generated ${share.ai} percent, human-written ${share.human} percent`}
      >
        {keys.map((k) => (
          <div key={k} className={cx("h-full", GROUP_LABELS[k].bar)} style={{ width: `${share[k]}%` }} />
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Share of the text that reads as AI-generated or human-written, judged a few sentences at a time.
        {coverage && ` ${coverage.analyzedWords.toLocaleString()} words in ${coverage.analyzedSentences.toLocaleString()} sentences analyzed`}
        {coverage?.sampled && ` (a long text: an evenly spaced sample of its ${coverage.totalWords.toLocaleString()} words was scored to keep the analysis fast)`}
        {coverage && "."}
      </p>
    </div>
  );
}

function Details({ d }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-5 rounded-xl border border-slate-200">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-slate-700"
      >
        <span className="inline-flex items-center gap-2">
          <Layers className="size-4 text-brand-600" aria-hidden /> Model details &amp; sentence groups
        </span>
        <ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="space-y-3 border-t border-slate-100 px-4 py-4 text-xs text-slate-600 animate-fade-in">
          {d.model && (
            <p>
              Model:{" "}
              <a href={d.model.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
                {d.model.name} <ExternalLink className="size-3" aria-hidden />
              </a>
              {d.calibration && <> · calibrated on {d.calibration.samples.toLocaleString()} labeled texts</>}
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Group</th>
                  <th className="py-1.5 pr-3 font-medium">Words</th>
                  <th className="py-1.5 pr-3 font-medium">AI likelihood</th>
                  <th className="py-1.5 font-medium">Reads as</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-slate-700">
                {d.segments.map((s, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3">{i + 1}</td>
                    <td className="py-1.5 pr-3">{s.words}</td>
                    <td className="py-1.5 pr-3 font-semibold">{s.aiProbability === null ? "-" : `${Math.round(s.aiProbability * 100)}%`}</td>
                    <td className="py-1.5">{GROUP_LABELS[s.classification]?.label ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Unavailable({ detection }) {
  const map = {
    not_configured: ["info", "No estimate available"],
    too_short: ["warning", "Not enough text for a reliable estimate"],
  };
  const [tone, title] = map[detection.status] || ["error", "Detection unavailable"];
  return (
    <Alert tone={tone} title={title}>
      {detection.message}
      {tone === "error" && " The writing-pattern analysis still ran."}
    </Alert>
  );
}
