import { describe, expect, it, vi } from "vitest";
import { clientId, hitRateLimit } from "@/lib/assistant/rate-limit";

const TOKEN = "t".repeat(64);

describe("clientId", () => {
  it("is a keyed hash: stable, 64 hex chars, never the raw IP", () => {
    const a = clientId("203.0.113.7", TOKEN);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).toBe(clientId("203.0.113.7", TOKEN));
    expect(a).not.toBe(clientId("203.0.113.8", TOKEN));
    expect(a).not.toBe(clientId("203.0.113.7", "other-key".repeat(8)));
  });
});

describe("hitRateLimit", () => {
  it("sends only the hashed id and maps the database verdict", async () => {
    const fetchFn = vi.fn(async (_u: string, _i: RequestInit) =>
      Response.json({ ok: false, scope: "minute", retry_after: 12 }),
    );
    const r = await hitRateLimit("203.0.113.7", {
      url: "https://db",
      key: "k",
      token: TOKEN,
      fetchFn,
    });
    expect(r).toEqual({ ok: false, scope: "minute", retryAfter: 12 });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://db/rest/v1/rpc/hit_rate_limit");
    expect(init.body as string).not.toContain("203.0.113.7");
  });

  it("returns null when not configured, so the caller uses its fallback", async () => {
    expect(
      await hitRateLimit("1.1.1.1", { url: "https://db", key: "k", token: "" }),
    ).toBeNull();
  });

  it("throws on HTTP errors", async () => {
    const fetchFn = vi.fn(async () => new Response("x", { status: 500 }));
    await expect(
      hitRateLimit("1.1.1.1", { url: "https://db", key: "k", token: TOKEN, fetchFn }),
    ).rejects.toThrow(/500/);
  });
});
