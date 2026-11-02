"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { History, LayoutGrid, Settings } from "lucide-react";
import { cx } from "@/components/ui";

const ITEMS = [
  { href: "/dashboard", label: "Overview", icon: LayoutGrid },
  { href: "/dashboard/history", label: "History", icon: History },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export default function DashboardNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Dashboard" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex gap-1 border-b border-slate-200 lg:flex-col lg:border-b-0">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors",
                  "-mb-px border-b-2 lg:mb-0 lg:rounded-xl lg:border-b-0",
                  active
                    ? "border-brand-600 text-brand-700 lg:bg-brand-50"
                    : "border-transparent text-slate-600 hover:text-slate-900 lg:hover:bg-slate-100"
                )}
              >
                <Icon className={cx("size-4", active ? "text-brand-600" : "text-slate-400")} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
