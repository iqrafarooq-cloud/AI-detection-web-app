/**
 * Splits text into chunks of at most `maxChars`, preferring paragraph
 * boundaries, then sentence boundaries, then word boundaries. Each chunk keeps
 * the separator that followed it in the original (`sep`), so
 * chunks.map(c => c.text + c.sep).join("") reproduces the input exactly.
 */
export function chunkText(text, maxChars) {
  if (text.length <= maxChars) return [{ text, sep: "" }];

  // Paragraph units with their trailing blank-line separators.
  const units = [];
  const re = /\n\s*\n/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    units.push({ text: text.slice(last, m.index), sep: m[0] });
    last = m.index + m[0].length;
  }
  units.push({ text: text.slice(last), sep: "" });

  const pieces = units.flatMap((u) => (u.text.length <= maxChars ? [u] : splitLong(u, maxChars)));

  // Greedily pack consecutive pieces into chunks.
  const chunks = [];
  let cur = null;
  for (const p of pieces) {
    if (cur && cur.text.length + cur.sep.length + p.text.length <= maxChars) {
      cur.text += cur.sep + p.text;
      cur.sep = p.sep;
    } else {
      if (cur) chunks.push(cur);
      cur = { text: p.text, sep: p.sep };
    }
  }
  if (cur) chunks.push(cur);
  return chunks.filter((c) => c.text.trim() || c.sep);
}

/** Splits one oversized paragraph at sentence ends, or at spaces as a last resort. */
function splitLong(unit, maxChars) {
  const out = [];
  let rest = unit.text;
  while (rest.length > maxChars) {
    const window = rest.slice(0, maxChars);
    let cut = -1;
    const sentenceEnd = /[.!?…]["')\]]*\s+/g;
    let s;
    while ((s = sentenceEnd.exec(window))) cut = s.index + s[0].length;
    if (cut < maxChars * 0.4) cut = window.lastIndexOf(" ") + 1;
    if (cut <= 0) cut = maxChars;
    const head = rest.slice(0, cut);
    const trimmed = head.trimEnd();
    out.push({ text: trimmed, sep: head.slice(trimmed.length) });
    rest = rest.slice(cut);
  }
  out.push({ text: rest, sep: unit.sep });
  return out;
}
