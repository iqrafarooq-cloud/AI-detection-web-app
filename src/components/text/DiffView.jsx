"use client";

import { useMemo } from "react";
import { diffWords } from "diff";

/** Word-level diff. mode "original" shows removals, "improved" shows additions. */
export default function DiffView({ original, improved, mode = "improved" }) {
  const parts = useMemo(() => diffWords(original || "", improved || ""), [original, improved]);
  return (
    <div className="whitespace-pre-wrap break-words text-[15px] leading-relaxed text-slate-800">
      {parts.map((p, i) => {
        if (p.added) {
          return mode === "improved" ? (
            <ins key={i} className="rounded bg-emerald-100 px-0.5 text-emerald-900 no-underline decoration-emerald-400">
              {p.value}
            </ins>
          ) : null;
        }
        if (p.removed) {
          return mode === "original" ? (
            <del key={i} className="rounded bg-red-100 px-0.5 text-red-800 decoration-red-400">
              {p.value}
            </del>
          ) : null;
        }
        return <span key={i}>{p.value}</span>;
      })}
    </div>
  );
}

export function diffStats(original, improved) {
  const parts = diffWords(original || "", improved || "");
  let added = 0;
  let removed = 0;
  for (const p of parts) {
    const n = p.value.trim() ? p.value.trim().split(/\s+/).length : 0;
    if (p.added) added += n;
    else if (p.removed) removed += n;
  }
  return { added, removed };
}
