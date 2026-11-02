import Prose from "@/components/layout/Prose";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <Prose>
      <h1>Privacy Policy</h1>
      <p className="text-sm">Last updated: November 2, 2026</p>

      <h2>Summary</h2>
      <ul>
        <li>You can use Detectly without an account.</li>
        <li>We do not store the text you analyze or improve unless you sign in and explicitly opt in to saving history.</li>
        <li>We do not use your text to train AI models, and we do not sell your data.</li>
        <li>We do not log the contents of your text.</li>
      </ul>

      <h2>Text you submit</h2>
      <p>
        <strong>AI detection</strong> runs on our own server with open-source models (a RoBERTa detector and GPT-2), so text you analyse is not sent to any third party. If the site operator switches to a commercial detector (Sapling or GPTZero), text is sent to that provider instead. <strong>Writing improvement</strong> sends your text over an encrypted connection to a language-model provider (Groq or Anthropic), which processes it under its own terms and privacy policy. Detectly does not keep a copy once the response is returned.
      </p>
      <p>Uploaded PDF, Word and text files are read in memory to extract their text and are never written to disk or storage. Images (PNG, JPG, WebP) are read with OCR directly in your browser, so they never leave your device. The OCR engine itself is downloaded from a public CDN (jsDelivr) the first time you use it.</p>

      <h2>Accounts and saved history</h2>
      <p>
        If you create an account we store your email address, optional name and preferences in our database (Supabase). History saving is off by default. If you turn it on, we save analysis summaries and improved text; original text is saved only if you separately enable that option. You can view and delete your history at any time from your dashboard, and you can turn saving off again whenever you like.
      </p>
      <p>
        We also keep a daily count of how many analyses and rewrites you run, without any text, to understand usage and prevent abuse.
      </p>

      <h2>Security</h2>
      <p>
        Database access is protected with row-level security so that each account can only read and change its own records. API keys for AI providers are kept on the server and never sent to your browser. We apply rate limits to protect the service.
      </p>

      <h2>Cookies</h2>
      <p>We use only essential cookies to keep you signed in. We do not use advertising or tracking cookies.</p>

      <h2>Contact</h2>
      <p>
        Questions or deletion requests? Use our <a href="/contact">contact form</a>.
      </p>
    </Prose>
  );
}
