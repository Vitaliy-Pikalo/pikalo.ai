import { createSupabaseServer } from "@/lib/supabase/server";

export type Role = "user" | "reviewer" | "admin";

export interface Viewer {
  id: string;
  email: string;
  role: Role;
}

/** The signed-in user, verified with Supabase Auth (getUser), and their role. */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = await createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // RLS: users can read only their own profile row.
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  return { id: user.id, email: user.email ?? "", role: (data?.role as Role) ?? "user" };
}

export const canReview = (v: Viewer | null) =>
  v?.role === "reviewer" || v?.role === "admin";
