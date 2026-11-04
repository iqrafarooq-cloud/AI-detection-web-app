import { AlertTriangle, Binary, ClipboardCheck, Layers, Scale, ShieldCheck, PenLine, Shuffle } from "lucide-react";
import { Card } from "@/components/ui";
import { CALIBRATION, DETECTOR_MODEL } from "@/lib/services/detection/local/model-config";
import { EVALUATION } from "@/lib/services/detection/local/evaluation-data";
import { GROUP_TOKENS, MAX_SCORED_TOKENS } from "@/lib/services/detection/local/detector";

export const metadata = {
  title: "How It Works",
  description: "How Detectly's AI detector works: the model, calibrated probabilities, the four possible results, mixed-text detection and measured accuracy on labeled data.",
};

const pct = (n, d = 1) => (typeof n === "number" ? `${(n * 100).toFixed(d)}%` : "-");

function Section({ id, icon: Icon, title, children }) {
  return (
    <section id={id} className="scroll-mt-24">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-violet-50 text-brand-600">
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

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-4 py-2.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-slate-100">
              {r.map((c, j) => (
                <td key={j} className={j === 0 ? "px-4 py-2.5 text-slate-800" : "px-4 py-2.5 text-slate-700"}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function HowItWorksPage() {
  const e = EVALUATION;
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <p className="text-sm font-semibold text-brand-600">How it works</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Every number, explained</h1>
      <p className="mt-4 max-w-3xl text-lg leading-relaxed text-slate-600">
        Detectly never invents or randomises scores. Every percentage comes from one open-source classification model running on our server, calibrated and tested on labeled human and AI texts. This page shows how, how well it works, and where it fails.
      </p>

      <Card className="mt-8 border-amber-200 bg-amber-50 p-5">
        <div className="flex gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm leading-relaxed text-amber-900">
            <p className="font-semibold">Accuracy disclaimer</p>
            <p className="mt-1">
              AI detection is probabilistic. A result describes how statistically similar a text is to the AI and human texts the model learned from - not what a person did. Every detector makes mistakes in both directions. Never use these results as the only evidence in academic, employment or legal decisions.
            </p>
          </div>
        </div>
      </Card>

      <nav aria-label="On this page" className="mt-8 flex flex-wrap gap-2 text-sm">
        {[
          ["#model", "The model"],
          ["#calibration", "Calibrated probabilities"],
          ["#results", "AI and Human %"],
          ["#mixed", "Sentence highlights"],
          ["#accuracy", "Measured accuracy"],
          ["#patterns", "Writing patterns"],
          ["#humanizer", "Humanizer"],
          ["#limits", "Limitations"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="rounded-full border border-slate-200 bg-white px-3 py-1 font-medium text-slate-700 hover:border-brand-300 hover:text-brand-700">
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-12 space-y-14">
        <Section id="model" icon={Binary} title="1. One classification model">
          <p>
            The detector is the{" "}
            <a className="font-medium text-brand-600 hover:underline" href={DETECTOR_MODEL.url} target="_blank" rel="noopener noreferrer">
              {DETECTOR_MODEL.name}
            </a>
            , a classifier trained specifically to tell human-written from AI-generated English text, trained on about 1.1 million texts from 2025-26 research datasets (MIT licence). We run it on our own server with ONNX Runtime, so your text is never sent to a third-party detector, and nothing you submit is stored.
          </p>
          {e?.baseline && (
            <>
              <p>
                It replaced a previous pipeline that reported the raw output of a different classifier with fixed cut-offs. Both are measured on the same {e.humanTexts} human and {e.aiTexts} AI test texts:
              </p>
              <Table
                head={["On the same test texts", "Before", "Now"]}
                rows={[
                  ["Accuracy", pct(e.baseline.overall.accuracyAll), pct(e.overall.accuracyAll)],
                  ["Human texts labeled AI (false positive rate)", pct(e.baseline.overall.fpr), pct(e.overall.fpr)],
                  ["AI texts labeled human (false negative rate)", pct(e.baseline.overall.fnr), pct(e.overall.fnr)],
                  ["Precision (AI verdicts that were really AI)", pct(e.baseline.overall.precision), pct(e.overall.precision)],
                  ["Recall (AI texts labeled AI)", pct(e.baseline.overall.recall), pct(e.overall.recall)],
                ]}
              />
              <p>The previous pipeline also gave no clear answer for {pct(1 - e.baseline.overall.coverage)} of texts; the current one always gives a verdict.</p>
            </>
          )}
        </Section>

        <Section id="calibration" icon={Scale} title="2. Calibrated probabilities">
          <p>
            A classifier&apos;s raw output is not a trustworthy probability: a raw &ldquo;97%&rdquo; does not mean that 97 out of 100 such texts are AI. So we never show raw scores. The text is split into small groups of whole sentences (up to {GROUP_TOKENS} tokens, a few sentences each) and the model reads every group once. The group scores are averaged by length and mapped to a calibrated probability:
          </p>
          <Formula>m = model logit margin (AI − human) &nbsp;&nbsp; L = ln(words / 100)</Formula>
          <Formula>P(AI) = sigmoid( w₁·m + w₀ + w₂·m·L {CALIBRATION?.params.features.length ? "+ Σ wᵢ·styleᵢ " : ""}) &nbsp;&nbsp; P(Human) = 1 − P(AI)</Formula>
          <p>
            The weights were fitted on {CALIBRATION ? CALIBRATION.samples.toLocaleString() : "-"} labeled texts ({CALIBRATION?.humanSamples ?? "-"} human, {CALIBRATION?.aiSamples ?? "-"} AI) that are never used for testing. The <code>m·L</code> term lets the data decide how much to trust the model at a given length, so short texts automatically get less extreme probabilities. The gauge in the report shows this probability.
          </p>
          <p>
            We also measured four linguistic features of every text: sentence-length variation, vocabulary diversity (MATTR), repeated sentence openings and punctuation variety. They were offered to the same fitted model, and kept only if they improved held-out results in cross-validation.{" "}
            {CALIBRATION?.params.features.length
              ? `They did, so the model uses: ${CALIBRATION.params.features.join(", ")}.`
              : "They did not add reliable evidence beyond the classifier, so the current model does not use them; the report still shows them as style context."}{" "}
            Grammar, formality and vocabulary level are never inputs: careful, well-structured writing is not evidence of AI.
          </p>
        </Section>

        <Section id="results" icon={ClipboardCheck} title="3. AI and Human percentages">
          <p>
            Each group of sentences gets its own calibrated probability (fitted on {CALIBRATION?.groups ? CALIBRATION.groups.samples.toLocaleString() : "-"} sentence groups from the labeled texts) and is called <strong>AI-generated</strong> at 50% or more, <strong>Human-written</strong> below. Because the probability is calibrated, 50% is the point where both answers are equally likely.
          </p>
          <p>
            The <strong>AI-generated %</strong> and <strong>Human-written %</strong> in the report are the share of the analyzed words in AI and in human groups, so they always add up to exactly 100%. The verdict follows the larger share: <strong>Likely AI-Generated</strong> when at least half of the text reads as AI, otherwise <strong>Likely Human-Written</strong>.
          </p>
          <p>
            <strong>Confidence</strong> is the calibrated probability of the whole text agreeing with the verdict: High at 85% or more, Medium from 70%, Low below that. Texts under 60 words always get Low confidence and texts under 150 words never get High, because short texts carry little evidence.
          </p>
        </Section>

        <Section id="mixed" icon={Shuffle} title="4. Sentence highlights">
          <p>
            Every sentence is highlighted in the color of its group: red for AI-generated, green for human-written. A single sentence carries too little evidence to be judged on its own, so labels apply to groups of a few neighbouring sentences (up to {GROUP_TOKENS} tokens). Select a sentence to see its group&apos;s AI likelihood, signal strength and style indicators.
          </p>
          <p>
            The model is large, so long texts are scored on evenly spaced groups within a budget of about {MAX_SCORED_TOKENS.toLocaleString()} tokens to keep results fast; the report says when this happened and how many words were analyzed, and unscored sentences are left unhighlighted.
          </p>
        </Section>

        <Section id="accuracy" icon={Layers} title="5. Measured accuracy">
          {e ? (
            <>
              <p>
                Measured on {e.testTexts.toLocaleString()} labeled texts ({e.humanTexts} human, {e.aiTexts} AI) and {e.mixedTexts} mixed documents that were <strong>not</strong> used for calibration, by running each one through the same code as the Detector page ({e.evaluatedAt}). The texts come from the MAGE research benchmark (news, essays, reviews, Reddit, stories, science and more, plus paraphrased AI text), from GPT-4, Claude 3 Opus, Llama 3 and Command R+ answers paired with human texts on the same topic, from samples written by Claude for this test, and from human texts whose spelling and grammar were corrected by an AI.
              </p>
              <Table
                head={["Metric", "Value"]}
                rows={[
                  ["Accuracy", pct(e.overall.accuracyAll)],
                  ["False positive rate (human texts labeled AI)", pct(e.overall.fpr)],
                  ["False negative rate (AI texts labeled human)", pct(e.overall.fnr)],
                  ["Precision (AI verdicts that were really AI)", pct(e.overall.precision)],
                  ["Recall (AI texts labeled AI)", pct(e.overall.recall)],
                  ["F1 score", pct(e.overall.f1)],
                  ["Calibration error (expected, 10 bins)", pct(e.calibration.ece)],
                ]}
              />
              <p className="font-medium text-slate-800">By length</p>
              <Table
                head={["Length", "Accuracy", "Humans labeled AI", "AI labeled human"]}
                rows={[
                  ["short", "20-59 words"],
                  ["medium", "60-249 words"],
                  ["long", "250+ words"],
                ]
                  .filter(([k]) => e.byLength[k])
                  .map(([k, label]) => [label, pct(e.byLength[k].accuracyAll), pct(e.byLength[k].fpr), pct(e.byLength[k].fnr)])}
              />
              {e.byWritingType && (
                <>
                  <p className="font-medium text-slate-800">Human texts labeled AI, by writing type</p>
                  <Table
                    head={["Writing type", "Human texts", "Labeled AI"]}
                    rows={Object.entries(e.byWritingType)
                      .filter(([, m]) => m.humans > 0)
                      .map(([type, m]) => [type, m.humans, pct(m.fpr)])}
                  />
                </>
              )}
              {e.content && (
                <>
                  <p className="font-medium text-slate-800">Content breakdown on texts of known origin</p>
                  <Table
                    head={["Texts", "AI-generated", "Human-written"]}
                    rows={[
                      ["Human-written", pct(e.content.humanDocs.aiContent), pct(e.content.humanDocs.humanContent)],
                      ["AI-generated", pct(e.content.aiDocs.aiContent), pct(e.content.aiDocs.humanContent)],
                    ]}
                  />
                </>
              )}
              {e.mixed && !("ai" in e.mixed) && Object.keys(e.mixed).length > 0 && (
                <>
                  <p className="font-medium text-slate-800">Mixed documents at a known AI share</p>
                  <Table
                    head={["True AI share", "Documents", "Estimated AI content", "Average error", "Verdict AI"]}
                    rows={Object.entries(e.mixed).map(([share, m]) => [share, m.n, pct(m.estimatedAi), pct(m.mae), pct(m.verdictAi)])}
                  />
                </>
              )}
              <p>
                The full report, broken down by domain and AI model, is in <code>docs/detector-evaluation.md</code> in the source code.
              </p>
            </>
          ) : (
            <p>The evaluation has not been run on this build yet.</p>
          )}
        </Section>

        <Section id="patterns" icon={ShieldCheck} title="6. Writing-pattern analysis">
          <p>
            Separately, transparent rules flag formulaic stock phrases, repeated sentence openings, repeated phrases, very long sentences, uniform rhythm and low vocabulary variety. Every flag comes with a plain-language reason. These describe <strong>style</strong>, not authorship, and they never affect the AI result.
          </p>
        </Section>

        <Section id="humanizer" icon={PenLine} title="7. Humanizer: two-step pipeline + re-check">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              <strong>Restructure.</strong> A language model rebuilds sentence structure: it joins choppy sentences, splits overloaded ones, varies openings, prefers active voice and removes filler and stock phrases.
            </li>
            <li>
              <strong>Refine.</strong> A second pass applies your chosen style, tone and level, with natural rhythm, concrete verbs and natural transitions.
            </li>
            <li>
              <strong>Verify facts.</strong> Every number, citation, URL, email and DOI from your original is checked in the result, and anything missing is flagged.
            </li>
            <li>
              <strong>Re-check.</strong> Both versions are scored by the same calibrated detector, and you see the honest before and after, whatever it is.
            </li>
          </ol>
          <p>
            We do not add deliberate typos, odd words or invisible characters, and we do not loop until a detector is fooled. AI-rewritten text is still AI text. Real authorship comes from rewriting in your own words, with your own ideas and examples.
          </p>
        </Section>

        <Section id="limits" icon={AlertTriangle} title="8. Limitations">
          <ul className="list-disc space-y-2 pl-5">
            <li><strong>Forced verdicts are wrong more often.</strong> Every text gets a verdict, so close calls are labeled too. In our test {e ? pct(e.overall.fpr) : "-"} of human texts were labeled AI and {e ? pct(e.overall.fnr) : "-"} of AI texts were labeled human. Look at the confidence: Low-confidence verdicts are close to a coin toss.</li>
            <li><strong>Short texts.</strong> At least 20 words are needed for any result, and below 60 words confidence is always Low.</li>
            <li><strong>English only.</strong> The model was trained and calibrated on English. For other languages the result is shown with Low confidence and a warning.</li>
            <li><strong>Student essays.</strong> Formal argumentative essays are the human writing most often mistaken for AI in our test ({e?.byWritingType?.["academic essay"] ? pct(e.byWritingType["academic essay"].fpr) : "-"} of them).</li>
            <li><strong>Newest models and paraphrases.</strong> Text from the newest AI models and AI paraphrases of human writing are often labeled human.</li>
            <li><strong>Sentence labels are group labels.</strong> Highlights come from groups of a few sentences, so one AI sentence inside human writing (or the reverse) is usually not singled out.</li>
            <li><strong>Untested sources.</strong> We had no verified Gemini texts to test with, and human texts edited by hand after AI generation were not part of the test set. The grammar-corrected sample is small.</li>
            <li><strong>New models.</strong> Detectors lag behind the newest language models and need re-checking as new ones appear.</li>
            <li><strong>Uploads.</strong> Text from images is read with OCR and may contain recognition errors, so check it before analysing.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
