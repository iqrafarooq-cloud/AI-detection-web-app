// Deterministic clean-up that keeps a rewrite's typography consistent with the
// original: models sometimes emit "42 %", non-breaking hyphens or curly quotes
// even when the author used none. Nothing here changes wording.

const SPACE_BEFORE_PERCENT = /(\d)[   ]+%/g;

export function matchTypography(original, improved) {
  let out = improved;
  if (!SPACE_BEFORE_PERCENT.test(original)) out = out.replace(SPACE_BEFORE_PERCENT, "$1%");
  SPACE_BEFORE_PERCENT.lastIndex = 0;
  // Non-breaking / figure hyphens -> plain hyphen.
  if (!/[‐‑‒]/.test(original)) out = out.replace(/[‐‑‒]/g, "-");
  // Narrow/non-breaking spaces -> normal spaces.
  if (!/[  ]/.test(original)) out = out.replace(/[  ]/g, " ");
  // Curly quotes -> straight quotes when the original only used straight ones.
  if (!/[‘’]/.test(original)) out = out.replace(/[‘’]/g, "'");
  if (!/[“”]/.test(original)) out = out.replace(/[“”]/g, '"');
  // Em dashes are not used in this product's house style unless the author used them.
  if (!/—/.test(original)) out = out.replace(/\s*—\s*/g, " - ");
  return out;
}
