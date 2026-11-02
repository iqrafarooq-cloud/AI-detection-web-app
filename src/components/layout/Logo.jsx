import { cx } from "@/components/ui";

/**
 * Detectly mark: a lens over lines of text - "detect text". Solid brand fill
 * that follows the theme tokens; the glyph uses the on-accent color.
 */
export function LogoMark({ className }) {
  return (
    <svg viewBox="0 0 32 32" className={cx("size-8 shrink-0", className)} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" className="fill-brand-600" />
      <g fill="none" stroke="var(--color-on-accent)" strokeLinecap="round">
        <circle cx="14" cy="14" r="7.25" strokeWidth="2.5" />
        <path d="M10.75 12.25h6.5M10.75 15.75h4" strokeWidth="2" />
        <path d="M19.4 19.4 24.5 24.5" strokeWidth="3" />
      </g>
    </svg>
  );
}

export function Logo({ className, markClassName }) {
  return (
    <span className={cx("inline-flex items-center gap-2 font-semibold tracking-tight text-slate-900", className)}>
      <LogoMark className={markClassName} />
      <span>
        Detectly <span className="text-brand-600">AI</span>
      </span>
    </span>
  );
}
