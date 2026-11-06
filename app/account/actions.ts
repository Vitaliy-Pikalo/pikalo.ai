"use server";

import { getViewer } from "@/lib/auth/session";
import { mergeFacts, parseFacts, type Facts } from "@/lib/profile/facts";
import { getMyFacts } from "@/lib/profile/load";
import { createSupabaseServer } from "@/lib/supabase/server";

export type SaveResult = { ok: true; facts: Facts } | { ok: false; error: string };

/** Saves part of the profile; merges with what's there (days merge per year). */
export async function saveFacts(patch: Facts): Promise<SaveResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, error: "Sign in to save your answers." };

  let clean: Facts;
  try {
    clean = parseFacts(patch);
  } catch {
    return {
      ok: false,
      error: "Some answers aren't valid. Check the numbers and try again.",
    };
  }

  const current = (await getMyFacts()).facts;
  const next = mergeFacts(current, clean);
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("user_facts")
    .upsert({ user_id: viewer.id, ...next }, { onConflict: "user_id" });
  if (error)
    return { ok: false, error: "Couldn't save right now. Try again in a moment." };
  return { ok: true, facts: next };
}

/** Deletes every saved answer. The sign-in account itself stays. */
export async function deleteFacts(): Promise<{ ok: boolean }> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false };
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("user_facts").delete().eq("user_id", viewer.id);
  return { ok: !error };
}
