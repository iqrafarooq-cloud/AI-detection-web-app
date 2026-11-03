import Link from "next/link";
import { Logo } from "./Logo";

const GROUPS = [
  {
    title: "Tools",
    links: [
      { href: "/detector", label: "AI Text Detector" },
      { href: "/humanizer", label: "Writing Humanizer" },
      { href: "/grammar", label: "Grammar & Clarity" },
      { href: "/summarizer", label: "Summarizer" },
      { href: "/batch", label: "Batch File Check" },
      { href: "/compare", label: "Text Comparison" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/how-it-works", label: "How it works" },
      { href: "/about", label: "About" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-24 border-t border-slate-200 bg-white">
      <div className="border-b border-slate-100">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4 lg:px-8">
          <div className="md:col-span-2">
            <Link href="/" className="inline-flex" aria-label="Detectly AI home">
              <Logo />
            </Link>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500">
              Free, transparent text analysis and writing improvement. AI detection is probabilistic - no tool can prove who wrote a text, and our results are
              never a substitute for human judgment.
            </p>
          </div>
          {GROUPS.map((g) => (
            <div key={g.title}>
              <p className="text-sm font-semibold text-slate-900">{g.title}</p>
              <ul className="mt-4 space-y-3">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-sm text-slate-500 hover:text-brand-600">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-slate-400 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} Detectly AI. Free to use. Your text is never stored.
      </p>
    </footer>
  );
}
