import { NextResponse } from "next/server";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { extractText as extractPdfText, getDocumentProxy } from "unpdf";
import { config } from "@/lib/config";
import { AppError, enforceRateLimit, handleRouteError } from "@/lib/server/http";

export const runtime = "nodejs";
export const maxDuration = 60;

// Images (PNG/JPG/WebP) are OCR'd in the browser, so they never reach this route.
const HANDLERS = {
  txt: extractTxt,
  md: extractTxt,
  docx: extractDocx,
  doc: extractDoc,
  pdf: extractPdf,
};

export async function POST(request) {
  try {
    enforceRateLimit(request, "upload", config.limits.uploadPerWindow);

    const declared = Number(request.headers.get("content-length") || 0);
    if (declared > config.limits.uploadMaxBytes + 64 * 1024) {
      throw new AppError("file_too_large", fileTooLargeMessage(), 413);
    }

    let form;
    try {
      form = await request.formData();
    } catch {
      throw new AppError("invalid_upload", "Upload must be sent as multipart form data.");
    }
    const file = form.get("file");
    if (!file || typeof file === "string") throw new AppError("no_file", "Please choose a file to upload.");
    if (file.size === 0) throw new AppError("empty_file", "The file is empty.");
    if (file.size > config.limits.uploadMaxBytes) throw new AppError("file_too_large", fileTooLargeMessage(), 413);

    const ext = String(file.name || "").toLowerCase().split(".").pop();
    const handler = HANDLERS[ext];
    if (!handler) {
      throw new AppError("unsupported_type", "Supported files: .txt, .md, .doc, .docx, .pdf, .png, .jpg, .jpeg, .webp.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let { text, meta } = await handler(buffer);

    text = text
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!text) throw new AppError("no_text", "No readable text was found in that file.");

    return NextResponse.json({ text, fileName: file.name, chars: text.length, ...meta });
  } catch (err) {
    return handleRouteError(err, "extract");
  }
}

async function extractTxt(buffer) {
  if (buffer.includes(0)) throw new AppError("unsupported_type", "That file does not look like plain text.");
  return { text: new TextDecoder("utf-8").decode(buffer).replace(/^﻿/, ""), meta: { source: "text" } };
}

async function extractDocx(buffer) {
  // DOCX files are ZIP archives: they start with "PK\x03\x04".
  if (buffer.length < 4 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new AppError("unsupported_type", "That file is not a valid Word (.docx) document.");
  }
  try {
    const out = await mammoth.extractRawText({ buffer });
    return { text: out.value, meta: { source: "docx" } };
  } catch {
    throw new AppError("parse_failed", "We couldn't read that Word document. Try saving it again or paste the text instead.");
  }
}

async function extractDoc(buffer) {
  // Legacy .doc files are OLE compound documents: D0 CF 11 E0.
  if (buffer.length < 8 || buffer.readUInt32LE(0) !== 0xe011cfd0) {
    // Some ".doc" files are really DOCX - handle them gracefully.
    if (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50) return extractDocx(buffer);
    throw new AppError("unsupported_type", "That file is not a valid Word (.doc) document.");
  }
  try {
    const doc = await new WordExtractor().extract(buffer);
    return { text: doc.getBody(), meta: { source: "doc" } };
  } catch {
    throw new AppError("parse_failed", "We couldn't read that .doc file. Try saving it as .docx or paste the text instead.");
  }
}

async function extractPdf(buffer) {
  if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new AppError("unsupported_type", "That file is not a valid PDF.");
  }
  let result;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    result = await extractPdfText(pdf, { mergePages: false });
  } catch (err) {
    if (/password/i.test(err?.message || "")) {
      throw new AppError("pdf_encrypted", "This PDF is password-protected. Remove the password and try again.");
    }
    throw new AppError("parse_failed", "We couldn't read that PDF. Try exporting it again or paste the text instead.");
  }
  const text = result.text.map((p) => reflowPdfPage(p)).filter(Boolean).join("\n\n");
  if (!text.trim()) {
    throw new AppError(
      "pdf_no_text",
      "This PDF has no selectable text (it is probably a scan). Upload the pages as PNG/JPG images and we'll read them with OCR."
    );
  }
  return { text, meta: { source: "pdf", pages: result.totalPages } };
}

/**
 * PDFs store visual lines, not paragraphs. Rejoins lines that were wrapped in
 * the middle of a sentence (and words hyphenated at a line end) so the text
 * reaches the detector the same way it would if it had been pasted.
 */
function reflowPdfPage(page) {
  return page
    .replace(/\r\n?/g, "\n")
    .replace(/(\p{L})-\n(\p{Ll})/gu, "$1$2")
    .replace(/([^\n.!?:;"”')\]])\n(?=[\p{Ll}\d(])/gu, "$1 ")
    .trim();
}

function fileTooLargeMessage() {
  return `File is too large. The maximum size is ${Math.round(config.limits.uploadMaxBytes / 1024 / 1024)} MB.`;
}
