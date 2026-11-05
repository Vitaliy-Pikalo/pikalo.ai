/**
 * Model gateway request handling, kept free of AWS clients so it can be
 * unit-tested here and wired up in infra/lambda/embed.ts.
 *
 * Every request is signed per embed-auth. Two operations:
 * - embed (default):  {"text": "..."}               → {"embedding": number[1024]}
 * - converse:         {"op":"converse", modelId, system, messages, toolConfig?, maxTokens?}
 *                     → Bedrock Converse {output, stopReason, usage}
 * Converse only runs allowlisted models and caps output tokens, so a leaked
 * signing key can't be used to call expensive models or run up long outputs.
 */

import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyRequest,
} from "@/lib/assistant/embed-auth";

export const MAX_QUERY_CHARS = 2000;
export const MAX_OUTPUT_TOKENS = 1024;
export const MAX_MESSAGES = 16;
export const MAX_CONVERSE_BODY_CHARS = 60_000;

export type ContentBlock =
  | { text: string }
  | { toolUse: { toolUseId: string; name: string; input: unknown } }
  | {
      toolResult: {
        toolUseId: string;
        content: ({ json: unknown } | { text: string })[];
        status?: "success" | "error";
      };
    };

export interface ConverseMessage {
  role: "user" | "assistant";
  content: ContentBlock[];
}

export interface ToolSpec {
  toolSpec: { name: string; description: string; inputSchema: { json: unknown } };
}

export interface ConverseRequest {
  modelId: string;
  system: string;
  messages: ConverseMessage[];
  toolConfig?: { tools: ToolSpec[] };
  maxTokens?: number;
  temperature?: number;
}

export interface ConverseResponse {
  output: { message: ConverseMessage };
  stopReason: string;
  usage?: { inputTokens: number; outputTokens: number };
}

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
  converse?: (req: ConverseRequest) => Promise<ConverseResponse>;
  allowedModels?: string[];
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

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(body);
    } catch {
      return json(400, { error: "invalid_json" });
    }
    if (parsed?.op === "converse") return handleConverse(parsed, body.length);

    const text = parsed?.text;
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

  async function handleConverse(
    p: Record<string, unknown>,
    size: number,
  ): Promise<EmbedResponse> {
    if (!deps.converse) return json(501, { error: "converse_not_enabled" });
    const messages = p.messages as ConverseMessage[] | undefined;
    const valid =
      size <= MAX_CONVERSE_BODY_CHARS &&
      typeof p.modelId === "string" &&
      (deps.allowedModels ?? []).includes(p.modelId) &&
      typeof p.system === "string" &&
      Array.isArray(messages) &&
      messages.length > 0 &&
      messages.length <= MAX_MESSAGES &&
      messages.every(
        (m) => (m.role === "user" || m.role === "assistant") && Array.isArray(m.content),
      );
    if (!valid) return json(400, { error: "invalid_converse_request" });

    const requested = typeof p.maxTokens === "number" ? p.maxTokens : MAX_OUTPUT_TOKENS;
    const req: ConverseRequest = {
      modelId: p.modelId as string,
      system: p.system as string,
      messages: messages!,
      toolConfig: p.toolConfig as ConverseRequest["toolConfig"],
      maxTokens: Math.max(1, Math.min(requested, MAX_OUTPUT_TOKENS)),
      temperature:
        typeof p.temperature === "number" ? Math.min(Math.max(p.temperature, 0), 1) : 0,
    };
    try {
      return json(200, await deps.converse(req));
    } catch (e) {
      console.error(
        JSON.stringify({
          event: "converse_failed",
          modelId: req.modelId,
          error: String(e),
        }),
      );
      return json(502, { error: "model_failed" });
    }
  }
}
