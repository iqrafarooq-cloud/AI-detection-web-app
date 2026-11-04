import Prose from "@/components/layout/Prose";

export const metadata = { title: "About" };

export default function AboutPage() {
  return (
    <Prose>
      <h1>About Detectly AI</h1>
      <p>
        Detectly AI is a free writing assistant with two jobs: help you understand how a text reads, and help you make it clearer and more natural - without changing what it says.
      </p>

      <h2>How the analysis works</h2>
      <p>The AI Text Detector combines two clearly separated parts:</p>
      <ul>
        <li>
          <strong>AI-detection estimate.</strong> By default, an open-source RoBERTa-based detector runs on our own server, and its scores are calibrated on labeled human and AI texts so the percentages mean what they say. When the evidence is weak, we answer Inconclusive. The site operator can switch to a commercial provider (Sapling or GPTZero) instead, whose scores are shown as reported. Either way, we explain exactly how the result was derived. See <a href="/how-it-works">How it works</a>.
        </li>
        <li>
          <strong>Writing-pattern analysis.</strong> Transparent rules computed by Detectly: formulaic stock phrases, repeated sentence openings, repeated phrasing, very long sentences, sentence-rhythm variation and vocabulary variety. These describe style. They are not an AI detector.
        </li>
      </ul>

      <h2>Our principles</h2>
      <ul>
        <li>We never invent, randomize or &ldquo;estimate&rdquo; detection scores ourselves.</li>
        <li>AI detection is probabilistic. No detector can prove authorship, and results can be wrong in both directions - especially for short texts, non-native writers and heavily edited text.</li>
        <li>Good grammar is not evidence of AI use.</li>
        <li>The rewriting model is never used as a detector, and detection never uses the rewriting model.</li>
        <li>The Humanizer aims for authentic, high-quality writing. It does not add deliberate errors or tricks to manipulate detectors.</li>
      </ul>

      <h2>Limitations</h2>
      <p>
        Detection accuracy depends on the configured provider and drops for short passages (under roughly 150 words), mixed human/AI text, translations and creative writing. The Humanizer can occasionally rephrase a detail; we automatically check numbers, citations and links after every edit and warn you if anything is missing, but please review important text before using it.
      </p>
      <p>
        Free access is subject to fair-use rate limits and to the usage limits of the AI providers the operator has configured.
      </p>
    </Prose>
  );
}
