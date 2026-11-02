"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Returns { user, loading, enabled } and stays in sync with auth changes. */
export function useUser() {
  const supabase = getSupabaseBrowserClient();
  const [state, setState] = useState({ user: null, loading: Boolean(supabase) });

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    supabase.auth.getUser().then(({ data }) => {
      if (alive) setState({ user: data?.user ?? null, loading: false });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) setState({ user: session?.user ?? null, loading: false });
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  return { ...state, enabled: Boolean(supabase) };
}
