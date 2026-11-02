import { Archive, CalendarCheck, ScanSearch, PenLine } from "lucide-react";
import { Card } from "@/components/ui";

export default function StatTiles({ totals, today, saved }) {
  const tiles = [
    { label: "Analyses", sub: "last 30 days", value: totals.analyses, icon: ScanSearch },
    { label: "Rewrites", sub: "last 30 days", value: totals.rewrites, icon: PenLine },
    { label: "Requests today", sub: "all tools", value: today, icon: CalendarCheck },
    { label: "Saved items", sub: "in your history", value: saved, icon: Archive },
  ];
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {tiles.map((t) => (
        <Card key={t.label} className="p-5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500">{t.label}</p>
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
              <t.icon className="size-4" aria-hidden />
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold tabular-nums tracking-tight text-slate-900">{t.value.toLocaleString()}</p>
          <p className="mt-0.5 text-xs text-slate-400">{t.sub}</p>
        </Card>
      ))}
    </div>
  );
}
