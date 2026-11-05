/**
 * Embed service request handling, kept free of AWS clients so it can be
 * unit-tested here and wired up in infra/lambda/embed.ts.
 *
 * Input: Lambda function URL event, body {"text": "..."} signed per embed-auth.
 * Output: {"embedding": number[1024]}.
 */

import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyRequest,
} from "@/lib/assistant/embed-auth";

export const MAX_QUERY_CHARS = 2000;

export interface FunctionUrlEvent {
  headers?: Record<string, string | undefined>;
  body?: string | null;
  isBase64Encoded?: boolean;
  requestContext?: { http?: { method?: string } };
}

export interface EmbedResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

export interface EmbedHandlerDeps {
  secret: () => Promise<string>;
  embed: (text: string) => Promise<number[]>;
  now?: () => number; // seconds
}

const json = (statusCode: number, value: unknown): EmbedResponse => ({
  statusCode,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
  body: JSON.stringify(value),
});

export function createEmbedHandler(deps: EmbedHandlerDeps) {
  return async function handler(event: FunctionUrlEvent): Promise<EmbedResponse> {
    if (event.requestContext?.http?.method !== "POST") {
      return json(405, { error: "method_not_allowed" });
    }

    const raw = event.body ?? "";
    const body = event.isBase64Encoded
      ? Buffer.from(raw, "base64").toString("utf8")
      : raw;
    const headers = Object.fromEntries(
      Object.entries(event.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
    );

    const auth = verifyRequest(
      await deps.secret(),
      body,
      headers[TIMESTAMP_HEADER],
      headers[SIGNATURE_HEADER],
      deps.now?.(),
    );
    if (!auth.ok) {
      console.warn(JSON.stringify({ event: "embed_auth_failed", reason: auth.reason }));
      return json(401, { error: "unauthorized" });
    }

    let text: unknown;
    try {
      text = JSON.parse(body).text;
    } catch {
      return json(400, { error: "invalid_json" });
    }
    if (typeof text !== "string" || !text.trim() || text.length > MAX_QUERY_CHARS) {
      return json(400, { error: "invalid_text" });
    }

    try {
      return json(200, { embedding: await deps.embed(text) });
    } catch (e) {
      console.error(JSON.stringify({ event: "embed_failed", error: String(e) }));
      return json(502, { error: "embedding_failed" });
    }
  };
}
