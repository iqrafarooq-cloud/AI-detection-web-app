"use client";

import { useRef, useState } from "react";
import { ClipboardPaste, FileUp, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { cx } from "@/components/ui";
import { countCharacters, countWords } from "@/lib/text/stats";
import { postForm } from "@/lib/client/api";
import { IMAGE_EXTENSIONS, IMAGE_MAX_BYTES, ocrImage } from "@/lib/client/ocr";

const DOC_EXTENSIONS = ["txt", "md", "doc", "docx", "pdf"];
const ACCEPT = [...DOC_EXTENSIONS, ...IMAGE_EXTENSIONS].map((e) => `.${e}`).join(",");

/**
 * Text area with paste, TXT/DOCX upload, clear/reset and live counts.
 * `onError` receives user-readable messages for upload/paste problems.
 */
export default function TextInputPanel({
  value,
  onChange,
  maxChars,
  placeholder = "Paste or type your text here...",
  label = "Your text",
  onReset,
  onError,
  disabled,
  minHeight = "min-h-72",
  footer,
}) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [sourceNote, setSourceNote] = useState(null);
  const words = countWords(value);
  const chars = countCharacters(value);
  const over = maxChars && chars > maxChars;

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return onError?.("Your clipboard is empty.");
      onChange(value ? `${value}${value.endsWith("\n") ? "" : "\n"}${text}` : text);
    } catch {
      onError?.("Clipboard access was blocked by your browser. Use Ctrl+V / Cmd+V to paste instead.");
    }
  }

  async function upload(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const ext = file.name.toLowerCase().split(".").pop();
    const isImage = IMAGE_EXTENSIONS.includes(ext);
    if (!isImage && !DOC_EXTENSIONS.includes(ext)) {
      return onError?.("Supported files: TXT, MD, DOC, DOCX, PDF, PNG, JPG, WEBP.");
    }
    setUploading(true);
    setSourceNote(null);
    try {
      if (isImage) {
        if (file.size > IMAGE_MAX_BYTES) throw new Error("Images can be up to 10 MB.");
        setProgress(0);
        const { text, confidence } = await ocrImage(file, setProgress);
        if (!text) throw new Error("No readable text was found in that image. Try a sharper, well-lit photo or a screenshot.");
        onChange(text);
        setSourceNote({
          tone: confidence < 75 ? "warn" : "info",
          text: `Text read from ${file.name} with OCR (confidence ${confidence}%). ${confidence < 75 ? "Recognition quality is low - please correct mistakes before analyzing." : "Please check it for recognition errors."}`,
        });
      } else {
        const fd = new FormData();
        fd.append("file", file);
        const res = await postForm("/api/extract", fd);
        onChange(res.text);
        setSourceNote({ tone: "info", text: `Loaded ${res.fileName}${res.pages ? ` (${res.pages} page${res.pages === 1 ? "" : "s"})` : ""}.` });
      }
    } catch (err) {
      onError?.(err?.message?.includes("fetch") ? "Couldn't load the OCR engine. Check your connection and try again." : err.message);
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-100">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <span className="px-1 text-sm font-medium text-slate-700">{label}</span>
        <div className="flex flex-wrap items-center gap-1">
          <ToolbarButton onClick={paste} disabled={disabled} icon={ClipboardPaste}>
            Paste
          </ToolbarButton>
          <ToolbarButton onClick={() => fileRef.current?.click()} disabled={disabled || uploading} icon={uploading ? Loader2 : FileUp} spin={uploading}>
            {uploading ? (progress !== null ? `Reading image ${progress}%` : "Reading...") : "Upload"}
          </ToolbarButton>
          <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={upload} aria-label="Upload a document or image" />
          <ToolbarButton onClick={() => { onChange(""); setSourceNote(null); }} disabled={disabled || !value} icon={Trash2}>
            Clear
          </ToolbarButton>
          {onReset && (
            <ToolbarButton onClick={onReset} disabled={disabled} icon={RotateCcw}>
              Reset
            </ToolbarButton>
          )}
        </div>
      </div>
      {sourceNote && (
        <p className={cx("border-b px-4 py-2 text-xs", sourceNote.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-100 bg-brand-50/60 text-brand-700")}>
          {sourceNote.text}
        </p>
      )}
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label={label}
        spellCheck
        className={cx("w-full flex-1 resize-y border-0 bg-transparent px-4 py-3 text-[15px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:outline-none focus-visible:outline-none disabled:opacity-60", minHeight)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
        <span aria-live="polite">
          {words.toLocaleString()} words · <span className={cx(over && "font-semibold text-red-600")}>{chars.toLocaleString()}</span>
          {maxChars ? ` / ${maxChars.toLocaleString()}` : ""} characters
        </span>
        {footer}
      </div>
    </div>
  );
}

function ToolbarButton({ icon: Icon, children, spin, ...props }) {
  return (
    <button
      type="button"
      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40"
      {...props}
    >
      <Icon className={cx("size-3.5", spin && "animate-spin")} aria-hidden />
      {children}
    </button>
  );
}
