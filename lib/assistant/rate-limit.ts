/**
 * Shared rate limit for /api/ask (database-backed, so it holds across
 * serverless instances): 8 per minute and 60 per day per client, plus a
 * global daily ceiling on model spend. Limits are set in the database.
 * The database sees an HMAC of the client IP, never the IP itself.
 */

import { createHmac } from "node:crypto";
import { supabaseHeaders } from "@/lib/ingest/supabase-headers";

export interface LimitVerdict {
  ok: boolean;
  scope?: "minute" | "day" | "global";
  retryAfter?: number;
}

export interface LimitOptions {
  url?: string;
  key?: string;
  token?: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
}

export const clientId = (ip: string, secret: string) =>
  createHmac("sha256", secret).update(`rate-limit:${ip}`).digest("hex");

/** Returns null when not configured (the caller falls back to its local limiter). */
export async function hitRateLimit(
  ip: string,
  opts: LimitOptions = {},
): Promise<LimitVerdict | null> {
  const url = opts.url ?? process.env.SUPABASE_URL;
  const key = opts.key ?? process.env.SUPABASE_PUBLISHABLE_KEY;
  const token = (opts.token ?? process.env.REVIEW_QUEUE_TOKEN ?? "").trim();
  if (!url || !key || !token) return null;

  const res = await (opts.fetchFn ?? fetch)(`${url}/rest/v1/rpc/hit_rate_limit`, {
    method: "POST",
    headers: supabaseHeaders(key),
    body: JSON.stringify({ p_token: token, p_client: clientId(ip, token) }),
    signal: AbortSignal.timeout(3_000),
  });
  if (!res.ok) throw new Error(`hit_rate_limit returned ${res.status}`);
  const v = await res.json();
  return { ok: v.ok === true, scope: v.scope, retryAfter: v.retry_after };
}
