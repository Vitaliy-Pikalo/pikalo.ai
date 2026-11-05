import { describe, expect, it } from "vitest";
import { signRequest, verifyRequest, MAX_SKEW_SECONDS } from "@/lib/assistant/embed-auth";

const SECRET = "test-secret-0123456789abcdef";
const BODY = JSON.stringify({ text: "what is the substantial presence test?" });
const NOW = 1_793_900_000;

describe("embed request signing", () => {
  it("accepts a request it signed", () => {
    const { timestamp, signature } = signRequest(SECRET, BODY, NOW);
    expect(verifyRequest(SECRET, BODY, timestamp, signature, NOW)).toEqual({ ok: true });
  });

  it("rejects a tampered body", () => {
    const { timestamp, signature } = signRequest(SECRET, BODY, NOW);
    const r = verifyRequest(SECRET, BODY + " ", timestamp, signature, NOW);
    expect(r).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects the wrong secret", () => {
    const { timestamp, signature } = signRequest("other-secret", BODY, NOW);
    expect(verifyRequest(SECRET, BODY, timestamp, signature, NOW).ok).toBe(false);
  });

  it("rejects replays outside the time window, in both directions", () => {
    const { timestamp, signature } = signRequest(SECRET, BODY, NOW);
    const late = verifyRequest(SECRET, BODY, timestamp, signature, NOW + MAX_SKEW_SECONDS + 1);
    const early = verifyRequest(SECRET, BODY, timestamp, signature, NOW - MAX_SKEW_SECONDS - 1);
    expect(late).toEqual({ ok: false, reason: "stale" });
    expect(early).toEqual({ ok: false, reason: "stale" });
  });

  it("rejects missing or malformed headers without throwing", () => {
    expect(verifyRequest(SECRET, BODY, undefined, undefined, NOW)).toEqual({
      ok: false,
      reason: "missing_headers",
    });
    expect(verifyRequest(SECRET, BODY, "abc", "zz", NOW).ok).toBe(false);
    const { timestamp } = signRequest(SECRET, BODY, NOW);
    expect(verifyRequest(SECRET, BODY, timestamp, "short", NOW)).toEqual({
      ok: false,
      reason: "bad_signature",
    });
  });

  it("refuses to work with an empty secret", () => {
    expect(() => signRequest("", BODY, NOW)).toThrow();
    expect(verifyRequest("", BODY, String(NOW), "x", NOW)).toEqual({
      ok: false,
      reason: "server_misconfigured",
    });
  });
});
