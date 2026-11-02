import Link from "next/link";
import { History, ScanSearch, PenLine } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui";
import { percent, styleLabel, timeAgo, verdictInfo } from "./format";

/** The latest few saved items across both history lists, newest first. */
export default function RecentActivity({ rewrites, analyses, saveHistory }) {
  const items = [
    ...rewrites.map((r) => ({ ...r, kind: "rewrites" })),
    ...analyses.map((a) => ({ ...a, kind: "analyses" })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);

  if (items.length === 0) {
    return (
      <EmptyState icon={History} title="No saved activity yet">
        {saveHistory ? "Results you create from now on will appear here." : "History saving is off. Turn it on in Settings to keep your results here."}
      </EmptyState>
    );
  }

  return (
    <ul className="-my-2 divide-y divide-slate-100">
      {items.map((item) => {
        const isRewrite = item.kind === "rewrites";
        const v = verdictInfo(item.verdict);
        const Icon = isRewrite ? PenLine : ScanSearch;
        return (
          <li key={`${item.kind}:${item.id}`}>
            <Link href={`/dashboard/history?tab=${item.kind}&open=${item.id}`} className="-mx-2 flex items-start gap-3 rounded-xl px-2 py-3 hover:bg-slate-50">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                <Icon className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{isRewrite ? "Rewrite" : "Analysis"}</span>
                  {isRewrite ? <Badge tone="brand">{styleLabel(item.style)}</Badge> : <Badge tone={v.tone}>{v.label}</Badge>}
                  <span className="ml-auto text-xs text-slate-400">{timeAgo(item.createdAt)}</span>
                </span>
                <span className="mt-1 line-clamp-1 block text-sm text-slate-500">
                  {isRewrite
                    ? item.preview
                    : [item.words != null && `${item.words.toLocaleString()} words`, percent(item.ai) && `${percent(item.ai)} AI-like`, item.signals.join(", ")].filter(Boolean).join(" · ") ||
                      "Summary saved"}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
