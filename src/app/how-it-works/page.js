import Link from "next/link";
import { AlertTriangle, Binary, Layers, LineChart, ScanSearch, ShieldCheck, PenLine } from "lucide-react";
import { Card } from "@/components/ui";

export const metadata = {
  title: "How It Works",
  description: "Exactly how Detectly calculates AI probability, perplexity, burstiness and sentence highlights - and how the humanizer pipeline and re-check work.",
};

// Results measured while building Detectly, with the production settings.
// Human samples are public-domain or pre-2020 texts; AI samples were generated
// fresh by an open-weight model (gpt-oss-120b) in three different styles.
const EVAL = [
  { sample: "Sherlock Holmes (1892)", truth: "Human", score: "2.7%", ok: true },
  { sample: "Moby-Dick (1851)", truth: "Human", score: "2.7%", ok: true },
  { sample: "Wikipedia article (2015)", truth: "Human", score: "1.9%", ok: true },
  { sample: "Pride and Prejudice (1813)", truth: "Human", score: "87.5%", ok: false },
  { sample: "AI school essay", truth: "AI", score: "98.6%", ok: true },
  { sample: "AI casual Reddit-style post", truth: "AI", score: "97.3%", ok: true },
  { sample: "AI local news paragraph", truth: "AI", score: "98.7%", ok: true },
];

function Section({ id, icon: Icon, title, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-violet-50 text-brand-600">
          <Icon className="size-5" aria-hidden />
        </span>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h2>
      </div>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-slate-600 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13px] [&_code]:text-slate-800 [&_strong]:text-slate-800">
        {children}
      </div>
    </section>
  );
}

function Formula({ children }) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-sm text-slate-800">{children}</div>;
}

export default function HowItWorksPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold text-brand-600">How it works</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Every number, explained</h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
        Detectly never invents or randomises scores. Every percentage comes from an open-source model running on our server, and this page shows exactly how it is calculated, how well it works and where it fails.
      </p>

      <Card className="mt-8 border-amber-200 bg-amber-50 p-5">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-semibold">Accuracy disclaimer</p>
            <p className="mt-1">
              AI detection is probabilistic. A high score means the text is statistically similar to AI-generated text the model has seen - not that a person used AI. Detectors make mistakes in both directions, and our own testing (below) includes a famous 1813 novel scored as 87.5% AI. Never use these results as the only evidence in academic, employment or legal decisions.
            </p>
          </div>
        </div>
      </Card>

      <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-2 text-sm">
        {[
          ["#probability", "AI probability"],
          ["#chunks", "Long texts"],
          ["#sentences", "Sentence highlights"],
          ["#perplexity", "Perplexity & burstiness"],
          ["#patterns", "Writing patterns"],
          ["#humanizer", "Humanizer pipeline"],
          ["#testing", "Our test results"],
          ["#limits", "Limitations"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700">
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-12 space-y-14">
        <Section id="probability" icon={Binary} title="1. AI probability from model logits">
          <p>
            The detector is <strong>TMR AI Text Detector</strong>, a RoBERTa-base classifier (125M parameters, MIT licence) trained on the{" "}
            <a className="font-medium text-brand-600 hover:underline" href="https://raid-bench.xyz" target="_blank" rel="noopener noreferrer">RAID benchmark</a>{" "}
            (ACL 2024): text from many modern language models across news, books, abstracts, reviews, Reddit, poetry and more, including adversarial attacks such as paraphrasing. Its author reports <strong>99.28% AUROC</strong> on the RAID leaderboard and a 2.6% false-positive rate on held-out data. We run it locally with ONNX Runtime, so your text is not sent to a third-party detector.
          </p>
          <p>For each input the model outputs two raw scores (logits): one for &ldquo;human&rdquo; and one for &ldquo;AI&rdquo;. We convert them into a probability with the softmax function:</p>
          <Formula>P(AI) = e^(logit_AI) / ( e^(logit_human) + e^(logit_AI) )</Formula>
          <p>
            That number is shown exactly as computed, and you can open <em>Model details &amp; chunk breakdown</em> in any report to see the raw logits. The verdict uses fixed bands: <code>≥ 65%</code> likely AI, <code>≤ 35%</code> likely human, anything between is <strong>uncertain</strong>.
          </p>
        </Section>

        <Section id="chunks" icon={Layers} title="2. Long texts: chunking, not truncation">
          <p>
            The model reads at most 512 tokens at a time. Instead of cutting your text off, we split it into chunks of whole sentences of up to <strong>256 tokens</strong>, score every chunk, and combine them weighted by length:
          </p>
          <Formula>P(document) = Σ P(chunk_i) × tokens_i / Σ tokens_i</Formula>
          <p>
            We chose 256 tokens by measurement: with full 512-token windows, a document that <em>starts</em> with AI text and continues with human text scored only 4.5% overall, and the AI part was missed completely. With 256-token chunks both parts were found. A document is labelled <strong>mixed</strong> when one chunk scores 80% or more and another 20% or less.
          </p>
        </Section>

        <Section id="sentences" icon={ScanSearch} title="3. Sentence highlights">
          <p>
            Single sentences are far too short for any detector to judge reliably. Each sentence is therefore scored <strong>together with up to two sentences on either side</strong>, and it is only highlighted when two conditions hold:
          </p>
          <Formula>highlight = P(sentence ± 2 neighbours) ≥ 50%  AND  P(its chunk) ≥ 50%</Formula>
          <p>
            The second condition means sentence highlights can never contradict the chunk they sit in. In our tests it removed every false highlight on purely human texts, which a naive per-sentence approach flagged heavily. The <strong>AI share</strong> is the percentage of words that sit in highlighted sentences.
          </p>
        </Section>

        <Section id="perplexity" icon={LineChart} title="4. Perplexity & burstiness">
          <p>
            We also run <strong>GPT-2</strong> locally and measure how predictable each sentence is. For a sentence with tokens t₁…tₙ:
          </p>
          <Formula>perplexity = exp( −(1/n) Σ log P(tᵢ | t₁ … tᵢ₋₁) )</Formula>
          <p>
            <strong>Burstiness</strong> is the standard deviation of sentence perplexities. Human writing tends to swing between predictable and surprising sentences, while AI text is often uniformly predictable. In our tests an AI essay had perplexity 37 and burstiness 30, and human novels scored around 100-120 and 500-1000.
          </p>
          <p>
            These two metrics are <strong>shown as supporting evidence only</strong>. They are not mixed into the AI probability, because on their own they are easy to fool and vary a lot with topic and genre (our AI-written casual post had perplexity 115).
          </p>
        </Section>

        <Section id="patterns" icon={ShieldCheck} title="5. Writing-pattern analysis">
          <p>
            Separately, transparent rules flag formulaic stock phrases, repeated sentence openings, repeated phrases, very long sentences, uniform rhythm and low vocabulary variety. Every flag comes with a plain-language reason. These describe <strong>style</strong>, not authorship, and they never produce an AI percentage.
          </p>
        </Section>

        <Section id="humanizer" icon={PenLine} title="6. Humanizer: two-step pipeline + re-check">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Restructure.</strong> A language model rebuilds sentence structure: it joins choppy sentences, splits overloaded ones, varies openings, prefers active voice and removes filler and stock phrases. It changes structure, not just words.
            </li>
            <li>
              <strong>Refine.</strong> A second pass applies your chosen style, tone and level, with natural rhythm (a mix of short and long sentences), concrete verbs and natural transitions.
            </li>
            <li>
              <strong>Verify facts.</strong> Every number, citation, URL, email and DOI from your original is checked in the result, and anything missing is flagged. Typography (such as <code>42%</code> or plain hyphens) is matched to yours.
            </li>
            <li>
              <strong>Re-check.</strong> Both versions are scored by the same detector, and you see the honest before and after, whatever it is.
            </li>
          </ol>
          <p>
            We do not add deliberate typos, odd words or invisible characters, and we do not loop until a detector is fooled. In our tests the AI probability usually changed very little after rewriting (for example 98.6% → 97.0%). That is expected: AI-rewritten text is still AI text, and RAID-trained detectors are built to see through paraphrasing. Real authorship comes from rewriting in your own words, with your own ideas and examples.
          </p>
        </Section>

        <Section id="testing" icon={ScanSearch} title="7. Our own test results">
          <p>Measured with the production settings. The human texts were written long before modern AI. The AI texts were generated fresh in three styles.</p>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Sample</th>
                  <th className="px-4 py-2.5 font-medium">Actually written by</th>
                  <th className="px-4 py-2.5 font-medium">AI probability</th>
                  <th className="px-4 py-2.5 font-medium">Correct?</th>
                </tr>
              </thead>
              <tbody>
                {EVAL.map((r) => (
                  <tr key={r.sample} className="border-t border-slate-100">
                    <td className="px-4 py-2.5 text-slate-800">{r.sample}</td>
                    <td className="px-4 py-2.5">{r.truth}</td>
                    <td className="px-4 py-2.5 font-semibold tabular-nums text-slate-900">{r.score}</td>
                    <td className={r.ok ? "px-4 py-2.5 text-emerald-600" : "px-4 py-2.5 font-semibold text-red-600"}>{r.ok ? "Yes" : "No - false positive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            A seven-sample check is not a benchmark, but it shows the point: the model is usually right, and sometimes confidently wrong. Very well-known classic texts are a known weak spot for many detectors.
          </p>
        </Section>

        <Section id="limits" icon={AlertTriangle} title="8. Limitations">
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Best on English.</strong> The model was trained mostly on English. Other languages still get a score, shown with a caution note because it is less reliable.</li>
            <li><strong>At least 40 words.</strong> Short texts are refused, and results are more reliable above roughly 150 words.</li>
            <li><strong>Mixed documents.</strong> Short human passages sandwiched between AI passages can be highlighted as AI.</li>
            <li><strong>Domain shift.</strong> Casual chat, poetry, code, lists, non-native writing and heavily edited text are harder and produce more errors.</li>
            <li><strong>New models.</strong> Detectors lag behind the newest language models.</li>
            <li><strong>Uploads.</strong> Text from images is read with OCR and may contain recognition errors, so check it before analysing.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
