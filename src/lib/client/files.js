"use client";

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTxt(text, filename = "detectly-improved.txt") {
  triggerDownload(new Blob([text], { type: "text/plain;charset=utf-8" }), filename);
}

export async function downloadDocx(text, filename = "detectly-improved.docx") {
  // Loaded lazily so the docx library is only fetched when needed.
  const { Document, Packer, Paragraph, TextRun } = await import("docx");
  const paragraphs = text.split(/\n\s*\n/).map(
    (block) =>
      new Paragraph({
        spacing: { after: 200 },
        children: block.split("\n").map((line, i) => new TextRun({ text: line, break: i > 0 ? 1 : 0 })),
      })
  );
  const doc = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, filename);
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for browsers without async clipboard permission.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

export const DRAFT_KEY = "textwise:draft";
export const COMPARE_KEY = "textwise:comparison";

export function saveSession(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}
export function loadSession(key) {
  try {
    const v = sessionStorage.getItem(key);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
}
export function clearSession(key) {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
