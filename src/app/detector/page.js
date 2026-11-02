import DetectorApp from "@/components/detector/DetectorApp";
import { PageHeader } from "@/components/ui";

export const metadata = {
  title: "AI Text Detector",
  description: "Analyze text for AI-like writing patterns with transparent, sentence-level explanations.",
};

export default function DetectorPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="AI Text Detector"
        title="Detect AI-generated text"
        description="Get an AI probability computed by an open-source detector, see which sentences drive it, and review perplexity, burstiness and writing-pattern signals - every number explained."
      />
      <DetectorApp />
    </div>
  );
}
