/**
 * Saves a withheld answer for human review through the database's
 * insert-only RPC (record_withheld_answer). Uses the publishable key plus a
 * shared token checked inside the database; the app holds no service key.
 * Env: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, REVIEW_QUEUE_TOKEN.
 */

import { redactPii } from "@/lib/assistant/redact";
import { supabaseHeaders } from "@/lib/ingest/supabase-headers";

export interface WithheldAnswer {
  model: string;
  question: string;
  draft: string;
  reason: string[];
  citations: unknown[];
  tools: unknown[];
}

export interface QueueOptions {
  url?: string;
  key?: string;
  token?: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}

export async function recordWithheld(item: WithheldAnswer, opts: QueueOptions = {}) {
  const url = opts.url ?? process.env.SUPABASE_URL;
  const key = opts.key ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  const token = (opts.token ?? process.env.REVIEW_QUEUE_TOKEN ?? "").trim();
  if (!url || !key || !token) return; // not configured (e.g. preview deploys)

  const res = await (opts.fetchFn ?? fetch)(`${url}/rest/v1/rpc/record_withheld_answer`, {
    method: "POST",
    headers: supabaseHeaders(key),
    body: JSON.stringify({
      p_token: token,
      p_model: item.model.slice(0, 100),
      p_question: redactPii(item.question).slice(0, 1000),
      p_draft: redactPii(item.draft).slice(0, 6000),
      p_reason: item.reason.slice(0, 10).map((r) => redactPii(r)),
      p_citations: item.citations.slice(0, 10),
      p_tools: item.tools.slice(0, 10),
    }),
    signal: AbortSignal.timeout(5_000),
  });
  if (!res.ok) throw new Error(`record_withheld_answer returned ${res.status}`);
}
