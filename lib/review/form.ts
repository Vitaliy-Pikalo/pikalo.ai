import { z } from "zod";

const schema = z.object({
  id: z.uuid(),
  // A reviewer can only close an item, never reopen or delete it.
  decision: z.enum(["approved", "rejected"]),
  note: z.string().trim().max(2000).optional(),
});

export type ReviewForm =
  | { ok: true; id: string; status: "approved" | "rejected"; note: string | null }
  | { ok: false };

export function parseReviewForm(formData: FormData): ReviewForm {
  const r = schema.safeParse({
    id: formData.get("id"),
    decision: formData.get("decision"),
    note: formData.get("note") ?? undefined,
  });
  if (!r.success) return { ok: false };
  return { ok: true, id: r.data.id, status: r.data.decision, note: r.data.note || null };
}
