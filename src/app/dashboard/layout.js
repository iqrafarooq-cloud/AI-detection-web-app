import DashboardNav from "@/components/dashboard/DashboardNav";

export const metadata = { title: { default: "Dashboard", template: "%s | Dashboard | Detectly AI" } };

// Static shell: no cookies or data here, so navigating between dashboard
// sections renders instantly and each page streams its own data.
export default function DashboardLayout({ children }) {
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-10">
        <aside className="mb-8 lg:mb-0">
          <p className="mb-3 hidden px-3 text-xs font-semibold uppercase tracking-wider text-slate-400 lg:block">Your account</p>
          <div className="lg:sticky lg:top-24">
            <DashboardNav />
          </div>
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
