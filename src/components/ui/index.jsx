import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert } from "lucide-react";

export function cx(...classes) {
  return classes.filter(Boolean).join(" ");
}

const BUTTON_VARIANTS = {
  primary:
    "bg-brand-600 text-on-accent shadow-sm hover:bg-brand-hover disabled:bg-brand-600/50",
  gradient:
    "bg-gradient-to-r from-brand-600 to-accent-600 text-on-accent shadow-sm hover:from-brand-700 hover:to-accent-600 disabled:opacity-50",
  secondary:
    "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:text-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:text-slate-400",
  danger: "bg-white text-red-600 ring-1 ring-red-200 hover:bg-red-50 disabled:opacity-50",
};
const BUTTON_SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function Button({ variant = "primary", size = "md", loading = false, className, children, disabled, ...props }) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-xl font-medium transition-colors disabled:cursor-not-allowed",
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cx("rounded-2xl border border-slate-200/80 bg-white shadow-sm", className)} {...props}>
      {children}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-slate-100 text-slate-700",
  brand: "bg-brand-50 text-brand-700",
  green: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-800",
  red: "bg-red-50 text-red-700",
  violet: "bg-violet-50 text-violet-700",
};
export function Badge({ tone = "neutral", className, children }) {
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

const ALERT_STYLES = {
  info: { box: "border-brand-200 bg-brand-50 text-brand-900", icon: Info, iconClass: "text-brand-600" },
  warning: { box: "border-amber-200 bg-amber-50 text-amber-900", icon: TriangleAlert, iconClass: "text-amber-600" },
  error: { box: "border-red-200 bg-red-50 text-red-900", icon: AlertCircle, iconClass: "text-red-600" },
  success: { box: "border-emerald-200 bg-emerald-50 text-emerald-900", icon: CheckCircle2, iconClass: "text-emerald-600" },
};
export function Alert({ tone = "info", title, children, className, action }) {
  const s = ALERT_STYLES[tone];
  const Icon = s.icon;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cx("flex gap-3 rounded-xl border p-4 text-sm animate-fade-in", s.box, className)}>
      <Icon className={cx("mt-0.5 size-4 shrink-0", s.iconClass)} aria-hidden />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && "mt-1", "leading-relaxed opacity-90")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cx("size-5 animate-spin text-brand-600", className)} aria-hidden />;
}

export function SelectField({ label, value, onChange, options, id, hint }) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-600">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm capitalize text-slate-800 shadow-sm transition-colors hover:border-slate-300 focus:border-brand-500"
      >
        {options.map((o) => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return (
            <option key={v} value={v}>
              {l}
            </option>
          );
        })}
      </select>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

/**
 * Labelled input with optional inline error and hint. `trailing` renders inside
 * the input on the right (e.g. a show-password button); `labelAction` sits on
 * the label row (e.g. a "Forgot password?" link).
 */
export function TextField({ label, id, className, error, hint, trailing, labelAction, ...props }) {
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("block", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-slate-700">
          {label}
        </label>
        {labelAction}
      </div>
      <div className="relative">
        <input
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            "h-11 w-full rounded-xl border bg-white px-3.5 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400",
            error ? "border-red-300 focus:border-red-500" : "border-slate-200 hover:border-slate-300 focus:border-brand-500",
            trailing && "pr-11"
          )}
          {...props}
        />
        {trailing && <div className="absolute inset-y-0 right-1 flex items-center">{trailing}</div>}
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-red-600">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}

export function Toggle({ checked, onChange, label, description, id, disabled }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50",
          checked ? "bg-brand-600" : "bg-slate-300"
        )}
      >
        <span className={cx("inline-block size-5 rounded-full bg-on-accent shadow transition-transform", checked ? "translate-x-5.5" : "translate-x-0.5")} />
      </button>
    </div>
  );
}

export function PageHeader({ eyebrow, title, description, children }) {
  return (
    <div className="mb-8">
      {eyebrow && <p className="mb-2 text-sm font-semibold text-brand-600">{eyebrow}</p>}
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
      {description && <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600">{description}</p>}
      {children}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {Icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
          <Icon className="size-6" aria-hidden />
        </div>
      )}
      <p className="font-medium text-slate-800">{title}</p>
      {children && <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-500">{children}</p>}
    </div>
  );
}
