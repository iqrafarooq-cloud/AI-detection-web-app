import GrammarApp from "@/components/grammar/GrammarApp";
import { PageHeader } from "@/components/ui";

export const metadata = {
  title: "Grammar & Clarity Checker",
  description: "Find grammar, spelling, punctuation, clarity and wordiness issues and fix them one suggestion at a time.",
};

export default function GrammarPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Grammar & Clarity"
        title="Polish your writing, one fix at a time"
        description="Catch grammar, spelling and punctuation mistakes, plus unclear or wordy phrasing. Every suggestion is explained, and you decide what to accept."
      />
      <GrammarApp />
    </div>
  );
}
