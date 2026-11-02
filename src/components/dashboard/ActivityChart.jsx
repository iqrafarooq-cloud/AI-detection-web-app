"use client";

import { useState } from "react";
import { cx } from "@/components/ui";

const SERIES = [
  { key: "analyses", label: "Analyses", color: "var(--chart-1)" },
  { key: "rewrites", label: "Rewrites", color: "var(--chart-2)" },
];

const dayFmt = (iso, opts) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { timeZone: "UTC", ...opts });

/** A "nice" axis maximum (1, 2, 5 x 10^n) so gridlines land on round numbers. */
function niceMax(v) {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 5, 10].map((m) => m * p).find((n) => n >= v);
}

/**
 * Daily activity as stacked bars (analyses at the base, rewrites on top).
 * Hover or arrow keys reveal the per-day tooltip; a table view mirrors the data.
 */
export default function ActivityChart({ series }) {
  const [active, setActive] = useState(null);
  const max = niceMax(Math.max(...series.map((d) => d.analyses + d.rewrites)));
  const hasData = series.some((d) => d.analyses + d.rewrites > 0);
  const point = active == null ? null : series[active];

  function onKeyDown(e) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    e.preventDefault();
    const last = series.length - 1;
    setActive((i) => {
      const cur = i ?? last;
      if (e.key === "Home") return 0;
      if (e.key === "End") return last;
      return Math.min(last, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)));
    });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />
            {s.label}
          </span>
        ))}
      </div>

      <div className="relative mt-5">
        {/* Gridlines + y labels (recessive) */}
        <div className="pointer-events-none absolute inset-0 bottom-6 flex flex-col justify-between" aria-hidden>
          {[max, max / 2, 0].map((v) => (
            <div key={v} className="flex items-center gap-2">
              <span className="w-6 text-right text-[10px] tabular-nums text-slate-400">{v}</span>
              <span className={cx("h-px flex-1", v === 0 ? "bg-slate-300" : "bg-slate-100")} />
            </div>
          ))}
        </div>

        <div
          role="img"
          tabIndex={0}
          aria-label={`Daily activity for the last ${series.length} days. Use the arrow keys to read each day.`}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
          onMouseLeave={() => setActive(null)}
          className="relative ml-8 flex h-44 items-end gap-[3px] pb-6 sm:gap-1.5"
        >
          {series.map((d, i) => {
            const total = d.analyses + d.rewrites;
            return (
              <div
                key={d.day}
                onMouseEnter={() => setActive(i)}
                className="group relative flex h-full flex-1 cursor-default flex-col justify-end"
              >
                <div className={cx("absolute inset-x-[-2px] inset-y-0 rounded-md transition-colors", active === i && "bg-slate-100/70")} aria-hidden />
                {total > 0 && (
                  <div className="relative flex flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]" style={{ height: `${(total / max) * 100}%` }}>
                    {SERIES.map((s) =>
                      d[s.key] > 0 ? <div key={s.key} style={{ flexGrow: d[s.key], flexBasis: 0, background: s.color, minHeight: 2 }} /> : null
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {point && (
            <div
              role="status"
              className="pointer-events-none absolute bottom-full z-10 mb-2 w-40 -translate-x-1/2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg"
              style={{ left: `clamp(5rem, ${((active + 0.5) / series.length) * 100}%, calc(100% - 5rem))` }}
            >
              <p className="font-semibold text-slate-900">{dayFmt(point.day, { weekday: "short", month: "short", day: "numeric" })}</p>
              {SERIES.map((s) => (
                <p key={s.key} className="mt-1 flex items-center justify-between gap-3 text-slate-600">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                    {s.label}
                  </span>
                  <span className="font-medium tabular-nums text-slate-900">{point[s.key]}</span>
                </p>
              ))}
            </div>
          )}

          {/* x labels */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[10px] text-slate-400" aria-hidden>
            <span>{dayFmt(series[0].day, { month: "short", day: "numeric" })}</span>
            <span>{dayFmt(series[Math.floor(series.length / 2)].day, { month: "short", day: "numeric" })}</span>
            <span>Today</span>
          </div>
        </div>

        {!hasData && (
          <div className="absolute inset-0 bottom-6 flex items-center justify-center">
            <p className="rounded-lg bg-white/90 px-3 py-1.5 text-sm text-slate-500 shadow-sm ring-1 ring-slate-200">No activity in the last 30 days yet.</p>
          </div>
        )}
      </div>

      <details className="mt-4 text-xs text-slate-500">
        <summary className="cursor-pointer select-none font-medium text-slate-600 hover:text-slate-900">View as table</summary>
        <div className="mt-3 max-h-56 overflow-auto rounded-xl border border-slate-200">
          <table className="w-full text-left tabular-nums">
            <thead className="sticky top-0 bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Day</th>
                <th className="px-3 py-2 text-right font-medium">Analyses</th>
                <th className="px-3 py-2 text-right font-medium">Rewrites</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {[...series].reverse().map((d) => (
                <tr key={d.day}>
                  <td className="px-3 py-1.5">{dayFmt(d.day, { month: "short", day: "numeric" })}</td>
                  <td className="px-3 py-1.5 text-right">{d.analyses}</td>
                  <td className="px-3 py-1.5 text-right">{d.rewrites}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
