import { NextResponse } from "next/server";
import { safeNext } from "@/lib/auth/helpers";
import { createSupabaseServer } from "@/lib/supabase/server";

// Magic-link landing: trade the one-time code for a session cookie (PKCE).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = safeNext(url.searchParams.get("next"));

  if (code) {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=link", url.origin));
}
