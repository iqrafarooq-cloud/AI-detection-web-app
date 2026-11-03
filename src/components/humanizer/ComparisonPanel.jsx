"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Copy, FileDown, FileText, GitCompareArrows, Pencil, RefreshCw, Redo2, RotateCcw, Undo2 } from "lucide-react";
import { Alert, Badge, Button, Card } from "@/components/ui";
import DiffView, { diffStats } from "@/components/text/DiffView";
import { COMPARE_KEY, copyToClipboard, downloadDocx, downloadTxt, saveSession } from "@/lib/client/files";
import { countWords } from "@/lib/text/stats";
import RecheckCard from "./RecheckCard";

export default function ComparisonPanel({ session, setSession, loading, onRegenerate }) {
  const { original, versions, pos } = session;
  const current = versions[pos];
  const [showChanges, setShowChanges] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState("");
  const stats = diffStats(original, current.text);

  function pushVersion(text, label) {
    setSession((s) => {
      const vs = [...s.versions.slice(0, s.pos + 1), { text, label, preservation: null }];
      return { ...s, versions: vs, pos: vs.length - 1 };
    });
  }

  async function copy() {
    const ok = await copyToClipboard(current.text);
    setNotice(ok ? "" : "Copy failed - select the text and copy it manually.");
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  }

  async function docx() {
    try {
      await downloadDocx(current.text);
    } catch {
      setNotice("Couldn't create the Word file. Try downloading as TXT instead.");
    }
  }

  function startEdit() {
    setDraft(current.text);
    setEditing(true);
  }
  function saveEdit() {
    if (draft !== current.text) pushVersion(draft, "Manual edit");
    setEditing(false);
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Original vs improved</h2>
          <Badge tone="brand">
            Version {pos + 1} of {versions.length} · {current.label}
          </Badge>
          <Badge tone="green">+{stats.added} words</Badge>
          <Badge tone="red">-{stats.removed} words</Badge>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" className="size-4 accent-brand-600" checked={showChanges} onChange={(e) => setShowChanges(e.target.checked)} />
          Highlight changes
        </label>
      </div>

      {current.preservation && !current.preservation.ok && (
        <Alert tone="warning" title="Please double-check these details">
          Some numbers, citations or links from the original were not found unchanged in the improved text:{" "}
          <span className="font-mono text-xs">
            {current.preservation.missing.slice(0, 12).map((m) => m.value).join(", ")}
            {current.preservation.missing.length > 12 ? ` and ${current.preservation.missing.length - 12} more` : ""}
          </span>
          . Regenerate or edit the text to restore them.
        </Alert>
      )}
      {current.preservation?.ok && (
        <p className="flex items-center gap-1.5 text-xs text-emerald-700">
          <Check className="size-3.5" aria-hidden /> All numbers, citations and links from the original are present.
        </p>
      )}
      {notice && <Alert tone="error">{notice}</Alert>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="flex flex-col">
          <div className="flex h-12 items-center justify-between border-b border-slate-100 px-4">
            <span className="text-sm font-medium text-slate-700">Original text</span>
            <span className="text-xs text-slate-400">{countWords(original)} words</span>
          </div>
          <div className="max-h-[600px] min-h-64 flex-1 overflow-y-auto p-4">
            {showChanges ? <DiffView original={original} improved={current.text} mode="original" /> : <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{original}</p>}
          </div>
        </Card>

        <Card className="flex flex-col ring-1 ring-brand-100">
          <div className="flex h-12 items-center justify-between border-b border-slate-100 px-4">
            <span className="text-sm font-medium text-brand-700">Improved text</span>
            <span className="text-xs text-slate-400">{countWords(current.text)} words</span>
          </div>
          <div className="max-h-[600px] min-h-64 flex-1 overflow-y-auto p-4">
            {editing ? (
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Edit improved text"
                className="h-full min-h-72 w-full resize-y rounded-lg border border-slate-200 p-3 text-[15px] leading-relaxed focus:border-brand-500"
              />
            ) : showChanges ? (
              <DiffView original={original} improved={current.text} mode="improved" />
            ) : (
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{current.text}</p>
            )}
          </div>
        </Card>
      </div>

      <Card className="flex flex-wrap items-center gap-2 p-3">
        {editing ? (
          <>
            <Button size="sm" onClick={saveEdit}>
              <Check className="size-4" aria-hidden /> Save edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={copy}>
              {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              {copied ? "Copied" : "Copy improved text"}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => downloadTxt(current.text)}>
              <FileText className="size-4" aria-hidden /> TXT
            </Button>
            <Button size="sm" variant="secondary" onClick={docx}>
              <FileDown className="size-4" aria-hidden /> DOCX
            </Button>
            <Button size="sm" variant="secondary" onClick={onRegenerate} loading={loading} disabled={loading}>
              {!loading && <RefreshCw className="size-4" aria-hidden />} {loading ? "Regenerating..." : "Regenerate"}
            </Button>
            <Button size="sm" variant="secondary" onClick={startEdit}>
              <Pencil className="size-4" aria-hidden /> Edit
            </Button>
            <span className="mx-1 hidden h-6 w-px bg-slate-200 sm:block" aria-hidden />
            <Button size="sm" variant="ghost" onClick={() => setSession((s) => ({ ...s, pos: s.pos - 1 }))} disabled={pos === 0} aria-label="Undo">
              <Undo2 className="size-4" aria-hidden /> Undo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSession((s) => ({ ...s, pos: s.pos + 1 }))} disabled={pos >= versions.length - 1} aria-label="Redo">
              <Redo2 className="size-4" aria-hidden /> Redo
            </Button>
            <Button size="sm" variant="ghost" onClick={() => pushVersion(original, "Restored original")} disabled={current.text === original}>
              <RotateCcw className="size-4" aria-hidden /> Restore original
            </Button>
            <Link
              href="/compare"
              onClick={() => saveSession(COMPARE_KEY, { original, improved: current.text })}
              className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-xl px-3 text-xs font-medium text-brand-700 hover:bg-brand-50"
            >
              <GitCompareArrows className="size-4" aria-hidden /> Open in Compare
            </Link>
          </>
        )}
      </Card>
      {current.recheck && <RecheckCard recheck={current.recheck} pipeline={current.pipeline} model={current.model} />}
    </div>
  );
}
