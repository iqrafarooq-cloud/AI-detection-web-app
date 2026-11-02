import ContactForm from "@/components/contact/ContactForm";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Contact" title="Get in touch" description="Questions, feedback, bug reports or data requests - we read every message." />
      <ContactForm />
    </div>
  );
}
