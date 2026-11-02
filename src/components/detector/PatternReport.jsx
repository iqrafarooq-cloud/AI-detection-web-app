import { CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui";

const METRICS = [
  { key: "words", label: "Words" },
  { key: "sentences", label: "Sentences" },
  { key: "avgSentenceLength", label: "Avg. sentence length", suffix: " words" },
  { key: "sentenceLengthVariation", label: "Rhythm variation", help: "Std. deviation ÷ mean of sentence length. Higher means more varied." },
  { key: "lexicalDiversity", label: "Vocabulary variety", help: "Moving-average type-token ratio (0-1)." },
  { key: "stockPhraseCount", label: "Stock phrases" },
];

export default function PatternReport({ patterns }) {
  const { metrics, signals } = patterns;
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-slate-900">Writing-pattern analysis</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Rule-based style signals computed by Detectly. They describe how the text reads - they are not an AI detector and do not estimate authorship.
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {METRICS.map((m) => (
          <div key={m.key} className="rounded-xl bg-slate-50 px-3 py-2.5" title={m.help}>
            <dt className="text-xs text-slate-500">{m.label}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">
              {metrics[m.key]}
              {m.suffix && <span className="text-xs font-normal text-slate-500">{m.suffix}</span>}
            </dd>
          </div>
        ))}
      </dl>

      <ul className="mt-5 space-y-2.5">
        {signals.length === 0 && (
          <li className="flex gap-2.5 text-sm text-slate-600">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-500" aria-hidden />
            No notable formulaic or repetitive patterns found.
          </li>
        )}
        {signals.map((s) => (
          <li key={s.id} className="flex gap-2.5 text-sm">
            {s.level === "notice" ? (
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-brand-500" aria-hidden />
            )}
            <span>
              <span className="font-medium text-slate-800">{s.title}.</span> <span className="text-slate-600">{s.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
