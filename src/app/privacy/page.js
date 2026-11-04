import Prose from "@/components/layout/Prose";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <Prose>
      <h1>Privacy Policy</h1>
      <p className="text-sm">Last updated: November 3, 2026</p>

      <h2>Summary</h2>
      <ul>
        <li>Detectly has no accounts - every tool works without signing up.</li>
        <li>We do not store the text you analyze or improve.</li>
        <li>We do not use your text to train AI models, and we do not sell your data.</li>
        <li>We do not log the contents of your text.</li>
      </ul>

      <h2>Text you submit</h2>
      <p>
        <strong>AI detection</strong> runs on our own server with an open-source model (a RoBERTa-based detector), so text you analyse is not sent to any third party. If the site operator switches to a commercial detector (Sapling or GPTZero), text is sent to that provider instead. <strong>Writing improvement</strong> sends your text over an encrypted connection to a language-model provider (Groq or Anthropic), which processes it under its own terms and privacy policy. Detectly does not keep a copy once the response is returned.
      </p>
      <p>Uploaded PDF, Word and text files are read in memory to extract their text and are never written to disk or storage. Images (PNG, JPG, WebP) are read with OCR directly in your browser, so they never leave your device. The OCR engine itself is downloaded from a public CDN (jsDelivr) the first time you use it.</p>

      <h2>Security</h2>
      <p>
        API keys for AI providers are kept on the server and never sent to your browser. We apply rate limits to protect the service.
      </p>

      <h2>Cookies</h2>
      <p>We do not use cookies for tracking or advertising. Your theme choice and unsent drafts are kept only in your own browser.</p>
    </Prose>
  );
}
