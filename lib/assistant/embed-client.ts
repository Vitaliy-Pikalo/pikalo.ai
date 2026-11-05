/**
 * Server-side client the Vercel app uses to embed a user's question.
 * Env: EMBED_URL, EMBED_SIGNING_SECRET. Never import from client components.
 */

import {
  signRequest,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/assistant/embed-auth";
import { EMBEDDING_DIMENSIONS } from "@/lib/ingest/pipeline";

export interface EmbedClientOptions {
  url?: string;
  secret?: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number; // seconds
  timeoutMs?: number;
}

export async function embedQuery(
  text: string,
  opts: EmbedClientOptions = {},
): Promise<number[]> {
  const url = opts.url ?? process.env.EMBED_URL;
  const secret = opts.secret ?? process.env.EMBED_SIGNING_SECRET;
  if (!url || !secret) throw new Error("EMBED_URL and EMBED_SIGNING_SECRET must be set");

  const body = JSON.stringify({ text });
  const { timestamp, signature } = signRequest(secret, body, opts.now?.());
  const res = await (opts.fetchFn ?? fetch)(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: signature,
    },
    body,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
  });
  if (!res.ok) throw new Error(`embed service returned ${res.status}`);

  const embedding = (await res.json()).embedding;
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`embed service returned wrong dimensions`);
  }
  return embedding;
}
