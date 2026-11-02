import Link from "next/link";
import { ArrowRight, ScanSearch } from "lucide-react";
import { Card, cx } from "@/components/ui";

const pct = (n) => `${(n * 100).toFixed(1)}%`;

/** Honest before/after comparison from the same detector used on the Detector page. */
export default function RecheckCard({ recheck, pipeline, model }) {
  if (!recheck) return null;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          <ScanSearch className="size-4 text-brand-600" aria-hidden /> Detector re-check
        </h3>
        {pipeline && (
          <p className="text-xs text-slate-500">
            {pipeline.map((p, i) => (
              <span key={p.step}>
                {i > 0 && " → "}
                {p.label} <span className="tabular-nums">({(p.ms / 1000).toFixed(1)}s)</span>
              </span>
            ))}
            {model && <> · {model}</>}
          </p>
        )}
      </div>

      {recheck.available ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <Score label="Original" value={recheck.before} />
            <ArrowRight className="size-5 text-slate-400" aria-hidden />
            <Score label="Improved" value={recheck.after} />
            <span
              className={cx(
                "rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
                recheck.delta <= -0.1 ? "bg-emerald-50 text-emerald-700" : recheck.delta >= 0.1 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"
              )}
            >
              {recheck.delta > 0 ? "+" : ""}
              {(recheck.delta * 100).toFixed(1)} pts
            </span>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            {recheck.delta <= -0.1
              ? "The detector now finds the text less AI-like."
              : "The score did not drop meaningfully."}{" "}
            Text rewritten by an AI model is still AI-generated text, and this detector is trained to recognise paraphrased AI writing, so a large drop is not expected. The edit improves clarity and flow. The only way to make writing genuinely yours is to rework it in your own words, adding your own examples and judgement.
          </p>
        </>
      ) : (
        <p className="mt-3 text-sm text-slate-600">{recheck.reason}</p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Scores come from the same open-source detector as the AI Detector page.{" "}
        <Link href="/how-it-works#humanizer" className="font-medium text-brand-600 hover:underline">
          How the pipeline works
        </Link>
      </p>
    </Card>
  );
}

function Score({ label, value }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold tabular-nums text-slate-900">{pct(value)}</p>
      <p className="text-[11px] text-slate-500">AI probability</p>
    </div>
  );
}
