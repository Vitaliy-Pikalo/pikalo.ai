"use server";

import { headers } from "next/headers";
import { parseEmail, safeNext, siteOrigin } from "@/lib/auth/helpers";
import { createSupabaseServer } from "@/lib/supabase/server";

export interface LoginState {
  status: "idle" | "sent" | "error";
  message: string;
}

// Same reply whether or not the address has an account: no account enumeration.
const SENT =
  "If that address can sign in, a link is on its way. It works once and expires in an hour.";

export async function sendMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = parseEmail(formData.get("email"));
  if (!email) return { status: "error", message: "Enter a valid email address." };

  const h = await headers();
  const origin = siteOrigin(h.get("host"), process.env.SITE_URL);
  const next = safeNext(String(formData.get("next") ?? ""));

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });
  if (error) {
    console.error(
      JSON.stringify({
        event: "magic_link_failed",
        status: error.status,
        code: error.code,
      }),
    );
    if (error.status === 429) {
      return {
        status: "error",
        message: "Too many sign-in emails. Try again in a few minutes.",
      };
    }
  }
  return { status: "sent", message: SENT };
}
