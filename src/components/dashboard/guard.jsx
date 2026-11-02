import { redirect } from "next/navigation";
import { Alert } from "@/components/ui";
import { getDashboardContext } from "@/lib/server/dashboard";

/**
 * Resolves the signed-in user for a dashboard page, redirecting to login when
 * signed out. Returns { user } or { blocked: <element> } when accounts are off.
 */
export async function requireDashboardUser(nextPath) {
  const { supabase, user } = await getDashboardContext();
  if (!supabase) {
    return {
      blocked: (
        <Alert tone="info" title="Accounts are not enabled">
          Authentication is not configured on this server.
        </Alert>
      ),
    };
  }
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return { user };
}

export function LoadError({ error, what = "Some data" }) {
  if (!error) return null;
  return (
    <Alert tone="error" title={`${what} couldn't be loaded`}>
      Please refresh the page. If this keeps happening, make sure the database migration has been applied. ({error.code || "error"})
    </Alert>
  );
}
