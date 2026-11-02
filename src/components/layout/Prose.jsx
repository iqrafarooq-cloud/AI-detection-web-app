// Simple typographic wrapper for long-form content pages.
export default function Prose({ children }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8 [&_a]:font-medium [&_a]:text-brand-600 [&_a:hover]:underline [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:tracking-tight [&_h1]:text-slate-900 sm:[&_h1]:text-4xl [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-slate-900 [&_li]:mt-2 [&_p]:mt-4 [&_p]:leading-relaxed [&_p]:text-slate-600 [&_ul]:mt-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-slate-600">
      {children}
    </div>
  );
}
