import { Suspense } from "react";
import Link from "next/link";
import { BarChart3, History, ShieldOff, LayoutGrid } from "lucide-react";
import { Alert } from "@/components/ui";
import { Panel, PanelSkeleton, Skeleton, StatTilesSkeleton } from "@/components/dashboard/Panel";
import StatTiles from "@/components/dashboard/StatTiles";
import ActivityChart from "@/components/dashboard/ActivityChart";
import QuickActions from "@/components/dashboard/QuickActions";
import RecentActivity from "@/components/dashboard/RecentActivity";
import { LoadError, requireDashboardUser } from "@/components/dashboard/guard";
import { loadCounts, loadHistoryPage, loadProfile, loadUsage } from "@/lib/server/dashboard";

export const metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }) {
  const { blocked } = await requireDashboardUser("/dashboard");
  if (blocked) return blocked;
  const sp = await searchParams;

  return (
    <div className="space-y-6">
      <Suspense fallback={<GreetingSkeleton />}>
        <Greeting />
      </Suspense>

      {sp?.passwordUpdated && <Alert tone="success">Your password was updated.</Alert>}

      <Suspense fallback={null}>
        <HistoryOffNotice />
      </Suspense>

      <Suspense fallback={<StatTilesSkeleton />}>
        <Stats />
      </Suspense>

      <div className="grid gap-6 xl:grid-cols-5">
        <Panel title="Activity" description="Requests per day over the last 30 days." icon={BarChart3} className="xl:col-span-3">
          <Suspense fallback={<Skeleton className="h-56 w-full" />}>
            <Activity />
          </Suspense>
        </Panel>
        <Panel title="Tools" description="Jump back into your work." icon={LayoutGrid} className="xl:col-span-2">
          <QuickActions />
        </Panel>
      </div>

      <Suspense fallback={<PanelSkeleton rows={4} />}>
        <Recent />
      </Suspense>
    </div>
  );
}

async function Greeting() {
  const { user, profile } = await loadProfile();
  const name = profile?.full_name?.trim();
  const initials = (name || user.email || "?")
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join("");
  const since = profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : null;
  return (
    <header className="flex items-center gap-4">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-accent-600 text-lg font-semibold text-on-accent shadow-sm">
        {initials}
      </span>
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{name ? `Welcome back, ${name.split(" ")[0]}` : "Welcome back"}</h1>
        <p className="mt-1 truncate text-sm text-slate-500">
          {user.email}
          {since && ` · Member since ${since}`}
        </p>
      </div>
    </header>
  );
}

function GreetingSkeleton() {
  return (
    <div className="flex items-center gap-4" aria-busy="true">
      <Skeleton className="size-14 rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

async function HistoryOffNotice() {
  const { prefs, error } = await loadProfile();
  if (error || prefs?.save_history) return null;
  return (
    <Alert
      tone="info"
      title="History saving is off"
      action={
        <Link href="/dashboard/settings#preferences" className="shrink-0 self-center rounded-lg px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100">
          Turn on
        </Link>
      }
    >
      <span className="inline-flex items-center gap-1.5">
        <ShieldOff className="size-3.5" aria-hidden /> Your results aren&apos;t being kept. Usage counts are still tracked.
      </span>
    </Alert>
  );
}

async function Stats() {
  const [usage, counts] = await Promise.all([loadUsage(), loadCounts()]);
  return (
    <div className="space-y-3">
      <LoadError error={usage.error || counts.error} what="Your usage" />
      <StatTiles totals={usage.totals} today={usage.today} saved={counts.rewrites + counts.analyses} />
    </div>
  );
}

async function Activity() {
  const usage = await loadUsage();
  return <ActivityChart series={usage.series} />;
}

async function Recent() {
  const [rewrites, analyses, { prefs }] = await Promise.all([loadHistoryPage("rewrites", 5), loadHistoryPage("analyses", 5), loadProfile()]);
  return (
    <Panel
      title="Recent activity"
      icon={History}
      action={
        <Link href="/dashboard/history" className="text-sm font-medium text-brand-600 hover:underline">
          View all
        </Link>
      }
    >
      <LoadError error={rewrites.error || analyses.error} what="Your history" />
      <RecentActivity rewrites={rewrites.items} analyses={analyses.items} saveHistory={Boolean(prefs?.save_history)} />
    </Panel>
  );
}
