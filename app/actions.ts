"use server";

import { createClient } from "@supabase/supabase-js";
import { joinWaitlist, type WaitlistState } from "@/lib/waitlist";

function getStore() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  return {
    // RLS allows anon INSERT only (no SELECT), so don't request the row back.
    insert: async (row: { email: string; segment: string; school: string | null; source: string }) =>
      supabase.from("waitlist").insert(row),
  };
}

export async function joinWaitlistAction(
  _prev: WaitlistState,
  formData: FormData,
): Promise<WaitlistState> {
  const store = getStore();
  if (!store) {
    console.error("Supabase env vars are missing");
    return { status: "error", message: "Signups aren't open yet. Try again soon." };
  }
  return joinWaitlist(
    {
      email: formData.get("email"),
      segment: formData.get("segment"),
      school: formData.get("school"),
      hp_field: formData.get("hp_field"),
    },
    store,
  );
}
