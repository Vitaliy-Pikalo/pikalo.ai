/**
 * Retrieval over IRS passages in Supabase (pgvector, match_passages RPC).
 * Read-only: passages are public IRS text and RLS allows select for anon,
 * so the publishable key is enough.
 */

import { supabaseHeaders } from "@/lib/ingest/supabase-headers";

export interface Passage {
  id: string;
  doc_id: string;
  doc_title: string;
  section: string;
  url: string;
  content: string;
  similarity: number;
}

export interface RetrieveOptions {
  url?: string;
  key?: string;
  k?: number;
  minSimilarity?: number;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}

const isPassage = (r: unknown): r is Passage => {
  const p = r as Partial<Passage>;
  return (
    typeof p?.id === "string" &&
    typeof p.content === "string" &&
    typeof p.url === "string" &&
    p.url.startsWith("https://") &&
    typeof p.similarity === "number"
  );
};

export async function retrievePassages(
  embedding: number[],
  opts: RetrieveOptions = {},
): Promise<Passage[]> {
  const url = opts.url ?? process.env.SUPABASE_URL;
  const key = opts.key ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set");

  const res = await (opts.fetchFn ?? fetch)(`${url}/rest/v1/rpc/match_passages`, {
    method: "POST",
    headers: supabaseHeaders(key),
    body: JSON.stringify({
      query_embedding: JSON.stringify(embedding),
      match_count: opts.k ?? 6,
      min_similarity: opts.minSimilarity ?? 0.35,
    }),
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`match_passages returned ${res.status}`);
  const rows: unknown = await res.json();
  return Array.isArray(rows) ? rows.filter(isPassage) : [];
}
