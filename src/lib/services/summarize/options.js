// Shared (client + server) summarizer options.

export const SUMMARY_FORMATS = [
  { id: "bullets", label: "Key points", hint: "A bulleted list of the main ideas." },
  { id: "paragraph", label: "Paragraph", hint: "A short, flowing prose summary." },
  { id: "tldr", label: "TL;DR", hint: "One or two sentences with the core message." },
];

export const SUMMARY_LENGTHS = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Detailed" },
];

export const DEFAULT_SUMMARY_OPTIONS = { format: "bullets", length: "medium" };

export function sanitizeSummaryOptions(input = {}) {
  return {
    format: SUMMARY_FORMATS.some((f) => f.id === input?.format) ? input.format : DEFAULT_SUMMARY_OPTIONS.format,
    length: SUMMARY_LENGTHS.some((l) => l.id === input?.length) ? input.length : DEFAULT_SUMMARY_OPTIONS.length,
  };
}
