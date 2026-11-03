export default function Footer() {
  return (
    <footer className="mt-24 border-t border-slate-200 bg-white">
      <p className="mx-auto max-w-7xl px-4 py-6 text-xs text-slate-400 sm:px-6 lg:px-8">
        © {new Date().getFullYear()} Detectly AI. Free to use. Your text is never stored.
      </p>
    </footer>
  );
}
