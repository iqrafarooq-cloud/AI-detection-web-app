import Link from "next/link";
import { ArrowRight, FileStack, FileUp, GitCompareArrows, ListCollapse, Lock, ScanSearch, ShieldCheck, SlidersHorizontal, BadgeCheck, SpellCheck, PenLine } from "lucide-react";
import HeroInput from "@/components/home/HeroInput";
import { Card } from "@/components/ui";

const FEATURES = [
  { icon: ScanSearch, title: "Transparent analysis", text: "Sentence-level highlights explain exactly why a passage was flagged: formulaic phrases, repetition, uniform rhythm." },
  { icon: ShieldCheck, title: "Real, explained scores", text: "AI probability comes straight from an open-source RoBERTa detector trained on the RAID benchmark, plus GPT-2 perplexity and burstiness. Every number is explained." },
  { icon: PenLine, title: "Natural rewriting", text: "Seven writing styles that improve flow and clarity without typos, tricks or invented facts." },
  { icon: SlidersHorizontal, title: "Fine-grained control", text: "Tune tone, formality, complexity, vocabulary, paragraph length, text length and English level." },
  { icon: GitCompareArrows, title: "Side-by-side compare", text: "Every change highlighted word by word, with undo, redo and one-click restore of your original." },
  { icon: Lock, title: "Private by default", text: "Your text is processed and discarded. No account needed, nothing is saved." },
];

const MORE_TOOLS = [
  { href: "/grammar", icon: SpellCheck, title: "Grammar & Clarity", text: "Catch grammar, spelling and punctuation mistakes plus wordy or unclear phrasing. Accept or ignore each explained suggestion." },
  { href: "/summarizer", icon: ListCollapse, title: "Summarizer", text: "Turn long text into key points, a short paragraph or a TL;DR that sticks to what the source says." },
  { href: "/batch", icon: FileStack, title: "Batch File Check", text: "Check up to 10 documents for AI-like writing at once and export the results as CSV." },
];

const STEPS = [
  { icon: FileUp, title: "Add your text", text: "Paste it, type it, or upload a PDF, Word (DOC/DOCX), TXT file or a photo/screenshot of text." },
  { icon: ScanSearch, title: "Analyze or improve", text: "Get an evidence-based analysis, or choose a style and let the editor refine your writing." },
  { icon: GitCompareArrows, title: "Review every change", text: "Compare versions, keep what you like, then copy or download as TXT or DOCX." },
];

const FAQ = [
  {
    q: "Can Detectly prove whether a text was written by AI?",
    a: "No - and no tool can. AI detection is probabilistic. Our estimates come from a dedicated detection provider and are statistical signals, not verified authorship. They should never be used as the only evidence in academic or employment decisions.",
  },
  {
    q: "Why do I sometimes see no AI percentage?",
    a: "The detector needs at least 40 words; for shorter text we show no score rather than an unreliable one. It was trained mostly on English, so scores for other languages come with a caution note. Our rule-based writing-pattern analysis still runs. We never make up a number.",
  },
  {
    q: "Does the Humanizer make AI text undetectable?",
    a: "No, and we say so openly. It rewrites in two steps (restructure, then refine) for genuinely better writing, then re-checks both versions with the same detector and shows you the honest result. AI-rewritten text usually still scores as AI. It never adds deliberate mistakes or invisible characters.",
  },
  {
    q: "Is it really free?",
    a: "Yes. There are no paid plans. To keep it sustainable we apply fair-use rate limits, and availability depends on the AI providers configured by the site operator.",
  },
  {
    q: "Do you store my text?",
    a: "Not by default. Text is sent to our AI providers to produce results and is not saved by Detectly. There are no accounts and no saved history.",
  },
  {
    q: "Does it work with languages other than English?",
    a: "The Humanizer keeps your text in its original language. The writing-pattern analysis applies its English phrase checks only to English text; rhythm and repetition metrics work for any language.",
  },
];

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(99,102,241,0.12),transparent),radial-gradient(40%_40%_at_90%_10%,rgba(139,92,246,0.10),transparent)]" aria-hidden />
        <div className="mx-auto grid max-w-7xl gap-12 px-4 pb-16 pt-14 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:items-center lg:px-8 lg:pt-20">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-medium text-brand-700 shadow-sm">
              <BadgeCheck className="size-3.5" aria-hidden /> Free · No sign-up required
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl lg:text-[3.4rem] lg:leading-[1.08]">
              Understand your writing.{" "}
              <span className="bg-gradient-to-r from-brand-600 to-accent-600 bg-clip-text text-transparent">Make it sound like you.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
              Detectly AI estimates how likely a text is AI-generated using an open-source detector that runs on our own server, shows exactly which sentences drive the score and why, and helps you rewrite into clear, natural prose without changing what you mean.
            </p>
            <ul className="mt-8 grid max-w-lg gap-3 text-sm text-slate-600 sm:grid-cols-2">
              {["Sentence-level explanations", "No invented scores", "Facts & citations preserved", "PDF, Word & image uploads"].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-brand-500" aria-hidden /> {t}
                </li>
              ))}
            </ul>
          </div>
          <Card className="p-3 shadow-xl shadow-brand-600/5 sm:p-4">
            <HeroInput />
          </Card>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8" aria-labelledby="features">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-600">Features</p>
          <h2 id="features" className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Useful, honest tools for better writing</h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="p-6 transition-shadow hover:shadow-md">
              <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-violet-50 text-brand-600">
                <f.icon className="size-5" aria-hidden />
              </div>
              <h3 className="mt-4 font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6 lg:px-8" aria-labelledby="more-tools">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-600">Tools</p>
          <h2 id="more-tools" className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Everything else your writing needs</h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {MORE_TOOLS.map((t) => (
            <Link key={t.href} href={t.href} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100">
              <Card className="flex h-full flex-col p-6 transition-shadow group-hover:shadow-md">
                <div className="flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-brand-50 to-violet-50 text-brand-600">
                  <t.icon className="size-5" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{t.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{t.text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600">
                  Open {t.title} <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </span>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200/70 bg-white" aria-labelledby="how">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
          <p className="text-sm font-semibold text-brand-600">How it works</p>
          <h2 id="how" className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Three steps, full control</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative">
                <div className="flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-on-accent">{i + 1}</span>
                  <s.icon className="size-5 text-brand-600" aria-hidden />
                </div>
                <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/detector" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-medium text-on-accent shadow-sm hover:bg-brand-hover">
              Open the AI Detector <ArrowRight className="size-4" aria-hidden />
            </Link>
            <Link href="/humanizer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">
              Open the Humanizer
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8" aria-labelledby="faq">
        <p className="text-center text-sm font-semibold text-brand-600">FAQ</p>
        <h2 id="faq" className="mt-2 text-center text-3xl font-bold tracking-tight text-slate-900">Frequently asked questions</h2>
        <div className="mt-10 space-y-3">
          {FAQ.map((f) => (
            <details key={f.q} className="group rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm open:shadow-md">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-slate-900">
                {f.q}
                <span className="text-xl leading-none text-slate-400 transition-transform group-open:rotate-45" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  );
}
