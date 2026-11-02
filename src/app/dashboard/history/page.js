import { Suspense } from "react";
import { PanelSkeleton } from "@/components/dashboard/Panel";
import HistoryBrowser from "@/components/dashboard/HistoryBrowser";
import { LoadError, requireDashboardUser } from "@/components/dashboard/guard";
import { loadCounts, loadHistoryPage } from "@/lib/server/dashboard";

export const metadata = { title: "History" };

export default async function HistoryPage({ searchParams }) {
  const { user, blocked } = await requireDashboardUser("/dashboard/history");
  if (blocked) return blocked;
  const sp = await searchParams;
  const tab = sp?.tab === "analyses" ? "analyses" : "rewrites";
  const openId = typeof sp?.open === "string" ? sp.open : null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">History</h1>
        <p className="mt-1 text-sm text-slate-500">Rewrites and analyses you chose to save. Only you can see them.</p>
      </header>
      <Suspense key={tab} fallback={<PanelSkeleton rows={6} />}>
        <HistoryData userId={user.id} tab={tab} openId={openId} />
      </Suspense>
    </div>
  );
}

async function HistoryData({ userId, tab, openId }) {
  const [page, counts] = await Promise.all([loadHistoryPage(tab), loadCounts()]);
  return (
    <>
      <LoadError error={page.error || counts.error} what="Your history" />
      <HistoryBrowser userId={userId} initialTab={tab} initialPage={page} counts={counts} openId={openId} />
    </>
  );
}
