"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ScanSearch, PenLine } from "lucide-react";
import TextInputPanel from "@/components/text/TextInputPanel";
import { Alert, Button } from "@/components/ui";
import { DRAFT_KEY, saveSession } from "@/lib/client/files";

export default function HeroInput() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState("");

  function go(path) {
    if (!text.trim()) return setError("Paste or upload some text first.");
    saveSession(DRAFT_KEY, { text });
    router.push(path);
  }

  return (
    <div className="space-y-3">
      <TextInputPanel value={text} onChange={(v) => { setText(v); setError(""); }} onError={setError} minHeight="min-h-48" />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button variant="gradient" size="lg" className="flex-1" onClick={() => go("/detector")}>
          <ScanSearch className="size-5" aria-hidden /> Analyze Text
        </Button>
        <Button variant="secondary" size="lg" className="flex-1" onClick={() => go("/humanizer")}>
          <PenLine className="size-5 text-accent-600" aria-hidden /> Improve Writing
        </Button>
      </div>
    </div>
  );
}
