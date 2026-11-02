import BatchApp from "@/components/batch/BatchApp";
import { PageHeader } from "@/components/ui";

export const metadata = {
  title: "Batch File Check",
  description: "Check up to 10 documents for AI-like writing at once and export the results as CSV.",
};

export default function BatchPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Batch File Check"
        title="Check many documents at once"
        description="Upload several files and get an AI-likelihood estimate for each one in a single table. Open any row for the full report, or export everything as CSV."
      />
      <BatchApp />
    </div>
  );
}
