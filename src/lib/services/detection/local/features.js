// Linguistic features that feed the detector's calibration layer next to the
// classifier's own score. Pure functions (no model, no I/O) shared by the
// production pipeline and the calibration/evaluation scripts.
//
// None of these decides anything on its own. They are inputs to one logistic
// model fitted on labeled human and AI texts, which learns how much (if at
// all) each one shifts the classifier's evidence. Formality, grammar and
// vocabulary level are deliberately NOT features: they say nothing reliable
// about authorship and would penalise careful human writers.

import { getWords, splitSentences } from "@/lib/text/stats";

/**
 * Typographic quotes and non-breaking spaces depend on the editor, not the
 * writer: Word curls quotes automatically, a plain text box does not. They
 * are mapped to plain characters before scoring so the same writing gets the
 * same result whether it was pasted or uploaded. One character maps to one
 * character, so passage offsets still point into the original text.
 */
export function normalizeForScoring(text) {
  return text
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[   ]/g, " ");
}

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

/** Moving-average type-token ratio (length-robust vocabulary diversity). */
export function mattr(words, window = 50) {
  if (!words.length) return 0;
  if (words.length <= window) return new Set(words).size / words.length;
  const counts = new Map();
  let unique = 0;
  let sum = 0;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    counts.set(w, (counts.get(w) || 0) + 1);
    if (counts.get(w) === 1) unique++;
    if (i >= window) {
      const old = words[i - window];
      counts.set(old, counts.get(old) - 1);
      if (counts.get(old) === 0) unique--;
    }
    if (i >= window - 1) sum += unique / window;
  }
  return sum / (words.length - window + 1);
}

const PUNCTUATION = ["!", "?", ";", ":", "(", "\"", "'", "-", "…", "..."];

/**
 * Style statistics for a text. Values that can't be measured on a short text
 * are null; the calibration replaces them with the training mean, so they
 * neither help nor hurt.
 */
export function styleStats(text) {
  const sentences = splitSentences(text);
  const words = getWords(text).map((w) => w.toLowerCase());
  const lengths = sentences.map((s) => getWords(s.text).length).filter((n) => n > 0);

  // Sentence-length variation (coefficient of variation): humans tend to mix
  // short and long sentences more than language models do.
  let sentenceCv = null;
  if (lengths.length >= 4) {
    const m = mean(lengths);
    sentenceCv = Math.sqrt(mean(lengths.map((n) => (n - m) ** 2))) / m;
  }

  // Share of sentences whose first word also starts another sentence:
  // repetitive sentence construction.
  let openerRepeat = null;
  if (lengths.length >= 4) {
    const first = sentences.map((s) => getWords(s.text)[0]?.toLowerCase()).filter(Boolean);
    const counts = new Map();
    for (const f of first) counts.set(f, (counts.get(f) || 0) + 1);
    openerRepeat = first.filter((f) => counts.get(f) > 1).length / first.length;
  }

  // How many different punctuation marks are used, per sqrt(100 words):
  // a coarse measure of natural irregularity in human writing.
  let punctuationVariety = null;
  if (words.length >= 40) {
    const used = PUNCTUATION.filter((p) => text.includes(p)).length;
    punctuationVariety = used / Math.sqrt(words.length / 100);
  }

  return {
    sentenceCv,
    lexicalDiversity: words.length >= 40 ? mattr(words) : null,
    openerRepeat,
    punctuationVariety,
  };
}

export const STYLE_FEATURES = ["sentenceCv", "lexicalDiversity", "openerRepeat", "punctuationVariety"];
