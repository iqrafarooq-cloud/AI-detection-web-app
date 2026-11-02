import { Card, cx } from "@/components/ui";

/** Titled dashboard card. `action` sits on the right of the header row. */
export function Panel({ id, title, description, icon: Icon, action, className, bodyClassName, children }) {
  return (
    <Card id={id} className={cx("overflow-hidden scroll-mt-24", className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              {Icon && <Icon className="size-4 text-brand-600" aria-hidden />}
              {title}
            </h2>
            {description && <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={cx("px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </Card>
  );
}

export function Skeleton({ className }) {
  return <div aria-hidden className={cx("animate-pulse rounded-lg bg-slate-100", className)} />;
}

export function PanelSkeleton({ rows = 3, className }) {
  return (
    <Card className={cx("p-6", className)} aria-busy="true">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-4 w-40" />
      <div className="mt-6 space-y-4">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </Card>
  );
}

export function StatTilesSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-busy="true">
      {Array.from({ length: 4 }, (_, i) => (
        <Card key={i} className="p-5">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="mt-4 h-7 w-16" />
        </Card>
      ))}
    </div>
  );
}
