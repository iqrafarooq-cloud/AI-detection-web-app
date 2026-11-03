"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Check, CheckCheck, Copy, PenLine, SpellCheck, X } from "lucide-react";
import TextInputPanel from "@/components/text/TextInputPanel";
import { Alert, Badge, Button, Card, EmptyState, Spinner, cx } from "@/components/ui";
import { postJson } from "@/lib/client/api";
import { useStatus } from "@/lib/client/useStatus";
import { usePersistentState } from "@/lib/client/usePersistentState";
import { DRAFT_KEY, clearSession, copyToClipboard, loadSession } from "@/lib/client/files";
import { ISSUE_TYPES, applyIssues } from "@/lib/services/grammar/shared";

// Colour per issue type. All shades are theme tokens, so they adapt in dark mode.
const TYPE_STYLE = {
  grammar: { label: "Grammar", badge: "red", mark: "decoration-red-600 bg-red-50" },
  spelling: { label: "Spelling", badge: "amber", mark: "decoration-amber-600 bg-amber-50" },
  punctuation: { label: "Punctuation", badge: "violet", mark: "decoration-violet-600 bg-violet-50" },
  clarity: { label: "Clarity", badge: "brand", mark: "decoration-brand-600 bg-brand-50" },
  wordiness: { label: "Wordiness", badge: "green", mark: "decoration-emerald-600 bg-emerald-50" },
  style: { label: "Style", badge: "neutral", mark: "decoration-slate-400 bg-slate-100" },
};

export default function GrammarApp() {
  const status = useStatus();
  const [text, setText] = usePersistentState("grammar:text", "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = usePersistentState("grammar:result", null); // { text, issues, provider }
  const [decisions, setDecisions] = usePersistentState("grammar:decisions", {}); // id -> "accepted" | "ignored"
  const [filter, setFilter] = usePersistentState("grammar:filter", "all");
  const [activeId, setActiveId] = useState(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef(null);
  const maxChars = status?.limits?.grammarMaxChars ?? 12000;
  const unavailable = status && !status.rewrite.configured;

  useEffect(() => {
    const draft = loadSession(DRAFT_KEY);
    if (draft?.text) {
       
      setText(draft.text);
      setResult(null);
      setDecisions({});
      clearSession(DRAFT_KEY);
    }
    return () => abortRef.current?.abort();
  }, [setText, setResult, setDecisions]);

  const accepted = useMemo(() => (result ? result.issues.filter((i) => decisions[i.id] === "accepted") : []), [result, decisions]);
  const pending = useMemo(() => (result ? result.issues.filter((i) => !decisions[i.id]) : []), [result, decisions]);
  const currentText = useMemo(() => (result ? applyIssues(result.text, accepted) : ""), [result, accepted]);
  const visible = result ? result.issues.filter((i) => filter === "all" || i.type === filter) : [];

  async function check() {
    setError("");
    if (!text.trim()) return setError("Please enter or upload some text to check.");
    if (text.length > maxChars) return setError(`Text is too long. The limit is ${maxChars.toLocaleString()} characters - check it in sections.`);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await postJson("/api/grammar", { text }, { signal: controller.signal });
      setResult({ text: text.replace(/\r\n/g, "\n"), issues: res.issues, provider: res.provider });
      setDecisions({});
      setFilter("all");
      setActiveId(null);
      requestAnimationFrame(() => document.getElementById("grammar-results")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function decide(id, value) {
    setDecisions((d) => ({ ...d, [id]: value }));
  }

  function acceptAll() {
    setDecisions((d) => {
      const next = { ...d };
      for (const i of visible) if (!next[i.id]) next[i.id] = "accepted";
      return next;
    });
  }

  async function copy() {
    if (await copyToClipboard(currentText)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  function editAgain() {
    setText(currentText);
    setResult(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function reset() {
    abortRef.current?.abort();
    setText("");
    setResult(null);
    setError("");
  }

  function focusIssue(id) {
    setActiveId(id);
    document.getElementById(`issue-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  return (
    <div className="space-y-8">
      {unavailable && (
        <Alert tone="warning" title="Grammar checking is currently unavailable">
          No language-model provider is configured on this server.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        <TextInputPanel
          value={text}
          onChange={setText}
          maxChars={maxChars}
          onReset={reset}
          onError={setError}
          disabled={loading}
          placeholder="Paste an email, essay or report to check grammar, spelling, punctuation and clarity..."
        />
        <Card className="flex flex-col gap-4 p-5">
          <div>
            <p className="font-semibold text-slate-900">Check grammar &amp; clarity</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-500">
              Finds grammar, spelling and punctuation mistakes plus unclear or wordy phrasing. You review every suggestion - nothing changes until you accept it.
            </p>
          </div>
          <Button variant="gradient" size="lg" onClick={check} loading={loading} disabled={!text.trim() || unavailable}>
            {!loading && <SpellCheck className="size-5" aria-hidden />}
            {loading ? "Checking..." : "Check Text"}
          </Button>
          <p className="text-xs leading-relaxed text-slate-500">Up to {maxChars.toLocaleString()} characters per check. Facts, names and citations are never changed.</p>
        </Card>
      </div>

      {error && <Alert tone="error" title="Couldn't check the text">{error}</Alert>}

      <section id="grammar-results" aria-live="polite" className="scroll-mt-24">
        {loading && (
          <Card className="flex items-center justify-center gap-3 p-10 text-sm text-slate-600">
            <Spinner />
            <span>Reading your text and collecting suggestions... usually 5-20 seconds.</span>
          </Card>
        )}
        {!loading && !result && (
          <Card>
            <EmptyState icon={SpellCheck} title="Suggestions will appear here">
              Paste text above and select Check Text. Each suggestion is highlighted in your text with a short explanation.
            </EmptyState>
          </Card>
        )}
        {!loading && result && (
          <div className="space-y-4 animate-fade-in">
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <p className="text-sm text-slate-600">
                {result.issues.length === 0 ? (
                  <span className="font-medium text-emerald-700">No issues found - your text looks good.</span>
                ) : (
                  <>
                    <span className="font-semibold text-slate-900">{result.issues.length}</span> suggestion{result.issues.length === 1 ? "" : "s"} ·{" "}
                    {accepted.length} accepted · {pending.length} to review
                  </>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={editAgain}>
                  <PenLine className="size-3.5" aria-hidden /> Edit &amp; re-check
                </Button>
                <Button variant="secondary" size="sm" onClick={copy}>
                  {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                  {copied ? "Copied" : "Copy text"}
                </Button>
                {pending.length > 0 && (
                  <Button size="sm" onClick={acceptAll}>
                    <CheckCheck className="size-3.5" aria-hidden /> Accept all{filter !== "all" ? ` ${TYPE_STYLE[filter].label.toLowerCase()}` : ""}
                  </Button>
                )}
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
              <Card className="p-5 sm:p-6 lg:self-start">
                <h2 className="mb-3 text-sm font-semibold text-slate-900">Your text</h2>
                <HighlightedText text={result.text} issues={result.issues} decisions={decisions} activeId={activeId} onSelect={focusIssue} />
              </Card>

              <Card className="flex max-h-[42rem] flex-col p-0">
                <div className="flex flex-wrap gap-1.5 border-b border-slate-100 p-3" role="toolbar" aria-label="Filter suggestions by type">
                  <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label="All" count={result.issues.length} />
                  {ISSUE_TYPES.map((t) => {
                    const n = result.issues.filter((i) => i.type === t).length;
                    return n ? <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)} label={TYPE_STYLE[t].label} count={n} /> : null;
                  })}
                </div>
                <ul className="flex-1 space-y-2 overflow-y-auto p-3">
                  {visible.length === 0 && <li className="p-6 text-center text-sm text-slate-500">Nothing to show.</li>}
                  {visible.map((i) => (
                    <IssueCard key={i.id} issue={i} state={decisions[i.id]} active={activeId === i.id} onDecide={decide} onFocus={() => setActiveId(i.id)} />
                  ))}
                </ul>
              </Card>
            </div>
            <p className="text-xs text-slate-500">
              Suggestions by {result.provider.name} ({result.provider.model}). Automated suggestions can be wrong - keep what fits your meaning.{" "}
              <Link href="/humanizer" className="font-medium text-brand-600 hover:underline">
                Need a full rewrite? Try the Humanizer.
              </Link>
            </p>
          </div>
        )}
      </section>
    </div>
  );
}

function FilterChip({ active, onClick, label, count }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
        active ? "bg-brand-600 text-on-accent" : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
      )}
    >
      {label}
      <span className={cx("tabular-nums", active ? "opacity-80" : "text-slate-500")}>{count}</span>
    </button>
  );
}

function IssueCard({ issue, state, active, onDecide, onFocus }) {
  const s = TYPE_STYLE[issue.type];
  return (
    <li
      id={`issue-${issue.id}`}
      onMouseEnter={onFocus}
      className={cx(
        "scroll-my-3 rounded-xl border p-3 transition-colors",
        active ? "border-brand-300 bg-brand-50/40" : "border-slate-200",
        state && "opacity-60"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <Badge tone={s.badge}>{s.label}</Badge>
        {state && <span className="text-xs font-medium text-slate-500">{state === "accepted" ? "Accepted" : "Ignored"}</span>}
      </div>
      <p className="mt-2 break-words text-sm">
        <span className="text-slate-500 line-through decoration-red-600/60">{issue.original}</span>
        <span className="mx-1.5 text-slate-400" aria-hidden>
          →
        </span>
        <span className="sr-only">replace with</span>
        <span className="font-medium text-slate-900">{issue.suggestion || <em className="text-slate-500">(remove)</em>}</span>
      </p>
      {issue.explanation && <p className="mt-1 text-xs leading-relaxed text-slate-500">{issue.explanation}</p>}
      <div className="mt-2.5 flex gap-2">
        {state ? (
          <Button variant="ghost" size="sm" onClick={() => onDecide(issue.id, undefined)}>
            Undo
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={() => onDecide(issue.id, "accepted")}>
              <Check className="size-3.5" aria-hidden /> Accept
            </Button>
            <Button variant="secondary" size="sm" onClick={() => onDecide(issue.id, "ignored")}>
              <X className="size-3.5" aria-hidden /> Ignore
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

/** Renders the checked text with each issue marked; accepted ones show the fix. */
function HighlightedText({ text, issues, decisions, activeId, onSelect }) {
  const parts = [];
  let pos = 0;
  for (const i of issues) {
    if (i.start > pos) parts.push(text.slice(pos, i.start));
    const state = decisions[i.id];
    if (state === "accepted") {
      parts.push(
        <ins key={i.id} className="rounded bg-emerald-50 px-0.5 text-emerald-700 no-underline">
          {i.suggestion}
        </ins>
      );
    } else if (state === "ignored") {
      parts.push(i.original);
    } else {
      parts.push(
        <button
          key={i.id}
          type="button"
          onClick={() => onSelect(i.id)}
          title={`${TYPE_STYLE[i.type].label}: ${i.suggestion || "remove"}`}
          className={cx(
            "rounded px-0.5 underline decoration-2 underline-offset-4 transition-shadow",
            TYPE_STYLE[i.type].mark,
            activeId === i.id && "ring-2 ring-brand-300"
          )}
        >
          {i.original}
        </button>
      );
    }
    pos = i.end;
  }
  if (pos < text.length) parts.push(text.slice(pos));
  return <div className="whitespace-pre-wrap break-words text-[15px] leading-8 text-slate-800">{parts}</div>;
}
