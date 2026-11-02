"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Check, Copy, FileDown, FileText, GitCompareArrows } from "lucide-react";
import TextInputPanel from "@/components/text/TextInputPanel";
import DiffView, { diffStats } from "@/components/text/DiffView";
import { Alert, Badge, Button, Card, EmptyState } from "@/components/ui";
import { COMPARE_KEY, copyToClipboard, downloadDocx, downloadTxt, loadSession } from "@/lib/client/files";

export default function CompareApp() {
  const [original, setOriginal] = useState("");
  const [improved, setImproved] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const saved = loadSession(COMPARE_KEY);
    if (saved) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOriginal(saved.original || "");
      setImproved(saved.improved || "");
    }
  }, []);

  const ready = original.trim() && improved.trim();
  const stats = ready ? diffStats(original, improved) : null;

  async function copy() {
    const ok = await copyToClipboard(improved);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } else setError("Copy failed - select the text and copy it manually.");
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <TextInputPanel label="Original text" value={original} onChange={setOriginal} onError={setError} minHeight="min-h-56" />
        <TextInputPanel label="Revised text" value={improved} onChange={setImproved} onError={setError} minHeight="min-h-56" />
      </div>
      {error && <Alert tone="error">{error}</Alert>}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setOriginal(improved);
            setImproved(original);
          }}
          disabled={!original && !improved}
        >
          <ArrowLeftRight className="size-4" aria-hidden /> Swap
        </Button>
        <Button size="sm" variant="secondary" onClick={copy} disabled={!improved.trim()}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? "Copied" : "Copy revised"}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => downloadTxt(improved, "detectly-revised.txt")} disabled={!improved.trim()}>
          <FileText className="size-4" aria-hidden /> TXT
        </Button>
        <Button size="sm" variant="secondary" onClick={() => downloadDocx(improved, "detectly-revised.docx").catch(() => setError("Couldn't create the Word file."))} disabled={!improved.trim()}>
          <FileDown className="size-4" aria-hidden /> DOCX
        </Button>
        {stats && (
          <span className="ml-auto flex gap-2">
            <Badge tone="green">+{stats.added} words</Badge>
            <Badge tone="red">-{stats.removed} words</Badge>
          </span>
        )}
      </div>

      {ready ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <p className="mb-3 text-sm font-medium text-slate-700">Removed from original</p>
            <DiffView original={original} improved={improved} mode="original" />
          </Card>
          <Card className="p-4 ring-1 ring-brand-100">
            <p className="mb-3 text-sm font-medium text-brand-700">Added in revision</p>
            <DiffView original={original} improved={improved} mode="improved" />
          </Card>
        </div>
      ) : (
        <Card>
          <EmptyState icon={GitCompareArrows} title="Add two versions to compare">
            Paste an original and a revised version, or open a result from the Humanizer. Changes are highlighted word by word.
          </EmptyState>
        </Card>
      )}
    </div>
  );
}
