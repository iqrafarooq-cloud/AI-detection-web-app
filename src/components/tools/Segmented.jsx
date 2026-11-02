"use client";

import { cx } from "@/components/ui";

/** Accessible single-choice segmented control (radio group semantics). */
export default function Segmented({ label, value, onChange, options, id }) {
  function onKeyDown(e) {
    const idx = options.findIndex((o) => o.id === value);
    const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    e.preventDefault();
    const next = options[(idx + delta + options.length) % options.length];
    onChange(next.id);
    document.getElementById(`${id}-${next.id}`)?.focus();
  }

  return (
    <div>
      <span id={`${id}-label`} className="mb-1.5 block text-xs font-medium text-slate-600">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={`${id}-label`} onKeyDown={onKeyDown} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-slate-100 p-1">
        {options.map((o) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              id={`${id}-${o.id}`}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              title={o.hint}
              onClick={() => onChange(o.id)}
              className={cx(
                "h-8 rounded-lg px-2 text-xs font-medium transition-colors",
                active ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              )}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
