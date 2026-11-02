import "server-only";
import { getSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

/**
 * Records usage and (only with consent) history for signed-in users.
 * Anonymous users: nothing is stored. Failures never break the main request.
 * Returns a short status for the UI.
 */
export async function recordActivity(feature, buildRow) {
  try {
    const supabase = await getSupabaseServerClient();
    const user = await getCurrentUser(supabase);
    if (!user) return { signedIn: false, saved: false };

    await supabase.rpc("increment_usage", { p_feature: feature });

    const { data: prefs } = await supabase
      .from("user_preferences")
      .select("save_history, store_original_text")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!prefs?.save_history) return { signedIn: true, saved: false };

    const { table, row } = buildRow({ storeOriginal: Boolean(prefs.store_original_text) });
    const { error } = await supabase.from(table).insert({ ...row, user_id: user.id });
    if (error) {
      console.error(`[history] insert into ${table} failed:`, error.code);
      return { signedIn: true, saved: false };
    }
    return { signedIn: true, saved: true };
  } catch (err) {
    console.error("[history] failed:", err?.name);
    return { signedIn: false, saved: false };
  }
}
