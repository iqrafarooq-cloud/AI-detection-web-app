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
        description="Get a calibrated AI probability from an open-source detector, see which passages drive it, and review writing-pattern signals - every number explained."
      />
      <DetectorApp />
    </div>
  );
}
