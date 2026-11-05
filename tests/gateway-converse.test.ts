import { describe, expect, it, vi } from "vitest";
import {
  signRequest,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/assistant/embed-auth";
import {
  createEmbedHandler,
  MAX_CONVERSE_BODY_CHARS,
  MAX_OUTPUT_TOKENS,
  type ConverseRequest,
  type ConverseResponse,
} from "@/lib/assistant/embed-handler";
import { converse } from "@/lib/assistant/embed-client";

const SECRET = "s3cret-for-tests";
const NOW = 1_793_900_000;
const MODEL = "us.amazon.nova-micro-v1:0";

function event(body: string) {
  const { timestamp, signature } = signRequest(SECRET, body, NOW);
  return {
    headers: { [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: signature },
    body,
    requestContext: { http: { method: "POST" } },
  };
}

const reply: ConverseResponse = {
  output: { message: { role: "assistant", content: [{ text: "hi" }] } },
  stopReason: "end_turn",
  usage: { inputTokens: 10, outputTokens: 2 },
};

function setup(conv = vi.fn(async (_req: ConverseRequest) => reply)) {
  const handler = createEmbedHandler({
    secret: async () => SECRET,
    embed: vi.fn(async () => []),
    converse: conv,
    allowedModels: [MODEL],
    now: () => NOW,
  });
  return { handler, conv };
}

const base = {
  op: "converse",
  modelId: MODEL,
  system: "be brief",
  messages: [{ role: "user", content: [{ text: "hello" }] }],
};

describe("gateway converse", () => {
  it("passes an allowed request to Bedrock and returns its output", async () => {
    const { handler, conv } = setup();
    const res = await handler(event(JSON.stringify({ ...base, maxTokens: 300 })));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual(reply);
    expect(conv.mock.calls[0][0]).toMatchObject({ modelId: MODEL, maxTokens: 300 });
  });

  it("refuses models that are not on the allowlist", async () => {
    const { handler, conv } = setup();
    const res = await handler(
      event(JSON.stringify({ ...base, modelId: "anthropic.claude-opus-x" })),
    );
    expect(res.statusCode).toBe(400);
    expect(conv).not.toHaveBeenCalled();
  });

  it("caps output tokens so a caller can't run up the bill", async () => {
    const { handler, conv } = setup();
    await handler(event(JSON.stringify({ ...base, maxTokens: 100_000 })));
    expect(conv.mock.calls[0][0].maxTokens).toBe(MAX_OUTPUT_TOKENS);
  });

  it("rejects oversized or malformed conversations", async () => {
    const { handler, conv } = setup();
    const huge = { ...base, system: "x".repeat(MAX_CONVERSE_BODY_CHARS) };
    const tooMany = { ...base, messages: Array(30).fill(base.messages[0]) };
    const noMessages = { ...base, messages: [] };
    for (const body of [huge, tooMany, noMessages]) {
      expect((await handler(event(JSON.stringify(body)))).statusCode).toBe(400);
    }
    expect(conv).not.toHaveBeenCalled();
  });

  it("returns 501 when the gateway has no converse backend", async () => {
    const handler = createEmbedHandler({
      secret: async () => SECRET,
      embed: vi.fn(async () => []),
      now: () => NOW,
    });
    expect((await handler(event(JSON.stringify(base)))).statusCode).toBe(501);
  });

  it("still requires a valid signature", async () => {
    const { handler, conv } = setup();
    const e = event(JSON.stringify(base));
    e.body = JSON.stringify({ ...base, modelId: "other" });
    expect((await handler(e)).statusCode).toBe(401);
    expect(conv).not.toHaveBeenCalled();
  });

  it("client round-trips through the handler", async () => {
    const { handler } = setup();
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      const res = await handler({
        headers,
        body: init.body as string,
        requestContext: { http: { method: "POST" } },
      });
      return new Response(res.body, { status: res.statusCode });
    });
    const out = await converse(
      {
        modelId: MODEL,
        system: "s",
        messages: base.messages as ConverseRequest["messages"],
      },
      { url: "https://g", secret: SECRET, fetchFn, now: () => NOW },
    );
    expect(out.stopReason).toBe("end_turn");
  });
});
