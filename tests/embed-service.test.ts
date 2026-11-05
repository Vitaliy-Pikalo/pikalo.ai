import { describe, expect, it, vi } from "vitest";
import {
  signRequest,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
} from "@/lib/assistant/embed-auth";
import { createEmbedHandler, MAX_QUERY_CHARS } from "@/lib/assistant/embed-handler";
import { embedQuery } from "@/lib/assistant/embed-client";
import { EMBEDDING_DIMENSIONS } from "@/lib/ingest/pipeline";

const SECRET = "s3cret-for-tests";
const NOW = 1_793_900_000;
const VECTOR = Array(EMBEDDING_DIMENSIONS).fill(0.01);

function event(body: string, headers: Record<string, string>, base64 = false) {
  return {
    headers,
    body: base64 ? Buffer.from(body).toString("base64") : body,
    isBase64Encoded: base64,
    requestContext: { http: { method: "POST" } },
  };
}

function signed(body: string) {
  const { timestamp, signature } = signRequest(SECRET, body, NOW);
  return { [TIMESTAMP_HEADER]: timestamp, [SIGNATURE_HEADER]: signature };
}

function makeHandler(embed = vi.fn(async () => VECTOR)) {
  return {
    embed,
    handler: createEmbedHandler({ secret: async () => SECRET, embed, now: () => NOW }),
  };
}

describe("embed handler", () => {
  it("embeds a signed request", async () => {
    const { handler, embed } = makeHandler();
    const body = JSON.stringify({ text: "Roth IRA limit" });
    const res = await handler(event(body, signed(body)));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).embedding).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(embed).toHaveBeenCalledWith("Roth IRA limit");
  });

  it("handles base64 bodies from function URLs", async () => {
    const { handler } = makeHandler();
    const body = JSON.stringify({ text: "FICA" });
    const res = await handler(event(body, signed(body), true));
    expect(res.statusCode).toBe(200);
  });

  it("returns 401 and never calls Bedrock for unsigned or tampered requests", async () => {
    const { handler, embed } = makeHandler();
    const body = JSON.stringify({ text: "x" });
    expect((await handler(event(body, {}))).statusCode).toBe(401);
    const tampered = JSON.stringify({ text: "y" });
    expect((await handler(event(tampered, signed(body)))).statusCode).toBe(401);
    expect(embed).not.toHaveBeenCalled();
  });

  it("does not reveal why auth failed", async () => {
    const { handler } = makeHandler();
    const res = await handler(event("{}", {}));
    expect(res.body).toBe(JSON.stringify({ error: "unauthorized" }));
  });

  it("rejects non-POST, bad JSON, empty and oversized text with 4xx", async () => {
    const { handler, embed } = makeHandler();
    const get = { ...event("", {}), requestContext: { http: { method: "GET" } } };
    expect((await handler(get)).statusCode).toBe(405);
    for (const body of [
      "not json",
      JSON.stringify({ text: "  " }),
      JSON.stringify({ text: "a".repeat(MAX_QUERY_CHARS + 1) }),
    ]) {
      const res = await handler(event(body, signed(body)));
      expect(res.statusCode).toBe(400);
    }
    expect(embed).not.toHaveBeenCalled();
  });

  it("returns 502 without leaking the upstream error", async () => {
    const { handler } = makeHandler(
      vi.fn(async () => {
        throw new Error("ThrottlingException: secret detail");
      }),
    );
    const body = JSON.stringify({ text: "q" });
    const res = await handler(event(body, signed(body)));
    expect(res.statusCode).toBe(502);
    expect(res.body).not.toContain("secret detail");
  });
});

describe("embed client", () => {
  it("signs the exact body it sends and returns the vector", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      const { handler } = makeHandler();
      const res = await handler(event(init.body as string, headers));
      return new Response(res.body, { status: res.statusCode });
    });
    const v = await embedQuery("what is FBAR?", {
      url: "https://embed.example",
      secret: SECRET,
      fetchFn,
      now: () => NOW,
    });
    expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
  });

  it("throws on non-200 and on wrong-size vectors", async () => {
    const opts = { url: "https://e", secret: SECRET, now: () => NOW };
    await expect(
      embedQuery("q", {
        ...opts,
        fetchFn: vi.fn(async () => new Response("{}", { status: 401 })),
      }),
    ).rejects.toThrow(/401/);
    await expect(
      embedQuery("q", {
        ...opts,
        fetchFn: vi.fn(async () => new Response(JSON.stringify({ embedding: [1, 2] }))),
      }),
    ).rejects.toThrow(/dimensions/);
  });
});

describe("embed client secret handling", () => {
  it("ignores surrounding whitespace in the signing secret", async () => {
    const fetchFn = vi.fn(async (_url: string, init: RequestInit) => {
      const { handler } = makeHandler();
      const res = await handler(
        event(init.body as string, init.headers as Record<string, string>),
      );
      return new Response(res.body, { status: res.statusCode });
    });
    const v = await embedQuery("q", {
      url: "https://e",
      secret: `  ${SECRET}\r\n`,
      fetchFn,
      now: () => NOW,
    });
    expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
  });
});
