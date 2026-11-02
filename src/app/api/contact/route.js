import { NextResponse } from "next/server";
import { config } from "@/lib/config";
import { AppError, enforceRateLimit, handleRouteError, readJson } from "@/lib/server/http";
import { getSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function POST(request) {
  try {
    enforceRateLimit(request, "contact", config.limits.contactPerWindow);
    const body = await readJson(request, 32 * 1024);
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim();
    const message = String(body.message ?? "").trim();

    if (!name || name.length > 120) throw new AppError("invalid_name", "Please enter your name (up to 120 characters).");
    if (!EMAIL_RE.test(email) || email.length > 254) throw new AppError("invalid_email", "Please enter a valid email address.");
    if (message.length < 10 || message.length > 5000) throw new AppError("invalid_message", "Your message should be between 10 and 5,000 characters.");
    // Honeypot field: real users never fill this in.
    if (body.website) return NextResponse.json({ ok: true });

    const supabase = await getSupabaseServerClient();
    if (!supabase) {
      throw new AppError("contact_unavailable", "The contact form is not configured on this server. Please email us instead.", 503);
    }
    const user = await getCurrentUser(supabase);
    const { error } = await supabase
      .from("contact_messages")
      .insert({ name, email, message, user_id: user?.id ?? null });
    if (error) {
      console.error("[contact] insert failed:", error.code);
      throw new AppError("contact_failed", "We couldn't send your message right now. Please try again later.", 502);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleRouteError(err, "contact");
  }
}
