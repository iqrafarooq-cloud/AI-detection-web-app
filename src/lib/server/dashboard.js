import "server-only";
import { cache } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export const HISTORY_PAGE_SIZE = 10;
export const PREVIEW_CHARS = 220;
export const USAGE_DAYS = 30;

/**
 * Per-request auth context for the dashboard, deduplicated with React.cache so
 * every Server Component on the page shares one client and one JWT check.
 *
 * getClaims() verifies the session JWT locally (asymmetric signing keys), so
 * it avoids the Auth-server round trip that getUser() makes on every render.
 * Returns { supabase: null } when accounts are not configured and
 * { user: null } when signed out.
 */
export const getDashboardContext = cache(async () => {
  const supabase = await getSupabaseServerClient();
  if (!supabase) return { supabase: null, user: null };
  const { data, error } = await supabase.auth.getClaims();
  const claims = error ? null : data?.claims;
  if (!claims?.sub) return { supabase, user: null };
  return { supabase, user: { id: claims.sub, email: claims.email ?? "" } };
});

export function preview(text, max = PREVIEW_CHARS) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

const KINDS = {
  rewrites: {
    table: "humanization_history",
    columns: "id, created_at, writing_style, improved_text",
    map: (r) => ({ id: r.id, createdAt: r.created_at, style: r.writing_style, preview: preview(r.improved_text) }),
  },
  analyses: {
    table: "analysis_history",
    // JSON paths keep the (potentially large) analysis_result out of the transfer.
    columns:
      "id, created_at, detection_provider, verdict:analysis_result->detection->>verdict, ai:analysis_result->detection->scores->>ai, words:analysis_result->metrics->>words, signals:analysis_result->signals",
    map: (r) => ({
      id: r.id,
      createdAt: r.created_at,
      provider: r.detection_provider,
      verdict: r.verdict,
      ai: r.ai == null ? null : Number(r.ai),
      words: r.words == null ? null : Number(r.words),
      signals: Array.isArray(r.signals) ? r.signals.slice(0, 4) : [],
    }),
  },
};

export function isHistoryKind(kind) {
  return Object.hasOwn(KINDS, kind);
}

export function historyTable(kind) {
  return KINDS[kind].table;
}

/**
 * One page of history, newest first, using created_at as a keyset cursor
 * (served by the (user_id, created_at desc) index). Only previews leave the
 * server. RLS restricts rows to the signed-in user.
 */
export async function listHistory(supabase, kind, { before = null, limit = HISTORY_PAGE_SIZE } = {}) {
  const k = KINDS[kind];
  let q = supabase.from(k.table).select(k.columns).order("created_at", { ascending: false }).limit(limit + 1);
  if (before) q = q.lt("created_at", before);

  // Which of these rows also stored the original text - ids only, no text transferred.
  let o = supabase.from(k.table).select("id").not("original_text", "is", null).order("created_at", { ascending: false }).limit(limit + 1);
  if (before) o = o.lt("created_at", before);

  const [rows, withOriginal] = await Promise.all([q, o]);
  if (rows.error) return { error: rows.error, items: [], nextCursor: null };
  const originals = new Set((withOriginal.data || []).map((r) => r.id));

  const page = rows.data.slice(0, limit);
  return {
    error: null,
    items: page.map((r) => ({ ...k.map(r), hasOriginal: originals.has(r.id) })),
    nextCursor: rows.data.length > limit ? page[page.length - 1].created_at : null,
  };
}

export async function countHistory(supabase) {
  const [rewrites, analyses] = await Promise.all(
    ["rewrites", "analyses"].map((kind) => supabase.from(KINDS[kind].table).select("id", { count: "exact", head: true }))
  );
  return { rewrites: rewrites.count ?? 0, analyses: analyses.count ?? 0, error: rewrites.error || analyses.error || null };
}

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

/** Daily usage for the last `days` days (UTC dates, matching current_date in Postgres), zero-filled. */
export function buildUsageSeries(rows, { days = USAGE_DAYS, today = new Date() } = {}) {
  const byDay = new Map();
  for (const r of rows || []) {
    const e = byDay.get(r.usage_date) || { analysis: 0, humanization: 0 };
    if (r.feature_type in e) e[r.feature_type] += r.request_count;
    byDay.set(r.usage_date, e);
  }
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = isoDay(new Date(today.getTime() - i * 86400_000));
    const e = byDay.get(day) || { analysis: 0, humanization: 0 };
    series.push({ day, analyses: e.analysis, rewrites: e.humanization });
  }
  const totals = series.reduce((t, d) => ({ analyses: t.analyses + d.analyses, rewrites: t.rewrites + d.rewrites }), { analyses: 0, rewrites: 0 });
  const last = series[series.length - 1];
  return { series, totals, today: last.analyses + last.rewrites };
}

/* Request-scoped loaders: several Suspense sections can ask for the same data
 * and the query still runs once per request. Call only after the page has
 * confirmed a signed-in user via getDashboardContext(). */

export const loadProfile = cache(async () => {
  const { supabase, user } = await getDashboardContext();
  const [profile, prefs] = await Promise.all([
    supabase.from("profiles").select("full_name, created_at").eq("id", user.id).maybeSingle(),
    supabase.from("user_preferences").select("preferred_writing_style, language, save_history, store_original_text").eq("user_id", user.id).maybeSingle(),
  ]);
  return { user, profile: profile.data, prefs: prefs.data, error: profile.error || prefs.error || null };
});

export const loadUsage = cache(async () => getUsage((await getDashboardContext()).supabase));
export const loadCounts = cache(async () => countHistory((await getDashboardContext()).supabase));
export const loadHistoryPage = cache(async (kind, limit = HISTORY_PAGE_SIZE) => listHistory((await getDashboardContext()).supabase, kind, { limit }));

export async function getUsage(supabase, days = USAGE_DAYS) {
  const since = isoDay(new Date(Date.now() - (days - 1) * 86400_000));
  const { data, error } = await supabase.from("usage_tracking").select("feature_type, request_count, usage_date").gte("usage_date", since);
  return { ...buildUsageSeries(data, { days }), error };
}
