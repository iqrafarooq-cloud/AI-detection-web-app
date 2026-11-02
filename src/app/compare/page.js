import CompareApp from "@/components/compare/CompareApp";
import { PageHeader } from "@/components/ui";

export const metadata = {
  title: "Text Comparison",
  description: "Compare two versions of a text with word-level change highlighting.",
};

export default function ComparePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Text Comparison" title="Compare two versions" description="See exactly what changed between an original and a revision - word by word." />
      <CompareApp />
    </div>
  );
}
