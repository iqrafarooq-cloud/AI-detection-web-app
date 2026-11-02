"use client";

import { usePathname } from "next/navigation";

// Pages that show a focused, link-free header and footer.
export const AUTH_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password"];

export function useIsAuthPage() {
  return AUTH_PATHS.includes(usePathname());
}

/** Renders children everywhere except on the auth pages. */
export function HideOnAuthPages({ children }) {
  return useIsAuthPage() ? null : children;
}
