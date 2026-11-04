// Builds the labeled evaluation set for the AI detector.
//
//   node scripts/eval/build-dataset.mjs
//
// Sources (downloaded at build time, never committed):
//   - MAGE test split (yaful/MAGE, Li et al., ACL 2024): human and machine text
//     from 10 domains and 27 language models. Not used to train any detector
//     we evaluate.
//   - artnitolog/llm-generated-texts: one human text and answers from GPT-4
//     Turbo, GPT-4o, Claude 3 Opus, Llama 3 70B and Command R+ for the same
//     prompt (essays, Reuters news, writing-prompt stories). Also used to build
//     mixed human + AI documents on the same topic.
//   - scripts/eval/claude-samples.json: texts written by Claude (an AI model)
//     for this evaluation, incl. AI paraphrases of human text. Labeled "ai".
//   - scripts/eval/grammar-corrected-samples.json: human test texts after an
//     AI fixed only spelling, punctuation and grammar (wording unchanged).
//     Labeled "human": the writing is still the person's own.
//
// Every document is assigned to the "calibration" or "test" split by a hash of
// its source id, so a prompt's human and AI texts never straddle the splits.
// Calibration data is used only to fit probability calibration and the
// decision thresholds; all reported metrics come from the test split.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const OUT = path.join(process.cwd(), ".cache", "eval", "dataset.json");
const RAW = path.join(process.cwd(), ".cache", "eval", "raw");
const ROWS = "https://datasets-server.huggingface.co/rows";
const MAGE_PER_LABEL = 400;
const ARTNITOLOG_PROMPTS = 240; // human + AI pairs
const ARTNITOLOG_MIXED = 75; // 15 documents at each AI share below
const MIXED_SHARES = [0.1, 0.3, 0.5, 0.7, 0.9];
const MIXED_WORDS = 320;
const AI_COLUMNS = ["GPT4 Turbo 2024-04-09", "GPT4 Omni", "Claude 3 Opus", "Llama3 70B", "Command R+"];

const words = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const hash = (s) => crypto.createHash("sha256").update(s).digest();
const splitOf = (id) => (hash(id)[0] % 2 === 0 ? "calibration" : "test");
const lengthBucket = (n) => (n < 60 ? "short" : n < 250 ? "medium" : "long");

// Deterministic PRNG so the dataset is reproducible.
let seed = 1234567;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

async function fetchRows(dataset, offset, length, split = "train") {
  const url = `${ROWS}?dataset=${encodeURIComponent(dataset)}&config=default&split=${split}&offset=${offset}&length=${length}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(url);
    if (res.ok) return (await res.json()).rows.map((r) => r.row);
    await new Promise((r) => setTimeout(r, 10000 * (attempt + 1)));
  }
  throw new Error(`Failed to fetch ${url}`);
}

function clean(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Keeps whole sentences up to roughly maxWords. */
function truncateWords(text, maxWords) {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*/g) || [text];
  let out = "";
  for (const s of sentences) {
    if (words(out + s) > maxWords && words(out) >= 20) break;
    out += s;
  }
  return out.trim();
}

function paragraphs(text) {
  return text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
}

const MAGE_FILES = {
  test: "test.csv",
  gpt4: "test_ood_set_gpt.csv",
  para: "test_ood_set_gpt_para.csv",
};

/** Minimal RFC 4180 CSV parser (quoted fields, escaped quotes, newlines in fields). */
function parseCsv(textIn) {
  const text = textIn.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') (field += '"'), i++;
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") row.push(field), (field = "");
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field), rows.push(row), (row = []), (field = "");
    } else field += c;
  }
  if (field || row.length) row.push(field), rows.push(row);
  const [header, ...body] = rows;
  return body.filter((r) => r.length === header.length).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

async function loadMage(name) {
  const file = path.join(RAW, MAGE_FILES[name]);
  if (!fs.existsSync(file)) {
    const res = await fetch(`https://huggingface.co/datasets/yaful/MAGE/resolve/main/${MAGE_FILES[name]}`);
    if (!res.ok) throw new Error(`Failed to download MAGE ${name}: HTTP ${res.status}`);
    fs.mkdirSync(RAW, { recursive: true });
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  }
  return parseCsv(fs.readFileSync(file, "utf8"));
}

/** "xsum_machine_continuation_gpt-3.5-trubo" -> "gpt-3.5-turbo"; "cnn_human_para" -> "GPT paraphrase of human text". */
function mageGenerator(src) {
  if (src.endsWith("_human_para")) return "GPT paraphrase of human text";
  if (src.endsWith("_gpt4_para")) return "GPT paraphrase of GPT-4 text";
  return src
    .replace(/^[^_]+_/, "")
    .replace(/^(gen_)?machine_(continuation|topical|specified)_/, "")
    .replace("trubo", "turbo");
}

function mageSample(rows, { perLabel, perDomainCap, category, labelOf = (r) => (r.label === "1" ? "human" : "ai"), filter = () => true }) {
  const out = [];
  const counts = { human: 0, ai: 0 };
  const perDomain = {};
  for (const r of [...rows].sort(() => rand() - 0.5)) {
    if (!filter(r)) continue;
    const label = labelOf(r);
    const text = clean(r.text);
    const n = words(text);
    if (n < 20 || n > 1500 || counts[label] >= perLabel) continue;
    const domain = r.src.split("_")[0];
    const key = `${domain}:${label}`;
    if ((perDomain[key] || 0) >= perDomainCap) continue;
    perDomain[key] = (perDomain[key] || 0) + 1;
    counts[label]++;
    const id = `mage:${hash(text).toString("hex").slice(0, 16)}`;
    out.push({
      id,
      text,
      label,
      source: "MAGE",
      domain,
      generator: label === "ai" ? mageGenerator(r.src) : null,
      category: typeof category === "function" ? category(r) : category,
      words: n,
      length: lengthBucket(n),
      split: splitOf(id),
    });
    if (counts.human >= perLabel && counts.ai >= perLabel) break;
  }
  return out;
}

async function mage() {
  const test = mageSample(await loadMage("test"), { perLabel: MAGE_PER_LABEL, perDomainCap: 45, category: "natural" });
  // Unseen generator: GPT-4 on CNN news, dialogue summaries, IMDB reviews, PubMed, etc.
  const gpt4 = mageSample(await loadMage("gpt4"), { perLabel: 100, perDomainCap: 25, category: (r) => (r.label === "1" ? "natural" : "gpt-4-unseen") });
  // Paraphrased by GPT: both human text and GPT-4 text rewritten by an AI.
  // MAGE labels both as machine text, and so do we.
  const para = mageSample(await loadMage("para"), {
    perLabel: 100,
    perDomainCap: 25,
    filter: (r) => r.label === "0",
    labelOf: () => "ai",
    category: (r) => (r.src.includes("human_para") ? "ai-paraphrase-of-human" : "ai-paraphrase-of-ai"),
  });
  const all = [...test, ...gpt4, ...para];
  console.log(`MAGE: ${all.length} samples (${all.filter((s) => s.label === "human").length} human, ${all.filter((s) => s.label === "ai").length} AI)`);
  return all;
}

async function artnitolog() {
  const all = [];
  const cache = path.join(RAW, "artnitolog.json");
  if (fs.existsSync(cache)) all.push(...JSON.parse(fs.readFileSync(cache, "utf8")));
  else {
    for (let offset = 0; offset < 3000; offset += 100) {
      all.push(...(await fetchRows("artnitolog/llm-generated-texts", offset, 100)));
      await new Promise((r) => setTimeout(r, 1500)); // stay under the rows API rate limit
    }
    fs.mkdirSync(RAW, { recursive: true });
    fs.writeFileSync(cache, JSON.stringify(all));
  }
  const usable = all.filter((r) => words(clean(r.human)) >= 40);
  const shuffled = usable.sort(() => rand() - 0.5);
  const pairs = shuffled.slice(0, ARTNITOLOG_PROMPTS);
  const mixedRows = shuffled.slice(ARTNITOLOG_PROMPTS, ARTNITOLOG_PROMPTS + ARTNITOLOG_MIXED * 6);

  const out = [];
  pairs.forEach((r, i) => {
    const id = `artnitolog:${r.dataset_name}:${r.id}`;
    const split = splitOf(id);
    const column = AI_COLUMNS[i % AI_COLUMNS.length];
    const human = clean(r.human);
    const ai = clean(r[column]);
    out.push({ id: `${id}:human`, text: human, label: "human", source: "artnitolog", domain: r.dataset_name, generator: null, category: "natural", words: words(human), length: lengthBucket(words(human)), split });
    if (words(ai) >= 20) {
      out.push({ id: `${id}:ai`, text: ai, label: "ai", source: "artnitolog", domain: r.dataset_name, generator: column, category: "natural", words: words(ai), length: lengthBucket(words(ai)), split });
    }
    // Short versions of the same texts (first sentences, 20-60 words).
    if (i % 3 === 0) {
      for (const [label, text, generator] of [["human", human, null], ["ai", ai, column]]) {
        const short = truncateWords(text, 50);
        if (words(short) >= 20 && words(short) < 60) {
          out.push({ id: `${id}:${label}:short`, text: short, label, source: "artnitolog", domain: r.dataset_name, generator, category: "short-excerpt", words: words(short), length: "short", split });
        }
      }
    }
  });

  // Mixed documents: human and AI paragraphs answering the same prompt,
  // joined at a known AI share of the words (10% to 90%). Test split only.
  let made = 0;
  for (const r of mixedRows) {
    if (made >= ARTNITOLOG_MIXED) break;
    const column = AI_COLUMNS[made % AI_COLUMNS.length];
    const share = MIXED_SHARES[made % MIXED_SHARES.length];
    const hp = paragraphs(clean(r.human)).join("\n\n");
    const ap = paragraphs(clean(r[column])).join("\n\n");
    const humanPart = truncateWords(hp, Math.round(MIXED_WORDS * (1 - share)));
    const aiPart = truncateWords(ap, Math.round(MIXED_WORDS * share));
    if (words(humanPart) < 20 || words(aiPart) < 20) continue;
    const aiWordShare = words(aiPart) / (words(aiPart) + words(humanPart));
    if (Math.abs(aiWordShare - share) > 0.1) continue; // not enough text to hit the target share
    const aiFirst = Math.floor(made / MIXED_SHARES.length) % 2 === 1;
    const text = aiFirst ? `${aiPart}\n\n${humanPart}` : `${humanPart}\n\n${aiPart}`;
    const id = `artnitolog:${r.dataset_name}:${r.id}:mixed`;
    out.push({
      id,
      text,
      label: "mixed",
      source: "artnitolog",
      domain: r.dataset_name,
      generator: column,
      category: aiFirst ? "mixed-ai-first" : "mixed-human-first",
      targetAiShare: share,
      aiWordShare,
      words: words(text),
      length: lengthBucket(words(text)),
      split: "test",
    });
    made++;
  }
  console.log(`artnitolog: ${out.filter((s) => s.label !== "mixed").length} labeled texts, ${made} mixed documents`);
  return out;
}

function claudeSamples() {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "claude-samples.json");
  const samples = JSON.parse(fs.readFileSync(file, "utf8"));
  return samples.map((s, i) => {
    const text = clean(s.text);
    return {
      id: `claude:${i}`,
      text,
      label: "ai",
      source: "claude-samples",
      domain: s.domain,
      generator: s.generator,
      category: s.category,
      words: words(text),
      length: lengthBucket(words(text)),
      split: "test",
    };
  });
}

function grammarCorrected(base) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), "grammar-corrected-samples.json");
  const byId = new Map(base.map((s) => [s.id, s]));
  return JSON.parse(fs.readFileSync(file, "utf8")).map((s) => {
    const source = byId.get(s.sourceId);
    if (!source || source.split !== "test" || source.label !== "human") throw new Error(`${s.sourceId} is not a human test text`);
    const text = clean(s.text);
    return {
      id: `${s.sourceId}:grammar-corrected`,
      text,
      label: "human",
      source: "grammar-corrected",
      domain: s.domain,
      generator: null,
      category: "human-ai-grammar-corrected",
      words: words(text),
      length: lengthBucket(words(text)),
      split: "test",
    };
  });
}

const base = [...(await mage()), ...(await artnitolog())];
const dataset = [...base, ...claudeSamples(), ...grammarCorrected(base)];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(dataset));
const summary = {};
for (const s of dataset) {
  const k = `${s.split} ${s.label}`;
  summary[k] = (summary[k] || 0) + 1;
}
console.log(`Wrote ${dataset.length} samples to ${OUT}`);
console.table(summary);
