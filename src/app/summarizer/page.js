import SummarizerApp from "@/components/summarizer/SummarizerApp";
import { PageHeader } from "@/components/ui";

export const metadata = {
  title: "Text Summarizer",
  description: "Summarize articles, reports and notes into key points, a paragraph or a one-line TL;DR - using only what the text says.",
};

export default function SummarizerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Summarizer"
        title="Get the gist in seconds"
        description="Turn long text into key points, a short paragraph or a TL;DR. Summaries stick to what your text says, and any figure that doesn't match the original is flagged."
      />
      <SummarizerApp />
    </div>
  );
}
