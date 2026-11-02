import { PanelSkeleton, Skeleton, StatTilesSkeleton } from "@/components/dashboard/Panel";

// Shown instantly while a dashboard section's data loads.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <span className="sr-only">Loading your dashboard…</span>
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>
      <StatTilesSkeleton />
      <PanelSkeleton rows={4} />
    </div>
  );
}
