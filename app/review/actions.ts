"use server";

import { refresh } from "next/cache";
import { canReview, getViewer } from "@/lib/auth/session";
import { parseReviewForm } from "@/lib/review/form";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function reviewAnswer(formData: FormData) {
  // Checked here for a clear error; RLS enforces it again in the database.
  if (!canReview(await getViewer())) throw new Error("Not allowed");
  const form = parseReviewForm(formData);
  if (!form.ok) throw new Error("Invalid review");

  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("withheld_answers")
    .update({ status: form.status, reviewer_note: form.note })
    .eq("id", form.id)
    .eq("status", "open");
  if (error) throw new Error("Couldn't save the review");
  refresh();
}
