import { getViewer } from "@/lib/auth/session";
import { parseFacts, type Facts } from "@/lib/profile/facts";
import { createSupabaseServer } from "@/lib/supabase/server";

const COLUMNS =
  "status_kind, first_year_in_status, days_by_year, job, w2_year, wages, ss_withheld, medicare_withheld, filing_status, age_50_plus, compensation, magi, other_ira";

export interface MyFacts {
  signedIn: boolean;
  email?: string;
  facts: Facts;
}

/** The viewer's saved answers (RLS: only their own row). Empty when signed out. */
export async function getMyFacts(): Promise<MyFacts> {
  const viewer = await getViewer();
  if (!viewer) return { signedIn: false, facts: {} };
  const supabase = await createSupabaseServer();
  const { data } = await supabase.from("user_facts").select(COLUMNS).maybeSingle();
  const raw = Object.fromEntries(
    Object.entries(data ?? {}).filter(([, v]) => v !== null && v !== undefined),
  );
  let facts: Facts = {};
  try {
    facts = parseFacts(raw);
  } catch {
    // A row that no longer matches the schema is ignored rather than crashing a page.
  }
  return { signedIn: true, email: viewer.email, facts };
}
