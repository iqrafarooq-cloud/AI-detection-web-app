"use client";

export default function GlobalError({ reset }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Something went wrong</h1>
      <p className="mt-3 text-slate-600">An unexpected error occurred. Your text was not saved anywhere.</p>
      <button type="button" onClick={reset} className="mt-8 inline-flex h-10 items-center rounded-xl bg-brand-600 px-4 text-sm font-medium text-on-accent hover:bg-brand-hover">
        Try again
      </button>
    </div>
  );
}
