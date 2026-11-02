import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_URL, SUPABASE_KEY, supabaseEnabled } from "./env";

/**
 * Server client bound to the caller's auth cookies. All queries run with the
 * user's JWT, so Row Level Security applies. Returns null if not configured.
 */
export async function getSupabaseServerClient() {
  if (!supabaseEnabled) return null;
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component - the proxy refreshes sessions instead.
        }
      },
    },
  });
}

/** Returns the verified user (validated with the Auth server) or null. */
export async function getCurrentUser(supabase) {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user ?? null;
}
