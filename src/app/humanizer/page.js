import HumanizerApp from "@/components/humanizer/HumanizerApp";
import { PageHeader } from "@/components/ui";

export const metadata = {
  title: "AI Humanizer & Writing Improver",
  description: "Make text clearer and more natural while preserving its meaning, facts and citations.",
};

export default function HumanizerPage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="AI Humanizer"
        title="Improve your writing naturally"
        description="Smooth out awkward phrasing, cut repetition and improve flow in the style you choose. Your meaning, facts, numbers and citations stay intact."
      />
      <HumanizerApp />
    </div>
  );
}
