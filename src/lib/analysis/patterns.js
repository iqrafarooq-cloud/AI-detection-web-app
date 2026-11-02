// Transparent, rule-based writing-pattern analysis.
//
// IMPORTANT: this module does NOT estimate whether text was written by AI.
// It surfaces stylistic signals (formulaic phrases, uniform rhythm, repetition)
// that editors commonly associate with generic writing - from humans or models.
// It never produces an "AI probability".

import { getWords, splitSentences, looksEnglish } from "@/lib/text/stats";

const STOCK_PHRASES = [
  { re: /\bdelv(e|es|ing)\s+(into|deeper)\b/i, reason: "\"Delve into\" is a stock phrase that often reads as filler." },
  { re: /\bin today'?s (fast-paced|digital|modern|ever-changing|rapidly evolving) (world|age|landscape|era)\b/i, reason: "Generic scene-setting opener that adds little information." },
  { re: /\bit(?:'s| is) (important|worth|crucial|essential) to (note|remember|mention|highlight|consider) that\b/i, reason: "Signposting phrase that can usually be cut without losing meaning." },
  { re: /\b(plays?|playing) a (crucial|pivotal|vital|key|significant) role\b/i, reason: "Common formulaic construction; a specific verb is usually clearer." },
  { re: /\b(rich|intricate|vibrant) tapestry\b/i, reason: "Cliché metaphor that tends to sound generic." },
  { re: /\b(navigat(e|ing) the (complexities|intricacies|landscape))\b/i, reason: "Abstract cliché; consider naming the actual challenge." },
  { re: /\b(a testament to)\b/i, reason: "Frequently overused evaluative phrase." },
  { re: /\b(ever-evolving|ever-changing) landscape\b/i, reason: "Generic phrase with low information content." },
  { re: /\b(unlock|unleash|harness) the (full )?(power|potential)\b/i, reason: "Marketing-style cliché." },
  { re: /\bin (conclusion|summary|essence),/i, reason: "Formulaic wrap-up transition." },
  { re: /\b(seamless(ly)?|robust|cutting-edge|game-chang(er|ing)|groundbreaking|revolutioniz(e|ing))\b/i, reason: "Buzzword that may sound promotional or vague." },
  { re: /\bwhether you'?re an? .{1,40} or an? /i, reason: "Template-like audience framing." },
  { re: /\bnot only .{1,60} but also\b/i, reason: "Common balanced construction; fine occasionally, formulaic when repeated." },
  { re: /\b(moreover|furthermore|additionally|consequently|nonetheless),/i, reason: "Heavy formal transition; often unnecessary between closely related sentences." },
  { re: /\bembark(ed|ing)? on (a|the|this) journey\b/i, reason: "Cliché metaphor." },
  { re: /\bstands? as a\b/i, reason: "Inflated phrasing; \"is\" is often enough." },
];

function mean(nums) {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}
function stdDev(nums) {
  if (nums.length < 2) return 0;
  const m = mean(nums);
  return Math.sqrt(mean(nums.map((n) => (n - m) ** 2)));
}

/** Moving-average type-token ratio: length-robust lexical diversity. */
function mattr(words, window = 50) {
  if (words.length === 0) return 0;
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

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

export function analyzePatterns(text) {
  const sentences = splitSentences(text);
  const allWords = getWords(text).map((w) => w.toLowerCase());
  const english = looksEnglish(text);

  const sentenceData = sentences.map((s) => ({
    ...s,
    wordCount: getWords(s.text).length,
    flags: [],
  }));

  // 1) Stock phrases (English only - the list is English-specific).
  let stockHits = 0;
  if (english) {
    for (const s of sentenceData) {
      for (const p of STOCK_PHRASES) {
        const m = s.text.match(p.re);
        if (m) {
          stockHits++;
          s.flags.push({ type: "stock_phrase", match: m[0], reason: p.reason });
        }
      }
    }
  }

  // 2) Repeated sentence openers (first two words).
  const openers = new Map();
  for (const s of sentenceData) {
    const w = getWords(s.text).slice(0, 2).map((x) => x.toLowerCase());
    if (w.length < 2) continue;
    const key = w.join(" ");
    if (!openers.has(key)) openers.set(key, []);
    openers.get(key).push(s);
  }
  for (const [key, list] of openers) {
    if (list.length >= 3) {
      for (const s of list) {
        s.flags.push({
          type: "repeated_opener",
          match: key,
          reason: `${list.length} sentences start with "${key}". Varying openings improves flow.`,
        });
      }
    }
  }

  // 3) Repeated 3-word phrases across the text.
  const trigramCounts = new Map();
  for (let i = 0; i + 2 < allWords.length; i++) {
    const g = `${allWords[i]} ${allWords[i + 1]} ${allWords[i + 2]}`;
    trigramCounts.set(g, (trigramCounts.get(g) || 0) + 1);
  }
  const minRepeats = allWords.length > 400 ? 4 : 3;
  const repeated = [...trigramCounts.entries()]
    .filter(([g, c]) => c >= minRepeats && !/^(of the|in the|and the|to the)\b/.test(g))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  for (const [g, c] of repeated) {
    for (const s of sentenceData) {
      if (s.text.toLowerCase().includes(g)) {
        s.flags.push({ type: "repetition", match: g, reason: `The phrase "${g}" appears ${c} times in the text.` });
      }
    }
  }

  // 4) Very long sentences (readability, not authorship).
  for (const s of sentenceData) {
    if (s.wordCount > 40) {
      s.flags.push({
        type: "long_sentence",
        reason: `${s.wordCount} words long. Consider splitting it for readability.`,
      });
    }
  }

  // Document-level metrics.
  const lengths = sentenceData.map((s) => s.wordCount).filter((n) => n > 0);
  const avg = mean(lengths);
  const sd = stdDev(lengths);
  const cv = avg ? sd / avg : 0;
  const diversity = mattr(allWords);

  const signals = [];
  if (lengths.length >= 6 && cv < 0.3) {
    signals.push({
      id: "uniform_rhythm",
      level: "notice",
      title: "Uniform sentence rhythm",
      detail: `Sentence lengths vary little (variation ${round(cv)}; many human-edited texts land above 0.4). Mixing short and long sentences usually reads more naturally.`,
    });
  }
  if (english && allWords.length >= 80) {
    const density = (stockHits / allWords.length) * 100;
    if (density >= 0.8) {
      signals.push({
        id: "stock_phrases",
        level: "notice",
        title: "Frequent stock phrases",
        detail: `${stockHits} formulaic phrases found (${round(density, 1)} per 100 words).`,
      });
    }
  }
  if (repeated.length) {
    signals.push({
      id: "repetition",
      level: "info",
      title: "Repeated phrasing",
      detail: `Repeated phrases: ${repeated.map(([g]) => `"${g}"`).slice(0, 4).join(", ")}.`,
    });
  }
  if (allWords.length >= 150 && diversity < 0.6) {
    signals.push({
      id: "low_diversity",
      level: "info",
      title: "Limited vocabulary variety",
      detail: `Lexical diversity (MATTR) is ${round(diversity)}. Repeating the same words can make text feel generic.`,
    });
  }
  if (!english) {
    signals.push({
      id: "non_english",
      level: "info",
      title: "Phrase checks skipped",
      detail: "The text does not look like English, so English stock-phrase checks were not applied. Rhythm and repetition metrics still apply.",
    });
  }

  return {
    metrics: {
      words: allWords.length,
      sentences: sentenceData.length,
      avgSentenceLength: round(avg, 1),
      sentenceLengthVariation: round(cv),
      lexicalDiversity: round(diversity),
      stockPhraseCount: stockHits,
      englishChecksApplied: english,
    },
    signals,
    sentences: sentenceData.map(({ text: t, start, end, wordCount, flags }) => ({
      text: t,
      start,
      end,
      wordCount,
      flags,
    })),
  };
}
