/**
 * Server-side client for the signed model gateway (embed + converse).
 * Env: EMBED_URL, EMBED_SIGNING_SECRET. Never import from client components.
 */

import {
  signRequest,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/assistant/embed-auth";
import type { ConverseRequest, ConverseResponse } from "@/lib/assistant/embed-handler";
import { EMBEDDING_DIMENSIONS } from "@/lib/ingest/pipeline";

export interface EmbedClientOptions {
  url?: string;
  secret?: string;
  fetchFn?: (url: string, init: RequestInit) => Promise<Response>;
  now?: () => number; // seconds
  timeoutMs?: number;
}

async function callGateway(
  payload: unknown,
  opts: EmbedClientOptions,
  defaultTimeoutMs: number,
) {
  const url = opts.url ?? process.env.EMBED_URL;
  // Trim: a pasted env value with a trailing newline would break every signature.
  const secret = (opts.secret ?? process.env.EMBED_SIGNING_SECRET)?.trim();
  if (!url || !secret) throw new Error("EMBED_URL and EMBED_SIGNING_SECRET must be set");

  const body = JSON.stringify(payload);
  const { timestamp, signature } = signRequest(secret, body, opts.now?.());
  const res = await (opts.fetchFn ?? fetch)(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [TIMESTAMP_HEADER]: timestamp,
      [SIGNATURE_HEADER]: signature,
    },
    body,
    signal: AbortSignal.timeout(opts.timeoutMs ?? defaultTimeoutMs),
  });
  if (!res.ok) throw new Error(`embed service returned ${res.status}`);
  return res.json();
}

export async function embedQuery(
  text: string,
  opts: EmbedClientOptions = {},
): Promise<number[]> {
  const embedding = (await callGateway({ text }, opts, 10_000)).embedding;
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(`embed service returned wrong dimensions`);
  }
  return embedding;
}

export async function converse(
  req: ConverseRequest,
  opts: EmbedClientOptions = {},
): Promise<ConverseResponse> {
  const out = await callGateway({ op: "converse", ...req }, opts, 30_000);
  if (!out?.output?.message) throw new Error("model gateway returned no message");
  return out as ConverseResponse;
}
