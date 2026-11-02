"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, History, ScanSearch, Search, Trash2, PenLine, X } from "lucide-react";
import { Alert, Badge, Button, Card, EmptyState, Spinner, cx } from "@/components/ui";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { getJson } from "@/lib/client/api";
import { formatDateTime, percent, styleLabel, timeAgo, verdictInfo } from "./format";

const TABS = [
  { id: "rewrites", label: "Rewrites", icon: PenLine, table: "humanization_history" },
  { id: "analyses", label: "Analyses", icon: ScanSearch, table: "analysis_history" },
];

function analysisLine(item) {
  return (
    [item.words != null && `${item.words.toLocaleString()} words`, percent(item.ai) && `${percent(item.ai)} AI-like`, item.signals?.join(", ")].filter(Boolean).join(" · ") ||
    "Summary saved"
  );
}

export default function HistoryBrowser({ userId, initialTab, initialPage, counts, openId }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  // Per-tab pages: { items, nextCursor, loaded }. The other tab loads on first visit.
  const [pages, setPages] = useState({ [initialTab]: { ...initialPage, loaded: true } });
  const [totals, setTotals] = useState({ rewrites: counts.rewrites, analyses: counts.analyses });
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(openId);

  const current = pages[tab];
  const table = TABS.find((t) => t.id === tab).table;

  async function fetchPage(kind, before) {
    const qs = new URLSearchParams({ kind, ...(before ? { before } : {}) });
    return getJson(`/api/history?${qs}`);
  }

  async function switchTab(id) {
    setTab(id);
    setQuery("");
    setError("");
    window.history.replaceState(null, "", `/dashboard/history?tab=${id}`);
    if (pages[id]?.loaded) return;
    setBusy("tab");
    try {
      const page = await fetchPage(id);
      setPages((p) => ({ ...p, [id]: { ...page, loaded: true } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function loadMore() {
    setBusy("more");
    setError("");
    try {
      const page = await fetchPage(tab, current.nextCursor);
      setPages((p) => ({ ...p, [tab]: { ...p[tab], items: [...p[tab].items, ...page.items], nextCursor: page.nextCursor } }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function remove(id) {
    setBusy(id);
    setError("");
    const { error: err } = await getSupabaseBrowserClient().from(table).delete().eq("id", id);
    setBusy(null);
    if (err) return setError(err.message);
    if (open === id) setOpen(null);
    setPages((p) => ({ ...p, [tab]: { ...p[tab], items: p[tab].items.filter((x) => x.id !== id) } }));
    setTotals((t) => ({ ...t, [tab]: Math.max(0, t[tab] - 1) }));
  }

  async function removeAll() {
    const label = TABS.find((t) => t.id === tab).label.toLowerCase();
    if (!window.confirm(`Delete all ${totals[tab]} saved ${label}? This cannot be undone.`)) return;
    setBusy("all");
    setError("");
    // Deletes every row of this list for the user (not just the loaded page). RLS also enforces ownership.
    const { error: err } = await getSupabaseBrowserClient().from(table).delete().eq("user_id", userId);
    setBusy(null);
    if (err) return setError(err.message);
    setOpen(null);
    setPages((p) => ({ ...p, [tab]: { items: [], nextCursor: null, loaded: true } }));
    setTotals((t) => ({ ...t, [tab]: 0 }));
    router.refresh();
  }

  const visible = useMemo(() => {
    const items = current?.items || [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => (tab === "rewrites" ? `${i.preview} ${styleLabel(i.style)}` : `${analysisLine(i)} ${verdictInfo(i.verdict).label}`).toLowerCase().includes(q));
  }, [current, query, tab]);


  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div role="tablist" aria-label="History type" className="inline-flex self-start rounded-xl bg-slate-100 p-1 text-sm">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => switchTab(t.id)}
              className={cx(
                "inline-flex items-center gap-2 rounded-lg px-3 py-1.5 font-medium transition-colors",
                tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
              )}
            >
              <t.icon className="size-4" aria-hidden />
              {t.label}
              <span className={cx("rounded-full px-1.5 text-xs tabular-nums", tab === t.id ? "bg-brand-50 text-brand-700" : "bg-slate-200/70 text-slate-500")}>
                {totals[t.id]}
              </span>
            </button>
          ))}
        </div>
        <label className="relative block sm:w-64">
          <span className="sr-only">Search loaded items</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="h-9 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500"
          />
        </label>
      </div>

      {error && (
        <div className="px-5 pt-4 sm:px-6">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {busy === "tab" || !current ? (
        <div className="flex justify-center py-16">
          <Spinner />
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={History} title={query ? "No matches" : "Nothing saved yet"}>
          {query ? "Try a different search, or load more items first." : "Turn on “Save history” in Settings. Only results you create after that are saved."}
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100">
          {visible.map((item) => (
            <li key={item.id} className="group flex items-start gap-3 px-5 py-4 hover:bg-slate-50/70 sm:px-6">
              <button type="button" onClick={() => setOpen(item.id)} className="min-w-0 flex-1 text-left" aria-label={`Open ${tab === "rewrites" ? "rewrite" : "analysis"} from ${formatDateTime(item.createdAt)}`}>
                <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  {tab === "rewrites" ? (
                    <Badge tone="brand">{styleLabel(item.style)}</Badge>
                  ) : (
                    <Badge tone={verdictInfo(item.verdict).tone}>{verdictInfo(item.verdict).label}</Badge>
                  )}
                  {item.hasOriginal && <Badge>original saved</Badge>}
                  <time dateTime={item.createdAt} title={formatDateTime(item.createdAt)} className="ml-auto" suppressHydrationWarning>
                    {timeAgo(item.createdAt)}
                  </time>
                </span>
                <span className="mt-1.5 line-clamp-2 block text-sm text-slate-700">{tab === "rewrites" ? item.preview : analysisLine(item)}</span>
              </button>
              <button
                type="button"
                onClick={() => remove(item.id)}
                disabled={busy !== null}
                aria-label="Delete item"
                className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
              >
                {busy === item.id ? <Spinner className="size-4" /> : <Trash2 className="size-4" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {current?.items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:px-6">
          <p className="text-xs text-slate-500">
            Showing {visible.length} of {totals[tab]}
          </p>
          <div className="flex gap-2">
            {current.nextCursor && (
              <Button variant="secondary" size="sm" onClick={loadMore} loading={busy === "more"} disabled={busy !== null && busy !== "more"}>
                Load more
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={removeAll} loading={busy === "all"} disabled={busy !== null && busy !== "all"}>
              Delete all
            </Button>
          </div>
        </div>
      )}

      {open && <DetailDrawer kind={tab} id={open} table={table} onClose={() => setOpen(null)} onDelete={() => remove(open)} />}
    </Card>
  );
}

/** Side panel with the full saved item. Fetched on demand so the list stays light. */
function DetailDrawer({ kind, id, table, onClose, onDelete }) {
  const [state, setState] = useState({ loading: true, row: null, error: "" });
  const [copied, setCopied] = useState("");
  const closeRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const columns = kind === "rewrites" ? "id, created_at, writing_style, improved_text, original_text" : "id, created_at, detection_provider, analysis_result, original_text";
    getSupabaseBrowserClient()
      .from(table)
      .select(columns)
      .eq("id", id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!alive) return;
        setState({ loading: false, row: data, error: error ? error.message : data ? "" : "This item no longer exists." });
      });
    return () => {
      alive = false;
    };
  }, [id, kind, table]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  async function copy(label, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard blocked: ignore */
    }
  }

  const row = state.row;
  const result = row?.analysis_result;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
      <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-fade-in" />
      <div className="relative flex h-full w-full max-w-xl flex-col bg-white shadow-2xl animate-fade-in">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <h2 id="drawer-title" className="font-semibold text-slate-900">
              {kind === "rewrites" ? "Saved rewrite" : "Saved analysis"}
            </h2>
            {row && <p className="text-xs text-slate-500">{formatDateTime(row.created_at)}</p>}
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900">
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {state.loading && (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          )}
          {state.error && <Alert tone="error">{state.error}</Alert>}

          {row && kind === "rewrites" && (
            <>
              <Badge tone="brand">{styleLabel(row.writing_style)}</Badge>
              <TextBlock title="Improved text" text={row.improved_text} copied={copied === "improved"} onCopy={() => copy("improved", row.improved_text)} />
              {row.original_text ? (
                <TextBlock title="Original text" text={row.original_text} muted copied={copied === "original"} onCopy={() => copy("original", row.original_text)} />
              ) : (
                <p className="text-xs text-slate-500">The original text wasn&apos;t stored (&ldquo;Include original text&rdquo; was off).</p>
              )}
            </>
          )}

          {row && kind === "analyses" && (
            <>
              <dl className="grid grid-cols-2 gap-3">
                <Stat label="Detector estimate" value={verdictInfo(result?.detection?.verdict).label} />
                <Stat label="AI-like score" value={percent(result?.detection?.scores?.ai) ?? "-"} />
                <Stat label="Words" value={result?.metrics?.words?.toLocaleString() ?? "-"} />
                <Stat label="Detector" value={row.detection_provider || "-"} />
              </dl>
              {result?.signals?.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">Writing-style signals</h3>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {result.signals.map((s) => (
                      <li key={s}>
                        <Badge>{s}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {row.original_text ? (
                <TextBlock title="Analyzed text" text={row.original_text} muted copied={copied === "original"} onCopy={() => copy("original", row.original_text)} />
              ) : (
                <p className="text-xs text-slate-500">The analyzed text wasn&apos;t stored - only the summary above.</p>
              )}
            </>
          )}
        </div>

        {row && (
          <div className="flex justify-end border-t border-slate-200 px-5 py-4">
            <Button variant="danger" size="sm" onClick={onDelete}>
              <Trash2 className="size-3.5" aria-hidden /> Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-semibold text-slate-900">{value}</dd>
    </div>
  );
}

function TextBlock({ title, text, muted, copied, onCopy }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <button type="button" onClick={onCopy} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900">
          {copied ? <Check className="size-3.5 text-emerald-600" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className={cx("whitespace-pre-wrap rounded-xl border border-slate-200 p-4 text-sm leading-relaxed", muted ? "bg-slate-50 text-slate-600" : "bg-white text-slate-800")}>{text}</p>
    </section>
  );
}
