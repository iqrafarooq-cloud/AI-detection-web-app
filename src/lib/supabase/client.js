"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_KEY, supabaseEnabled } from "./env";

let browserClient = null;

/** Returns a singleton browser client, or null when Supabase is not configured. */
export function getSupabaseBrowserClient() {
  if (!supabaseEnabled) return null;
  if (!browserClient) browserClient = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  return browserClient;
}

/** Same client under the name used in the Supabase docs (null when not configured). */
export function createClient() {
  return getSupabaseBrowserClient();
}
