import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUsageSeries, listHistory, preview, PREVIEW_CHARS } from "@/lib/server/dashboard";

test("usage series is zero-filled, ordered oldest to today, and totals per feature", () => {
  const today = new Date("2026-11-02T15:00:00Z");
  const rows = [
    { feature_type: "analysis", request_count: 3, usage_date: "2026-11-02" },
    { feature_type: "humanization", request_count: 2, usage_date: "2026-11-02" },
    { feature_type: "analysis", request_count: 5, usage_date: "2026-10-20" },
    { feature_type: "analysis", request_count: 9, usage_date: "2026-09-01" }, // outside the window
  ];
  const u = buildUsageSeries(rows, { days: 30, today });
  assert.equal(u.series.length, 30);
  assert.equal(u.series[0].day, "2026-10-04");
  assert.equal(u.series.at(-1).day, "2026-11-02");
  assert.deepEqual(u.totals, { analyses: 8, rewrites: 2 });
  assert.equal(u.today, 5);
  assert.equal(buildUsageSeries([], { days: 7, today }).totals.analyses, 0);
});

test("previews collapse whitespace and cut at a word boundary", () => {
  assert.equal(preview("  a\n\n b  "), "a b");
  const long = "word ".repeat(200);
  const p = preview(long);
  assert.ok(p.length <= PREVIEW_CHARS + 1);
  assert.ok(p.endsWith("word…"));
});

/** Minimal chainable stand-in for the Supabase query builder. */
function fakeSupabase(rows) {
  const calls = [];
  const builder = (table) => {
    const q = { table, filters: [], cols: null };
    const api = {
      select(c) { q.cols = c; return api; },
      order() { return api; },
      limit(n) { q.limit = n; return api; },
      lt(col, v) { q.filters.push(["lt", col, v]); return api; },
      not(col) { q.filters.push(["notnull", col]); return api; },
      then(resolve) {
        calls.push(q);
        let data = rows.filter((r) => q.filters.every(([op, col, v]) => (op === "lt" ? r[col] < v : r[col] != null)));
        data = data.slice(0, q.limit);
        resolve({ data: q.cols === "id" ? data.map((r) => ({ id: r.id })) : data, error: null });
      },
    };
    return api;
  };
  return { from: builder, calls };
}

test("history pages use a created_at cursor, send previews only, and flag stored originals", async () => {
  const rows = Array.from({ length: 13 }, (_, i) => ({
    id: `r${i}`,
    created_at: `2026-11-${String(20 - i).padStart(2, "0")}T00:00:00Z`,
    writing_style: "natural",
    improved_text: "x ".repeat(500),
    original_text: i % 2 ? "orig" : null,
  }));
  const sb = fakeSupabase(rows);
  const p1 = await listHistory(sb, "rewrites", { limit: 10 });
  assert.equal(p1.items.length, 10);
  assert.equal(p1.nextCursor, rows[9].created_at);
  assert.ok(p1.items.every((i) => i.preview.length <= PREVIEW_CHARS + 1 && !("improved_text" in i)));
  assert.deepEqual(p1.items.slice(0, 3).map((i) => i.hasOriginal), [false, true, false]);
  // Original text is never selected for the list.
  assert.ok(sb.calls.every((c) => !/original_text/.test(c.cols)));

  const p2 = await listHistory(sb, "rewrites", { before: p1.nextCursor, limit: 10 });
  assert.deepEqual(p2.items.map((i) => i.id), ["r10", "r11", "r12"]);
  assert.equal(p2.nextCursor, null);
});

test("analysis history selects JSON fields instead of the whole result", async () => {
  const sb = fakeSupabase([]);
  await listHistory(sb, "analyses");
  const cols = sb.calls[0].cols;
  assert.match(cols, /verdict:analysis_result->detection->>verdict/);
  assert.doesNotMatch(cols, /(^|, )analysis_result(,|$)/);
});
