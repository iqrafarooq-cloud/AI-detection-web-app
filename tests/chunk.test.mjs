import { test } from "node:test";
import assert from "node:assert/strict";
import { chunkText } from "@/lib/text/chunk";
import { groqMaxTokens } from "@/lib/services/rewrite/groq";

const rejoin = (chunks) => chunks.map((c) => c.text + c.sep).join("");

test("short text is a single chunk", () => {
  assert.deepEqual(chunkText("Hello there.", 100), [{ text: "Hello there.", sep: "" }]);
});

test("splits at paragraph boundaries, respects the limit and round-trips exactly", () => {
  const para = (n) => `Paragraph ${n} has a few sentences. It talks about things. It ends here.`;
  const text = Array.from({ length: 40 }, (_, i) => para(i)).join("\n\n");
  const chunks = chunkText(text, 500);
  assert.ok(chunks.length > 1);
  for (const c of chunks) assert.ok(c.text.length <= 500, `chunk of ${c.text.length}`);
  assert.equal(rejoin(chunks), text);
  // No paragraph is cut in half.
  for (const c of chunks) assert.match(c.text, /^Paragraph \d+/);
});

test("an oversized paragraph is split at sentence ends", () => {
  const text = Array.from({ length: 50 }, (_, i) => `Sentence number ${i} is right here.`).join(" ");
  const chunks = chunkText(text, 300);
  for (const c of chunks) {
    assert.ok(c.text.length <= 300);
    assert.match(c.text, /\.$/);
  }
  assert.equal(rejoin(chunks), text);
});

test("text with no sentence breaks falls back to word boundaries", () => {
  const text = "word ".repeat(400).trim();
  const chunks = chunkText(text, 120);
  for (const c of chunks) assert.ok(c.text.length <= 120 && !c.text.startsWith(" ") && !c.text.endsWith(" "));
  assert.equal(rejoin(chunks), text);
});

test("Groq output budget scales with input and stays under the free-tier request size", () => {
  const small = groqMaxTokens("x".repeat(400));
  const chunk = groqMaxTokens("x".repeat(5000 * 1.3 + 600)); // expanded step-2 input + instructions
  assert.ok(small < 2000);
  const promptTokens = Math.ceil((5000 * 1.3 + 600) / 3.5) + 800; // + system prompt
  assert.ok(promptTokens + chunk < 8000, `requested ${promptTokens + chunk}`);
  assert.equal(groqMaxTokens("x".repeat(200000)), 16000);
});
