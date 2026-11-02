import { NextResponse } from "next/server";
import { AppError, handleRouteError } from "@/lib/server/http";
import { getDashboardContext, isHistoryKind, listHistory } from "@/lib/server/dashboard";

// GET /api/history?kind=rewrites|analyses&before=<ISO timestamp>
// Next page of the signed-in user's history (previews only). RLS scopes rows to the caller.
export async function GET(request) {
  try {
    const { supabase, user } = await getDashboardContext();
    if (!supabase) throw new AppError("auth_not_configured", "Accounts are not enabled on this server.", 503);
    if (!user) throw new AppError("unauthorized", "Please log in again.", 401);

    const params = request.nextUrl.searchParams;
    const kind = params.get("kind");
    if (!isHistoryKind(kind)) throw new AppError("bad_request", "Unknown history type.", 400);
    const before = params.get("before");
    if (before && Number.isNaN(Date.parse(before))) throw new AppError("bad_request", "Invalid cursor.", 400);

    const page = await listHistory(supabase, kind, { before });
    if (page.error) throw new AppError("history_unavailable", "Your history couldn't be loaded. Please try again.", 502);
    return NextResponse.json({ items: page.items, nextCursor: page.nextCursor }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (err) {
    return handleRouteError(err, "history");
  }
}
