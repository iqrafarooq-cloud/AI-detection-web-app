import Link from "next/link";
import { ArrowUpRight, Files, ListChecks, ScanSearch, SpellCheck, Text, PenLine } from "lucide-react";

const TOOLS = [
  { href: "/detector", label: "AI Detector", text: "Check how AI-like a text reads", icon: ScanSearch },
  { href: "/humanizer", label: "Humanizer", text: "Rewrite naturally in your style", icon: PenLine },
  { href: "/grammar", label: "Grammar & Clarity", text: "Fix errors and tighten wording", icon: SpellCheck },
  { href: "/summarizer", label: "Summarizer", text: "Turn long text into key points", icon: Text },
  { href: "/batch", label: "Batch Check", text: "Scan several files at once", icon: Files },
  { href: "/compare", label: "Compare", text: "See two versions side by side", icon: ListChecks },
];

export default function QuickActions() {
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
      {TOOLS.map((t) => (
        <li key={t.href}>
          <Link
            href={t.href}
            className="group flex h-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-2.5 transition-colors hover:border-brand-200 hover:bg-brand-50/50"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition-colors group-hover:bg-brand-600 group-hover:text-on-accent">
              <t.icon className="size-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-slate-900">{t.label}</span>
              <span className="block truncate text-xs text-slate-500">{t.text}</span>
            </span>
            <ArrowUpRight className="size-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand-600" aria-hidden />
          </Link>
        </li>
      ))}
    </ul>
  );
}
