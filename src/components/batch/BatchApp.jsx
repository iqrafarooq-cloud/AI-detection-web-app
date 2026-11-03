"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, FileStack, FileUp, Play, ScanSearch, Square, Trash2, X } from "lucide-react";
import DetectionSummary from "@/components/detector/DetectionSummary";
import { Alert, Badge, Button, Card, EmptyState, Spinner, cx } from "@/components/ui";
import { ApiError, postForm, postJson } from "@/lib/client/api";
import { useStatus } from "@/lib/client/useStatus";
import { usePersistentState } from "@/lib/client/usePersistentState";
import { DRAFT_KEY, saveSession } from "@/lib/client/files";

// Each file costs one extract + one analyze request. 10 files = 20 requests,
// which stays inside the per-minute limits and keeps one batch to a few minutes
// on the CPU-bound local detector.
const MAX_FILES = 10;
const EXTENSIONS = ["txt", "md", "doc", "docx", "pdf"];
const ACCEPT = EXTENSIONS.map((e) => `.${e}`).join(",");
const RATE_LIMIT_WAIT_MS = 20_000;
const RATE_LIMIT_RETRIES = 3;

const VERDICT = {
  likely_ai: { label: "Likely AI", tone: "red" },
  likely_human: { label: "Likely human", tone: "green" },
  mixed: { label: "Mixed", tone: "violet" },
  uncertain: { label: "Uncertain", tone: "amber" },
};
const BAR = { likely_ai: "bg-red-600", likely_human: "bg-emerald-600", mixed: "bg-violet-600", uncertain: "bg-amber-600" };
const SKIPPED = {
  too_short: "Too short",
  not_configured: "No detector",
  error: "Detector error",
};
const STEP_LABEL = { queued: "Queued", extracting: "Reading file", analyzing: "Analyzing", waiting: "Waiting (rate limit)", done: "Done", error: "Failed", cancelled: "Cancelled" };

let nextId = 1;
const wait = (ms, signal) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

function formatSize(bytes) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  // Quote everything; neutralise spreadsheet formula injection.
  return `"${(/^[=+\-@]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
}

export default function BatchApp() {
  const status = useStatus();
  const router = useRouter();
  // Kept in memory only: items hold File objects, which can't go into sessionStorage.
  const [items, setItems] = usePersistentState("batch:items", [], { storage: false });
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const maxBytes = status?.limits?.uploadMaxBytes ?? 4 * 1024 * 1024;
  const maxChars = status?.limits?.analyzeMaxChars ?? 50000;

  useEffect(() => {
    // A run that was in progress when the user left the page was aborted.
     
    setItems((list) =>
      list.some((it) => ["extracting", "analyzing", "waiting"].includes(it.step))
        ? list.map((it) => (["extracting", "analyzing", "waiting"].includes(it.step) ? { ...it, step: "cancelled" } : it))
        : list
    );
    return () => abortRef.current?.abort();
  }, [setItems]);

  const update = (id, patch) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));

  function addFiles(fileList) {
    setNotice("");
    const files = [...fileList];
    const problems = [];
    const accepted = [];
    for (const f of files) {
      const ext = f.name.toLowerCase().split(".").pop();
      if (!EXTENSIONS.includes(ext)) problems.push(`${f.name}: unsupported type`);
      else if (f.size === 0) problems.push(`${f.name}: empty file`);
      else if (f.size > maxBytes) problems.push(`${f.name}: larger than ${formatSize(maxBytes)}`);
      else accepted.push(f);
    }
    setItems((list) => {
      const room = MAX_FILES - list.length;
      if (accepted.length > room) problems.push(`Only ${MAX_FILES} files per batch - ${accepted.length - Math.max(room, 0)} not added.`);
      const added = accepted.slice(0, Math.max(room, 0)).map((file) => ({ id: nextId++, file, name: file.name, size: file.size, step: "queued" }));
      return [...list, ...added];
    });
    if (problems.length) setNotice(problems.join(" · "));
  }

  // Runs one request, waiting and retrying when our own per-minute limit is hit.
  async function withRateLimitRetry(id, fn, signal) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await fn();
      } catch (err) {
        if (!(err instanceof ApiError) || err.status !== 429 || attempt >= RATE_LIMIT_RETRIES) throw err;
        update(id, { step: "waiting" });
        await wait(RATE_LIMIT_WAIT_MS, signal);
      }
    }
  }

  async function run() {
    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;
    setRunning(true);
    setExpanded(null);
    const queue = items.filter((it) => it.step !== "done");
    for (const it of queue) {
      if (signal.aborted) break;
      try {
        update(it.id, { step: "extracting", error: null });
        const extracted = await withRateLimitRetry(
          it.id,
          () => {
            const fd = new FormData();
            fd.append("file", it.file);
            return postForm("/api/extract", fd, { signal });
          },
          signal
        );
        const text = extracted.text || "";
        if (!text.trim()) throw new Error("No readable text found in this file.");
        if (text.length > maxChars) throw new Error(`Longer than ${maxChars.toLocaleString()} characters. Analyze it in parts on the Detector page.`);
        const words = text.trim().split(/\s+/).length;
        update(it.id, { step: "analyzing", words, text });
        const res = await withRateLimitRetry(it.id, () => postJson("/api/analyze", { text }, { signal }), signal);
        update(it.id, { step: "done", detection: res.detection, disclaimer: res.disclaimer, words: res.patterns?.metrics?.words ?? words });
      } catch (err) {
        if (err.name === "AbortError") {
          update(it.id, { step: "cancelled" });
          break;
        }
        update(it.id, { step: "error", error: err.message });
      }
    }
    setItems((list) => list.map((it) => (["extracting", "analyzing", "waiting"].includes(it.step) ? { ...it, step: "cancelled" } : it)));
    setRunning(false);
  }

  function stop() {
    abortRef.current?.abort();
  }

  function remove(id) {
    setItems((list) => list.filter((it) => it.id !== id));
  }

  function openInDetector(it) {
    saveSession(DRAFT_KEY, { text: it.text });
    router.push("/detector");
  }

  function exportCsv() {
    const header = ["File", "Words", "Status", "Verdict", "AI likelihood (%)", "Confidence", "Note"];
    const rows = items.map((it) => {
      const d = it.detection;
      const ok = d?.status === "ok";
      return [
        it.name,
        it.words ?? "",
        STEP_LABEL[it.step],
        ok ? VERDICT[d.verdict]?.label ?? d.verdict : SKIPPED[d?.status] ?? "",
        ok ? (d.scores.ai * 100).toFixed(1) : "",
        ok ? d.confidence ?? "" : "",
        it.error || (!ok && d?.message) || "",
      ];
    });
    const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `detectly-batch-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const stats = useMemo(() => {
    const scored = items.filter((it) => it.detection?.status === "ok");
    return {
      finished: items.filter((it) => ["done", "error"].includes(it.step)).length,
      scored: scored.length,
      likelyAi: scored.filter((it) => it.detection.verdict === "likely_ai").length,
      avg: scored.length ? scored.reduce((s, it) => s + it.detection.scores.ai, 0) / scored.length : null,
    };
  }, [items]);

  const pendingCount = items.filter((it) => it.step !== "done").length;
  const detectorOff = status && !status.detection.configured;

  return (
    <div className="space-y-6">
      {detectorOff && (
        <Alert tone="info" title="No AI-detection model is configured on this server">
          Batch checking needs a detector. Files will still be read, but no AI-likelihood scores will be shown.
        </Alert>
      )}

      <Card className="p-5 sm:p-6">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            if (!running) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (!running) addFiles(e.dataTransfer.files);
          }}
          className={cx(
            "flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragging ? "border-brand-500 bg-brand-50" : "border-slate-200 bg-slate-50/60"
          )}
        >
          <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
            <FileUp className="size-6" aria-hidden />
          </div>
          <p className="font-medium text-slate-800">Drop files here or choose them</p>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            TXT, MD, DOC, DOCX or PDF · up to {MAX_FILES} files per batch, {formatSize(maxBytes)} each. Files are checked one after another so the detector stays fast and within usage limits.
          </p>
          <Button variant="secondary" className="mt-4" onClick={() => inputRef.current?.click()} disabled={running || items.length >= MAX_FILES}>
            <FileStack className="size-4" aria-hidden /> Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            aria-label="Choose files to check"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {notice && (
          <Alert tone="warning" className="mt-4" action={<button type="button" aria-label="Dismiss" onClick={() => setNotice("")} className="text-amber-700 hover:text-amber-900"><X className="size-4" /></button>}>
            {notice}
          </Alert>
        )}
      </Card>

      {items.length === 0 ? (
        <Card>
          <EmptyState icon={ScanSearch} title="No files yet">
            Add up to {MAX_FILES} documents to get an AI-likelihood estimate for each one in a single table you can export as CSV.
          </EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div className="text-sm text-slate-600" aria-live="polite">
              {running ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner className="size-4" /> Checking {stats.finished + 1 > items.length ? items.length : stats.finished + 1} of {items.length}...
                </span>
              ) : (
                <>
                  <span className="font-semibold text-slate-900">{items.length}</span> file{items.length === 1 ? "" : "s"}
                  {stats.scored > 0 && (
                    <>
                      {" "}· {stats.likelyAi} likely AI · average AI likelihood <span className="font-semibold text-slate-900">{Math.round(stats.avg * 100)}%</span>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {running ? (
                <Button variant="danger" size="sm" onClick={stop}>
                  <Square className="size-3.5" aria-hidden /> Stop
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" onClick={() => setItems([])}>
                    <Trash2 className="size-3.5" aria-hidden /> Clear all
                  </Button>
                  <Button variant="secondary" size="sm" onClick={exportCsv} disabled={stats.finished === 0}>
                    <Download className="size-3.5" aria-hidden /> Export CSV
                  </Button>
                  {pendingCount > 0 && (
                    <Button size="sm" onClick={run}>
                      <Play className="size-3.5" aria-hidden /> {items.some((it) => it.step === "done") ? `Check remaining (${pendingCount})` : `Check ${items.length} file${items.length === 1 ? "" : "s"}`}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-2.5">File</th>
                  <th scope="col" className="px-4 py-2.5 text-right">Words</th>
                  <th scope="col" className="px-4 py-2.5">Result</th>
                  <th scope="col" className="w-48 px-4 py-2.5">AI likelihood</th>
                  <th scope="col" className="w-24 px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((it) => {
                  const d = it.detection;
                  const ok = d?.status === "ok";
                  const open = expanded === it.id;
                  return (
                    <Fragment key={it.id}>
                      <tr className={cx(open && "bg-slate-50/60")}>
                        <td className="max-w-[16rem] px-4 py-3">
                          <p className="truncate font-medium text-slate-900" title={it.name}>{it.name}</p>
                          <p className="text-xs text-slate-500">{formatSize(it.size)}</p>
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-slate-700">{it.words?.toLocaleString() ?? "-"}</td>
                        <td className="px-4 py-3">
                          {it.step === "done" ? (
                            ok ? <Badge tone={VERDICT[d.verdict]?.tone ?? "neutral"}>{VERDICT[d.verdict]?.label ?? d.verdict}</Badge> : <Badge tone="amber">{SKIPPED[d?.status] ?? "No score"}</Badge>
                          ) : it.step === "error" ? (
                            <span className="text-xs text-red-600">{it.error}</span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                              {["extracting", "analyzing", "waiting"].includes(it.step) && <Spinner className="size-3.5" />}
                              {STEP_LABEL[it.step]}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {ok ? (
                            <div className="flex items-center gap-2">
                              <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                                <div
                                  className={cx("h-full rounded-full", BAR[d.verdict] ?? "bg-amber-600")}
                                  style={{ width: `${Math.max(2, d.scores.ai * 100)}%` }}
                                />
                              </div>
                              <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-900">{Math.round(d.scores.ai * 100)}%</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            {it.step === "done" && (
                              <button
                                type="button"
                                onClick={() => setExpanded(open ? null : it.id)}
                                aria-expanded={open}
                                aria-label={`${open ? "Hide" : "Show"} details for ${it.name}`}
                                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                              >
                                <ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} aria-hidden />
                              </button>
                            )}
                            {!running && (
                              <button
                                type="button"
                                onClick={() => remove(it.id)}
                                aria-label={`Remove ${it.name}`}
                                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="size-4" aria-hidden />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {open && (
                        <tr>
                          <td colSpan={5} className="bg-slate-50/60 px-4 pb-5 pt-1">
                            <DetectionSummary detection={d} disclaimer={it.disclaimer} />
                            <div className="mt-3 flex justify-end">
                              <Button variant="secondary" size="sm" onClick={() => openInDetector(it)}>
                                <ScanSearch className="size-3.5" aria-hidden /> Open in Detector for sentence highlights
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-xs leading-relaxed text-slate-500">
        Scores are statistical estimates from the same detector as the Detector page - not proof of authorship. Don&apos;t make decisions about people based on these numbers alone.
      </p>
    </div>
  );
}
