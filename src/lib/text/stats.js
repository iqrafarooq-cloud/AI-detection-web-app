// Language-aware text utilities built on Intl.Segmenter (works in Node and modern browsers).

const sentenceSegmenter =
  typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: "sentence" })
    : null;
const wordSegmenter =
  typeof Intl !== "undefined" && Intl.Segmenter
    ? new Intl.Segmenter(undefined, { granularity: "word" })
    : null;

export function getWords(text) {
  if (!text) return [];
  if (wordSegmenter) {
    const out = [];
    for (const seg of wordSegmenter.segment(text)) {
      if (seg.isWordLike) out.push(seg.segment);
    }
    return out;
  }
  return text.split(/\s+/).filter(Boolean);
}

export function countWords(text) {
  return getWords(text).length;
}

export function countCharacters(text) {
  return text ? [...text].length : 0;
}

/**
 * Splits text into sentences and keeps character offsets so the UI can
 * highlight exact ranges of the original text.
 */
export function splitSentences(text) {
  if (!text || !text.trim()) return [];
  const raw = [];
  if (sentenceSegmenter) {
    for (const seg of sentenceSegmenter.segment(text)) {
      raw.push({ segment: seg.segment, index: seg.index });
    }
  } else {
    const re = /[^.!?]+[.!?]*\s*/g;
    let m;
    while ((m = re.exec(text))) raw.push({ segment: m[0], index: m.index });
  }
  // Further split on line breaks so headings / list items are their own unit.
  const result = [];
  for (const { segment, index } of raw) {
    let offset = 0;
    for (const part of segment.split(/(\n+)/)) {
      if (part && !/^\n+$/.test(part)) {
        const trimmedStart = part.length - part.trimStart().length;
        const value = part.trim();
        if (value) {
          const start = index + offset + trimmedStart;
          result.push({ text: value, start, end: start + value.length });
        }
      }
      offset += part.length;
    }
  }
  return result;
}

export function splitParagraphs(text) {
  return (text || "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

const ENGLISH_STOPWORDS = new Set(
  "the a an and or but of to in on for with is are was were be been it this that as at by from not have has had they we you he she i".split(
    " "
  )
);

// Very common function words in other Latin-script languages (Spanish, French,
// German, Italian, Portuguese, Dutch). Words that are also common in English
// ("a", "no", "die", "in") are left out so they cannot tip the balance.
const FOREIGN_STOPWORDS = new Set(
  "el la los las del que y es por para con una se lo les des et est une pas du au sur der das und ist nicht ein eine mit dem von zu il che di per non della sono em os uma não het een zijn niet".split(
    " "
  )
);

/**
 * Heuristic: is this text English? Used only for soft warnings, never to block.
 * Text with few function words (resumes, bullet lists, keyword-heavy or
 * technical documents) is treated as English unless it shows clear signs of
 * another language: mostly non-Latin letters, or more foreign than English
 * function words.
 */
export function looksEnglish(text) {
  if (!text) return true;
  const letters = text.match(/\p{L}/gu) || [];
  if (!letters.length) return true;
  const basicLatin = letters.filter((c) => /[A-Za-z]/.test(c)).length;
  if (basicLatin / letters.length < 0.8) return false;
  const words = getWords(text).map((w) => w.toLowerCase());
  if (words.length < 8) return true;
  let english = 0;
  let foreign = 0;
  for (const w of words) {
    if (ENGLISH_STOPWORDS.has(w)) english++;
    else if (FOREIGN_STOPWORDS.has(w)) foreign++;
  }
  return foreign <= english || foreign / words.length < 0.05;
}
