"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, Columns2, FileStack, LayoutDashboard, ListCollapse, LogOut, Menu, PenLine, ScanSearch, SpellCheck, X } from "lucide-react";
import { cx } from "@/components/ui";
import { useUser } from "@/lib/client/useUser";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import ThemeToggle from "./ThemeToggle";
import { Logo } from "./Logo";
import { AUTH_PATHS } from "./authPaths";

const PRIMARY = [
  { href: "/detector", label: "AI Detector", icon: ScanSearch, description: "Estimate whether text is AI-generated" },
  { href: "/humanizer", label: "Humanizer", icon: PenLine, description: "Rewrite text to read naturally" },
];
const MORE_TOOLS = [
  { href: "/grammar", label: "Grammar & Clarity", icon: SpellCheck, description: "Fix mistakes and wordy phrasing" },
  { href: "/summarizer", label: "Summarizer", icon: ListCollapse, description: "Key points, paragraph or TL;DR" },
  { href: "/batch", label: "Batch File Check", icon: FileStack, description: "Check up to 10 documents at once" },
  { href: "/compare", label: "Compare", icon: Columns2, description: "See two versions side by side" },
];
const INFO = [
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
];

export default function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, enabled } = useUser();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
    router.push("/");
    router.refresh();
  }

  const linkClass = (active) =>
    cx(
      "inline-flex h-9 items-center gap-1 rounded-lg px-3 text-sm font-medium whitespace-nowrap transition-colors",
      active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    );

  // Login, signup and password pages get a focused header: logo and theme only.
  if (AUTH_PATHS.includes(pathname)) {
    return (
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex shrink-0 items-center" aria-label="Detectly AI home">
            <Logo />
          </Link>
          <ThemeToggle />
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8" aria-label="Main">
        <Link href="/" className="flex shrink-0 items-center" aria-label="Detectly AI home">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-0.5 lg:flex">
          {PRIMARY.map((l) => (
            <li key={l.href}>
              <Link href={l.href} aria-current={pathname === l.href ? "page" : undefined} className={linkClass(pathname === l.href)}>
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            <ToolsMenu pathname={pathname} buttonClass={linkClass(MORE_TOOLS.some((t) => t.href === pathname))} />
          </li>
          {INFO.map((l) => (
            <li key={l.href}>
              <Link href={l.href} aria-current={pathname === l.href ? "page" : undefined} className={linkClass(pathname === l.href)}>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <ThemeToggle />
          {enabled &&
            (user ? (
              <>
                <Link href="/dashboard" className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  <LayoutDashboard className="size-4" aria-hidden /> <span className="hidden xl:inline">Dashboard</span>
                  <span className="sr-only xl:hidden">Dashboard</span>
                </Link>
                <button type="button" onClick={signOut} className="inline-flex h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
                  <LogOut className="size-4" aria-hidden /> <span className="hidden xl:inline">Sign out</span>
                  <span className="sr-only xl:hidden">Sign out</span>
                </button>
              </>
            ) : (
              <>
                <Link href="/login" className="inline-flex h-9 items-center whitespace-nowrap rounded-xl px-3 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  Log in
                </Link>
                <Link href="/signup" className="inline-flex h-9 items-center whitespace-nowrap rounded-xl bg-brand-600 px-4 text-sm font-medium text-on-accent shadow-sm hover:bg-brand-hover">
                  Sign up<span className="hidden xl:inline">&nbsp;free</span>
                </Link>
              </>
            ))}
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="inline-flex size-10 items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </nav>

      {open && (
        <div id="mobile-menu" className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-slate-200 bg-white px-4 py-3 lg:hidden animate-fade-in">
          <p className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Tools</p>
          <ul className="grid grid-cols-2 gap-1">
            {[...PRIMARY, ...MORE_TOOLS].map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={pathname === l.href ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
                    pathname === l.href ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100"
                  )}
                >
                  <l.icon className="size-4 shrink-0 text-brand-600" aria-hidden />
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-2 px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Learn</p>
          <ul className="space-y-1">
            {INFO.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  aria-current={pathname === l.href ? "page" : undefined}
                  className={cx("block rounded-lg px-3 py-2.5 text-sm font-medium", pathname === l.href ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100")}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          {enabled && (
            <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
              {user ? (
                <>
                  <Link href="/dashboard" className="flex h-10 flex-1 items-center justify-center rounded-xl bg-slate-100 text-sm font-medium text-slate-800">
                    Dashboard
                  </Link>
                  <button type="button" onClick={signOut} className="flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-medium text-slate-700 ring-1 ring-slate-200">
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="flex h-10 flex-1 items-center justify-center rounded-xl text-sm font-medium text-slate-700 ring-1 ring-slate-200">
                    Log in
                  </Link>
                  <Link href="/signup" className="flex h-10 flex-1 items-center justify-center rounded-xl bg-brand-600 text-sm font-medium text-on-accent">
                    Sign up free
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </header>
  );
}

/** Disclosure-style dropdown: Escape and outside clicks close it, arrow keys move between items. */
function ToolsMenu({ pathname, buttonClass }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  // Close on navigation.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function items() {
    return [...(rootRef.current?.querySelectorAll("[data-menu-item]") || [])];
  }

  function onButtonKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      requestAnimationFrame(() => items()[0]?.focus());
    }
  }

  function onPanelKeyDown(e) {
    const list = items();
    const idx = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = (idx + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      list[e.key === "Home" ? 0 : list.length - 1]?.focus();
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (open && !rootRef.current?.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="tools-menu"
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onButtonKeyDown}
        className={buttonClass}
      >
        Tools
        <ChevronDown className={cx("size-4 transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div
          id="tools-menu"
          onKeyDown={onPanelKeyDown}
          className="absolute left-1/2 top-full z-50 mt-2 w-80 -translate-x-1/2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg animate-fade-in"
        >
          <ul>
            {MORE_TOOLS.map((t) => {
              const active = pathname === t.href;
              return (
                <li key={t.href}>
                  <Link
                    href={t.href}
                    data-menu-item
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={cx(
                      "flex items-start gap-3 rounded-xl p-3 transition-colors focus-visible:bg-slate-100",
                      active ? "bg-brand-50" : "hover:bg-slate-100"
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <t.icon className="size-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className={cx("block text-sm font-medium", active ? "text-brand-700" : "text-slate-900")}>{t.label}</span>
                      <span className="block text-xs text-slate-500">{t.description}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
