import { describe, expect, it } from "vitest";
import { parseEmail, safeNext, siteOrigin } from "@/lib/auth/helpers";

describe("safeNext (post-login redirect)", () => {
  it.each([
    ["/review", "/review"],
    ["/review?tab=open", "/review?tab=open"],
    [null, "/account"],
    ["", "/account"],
    ["https://evil.example", "/account"],
    ["//evil.example", "/account"],
    ["/\\evil.example", "/account"],
    ["javascript:alert(1)", "/account"],
    ["review", "/account"],
  ])("%s → %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe("siteOrigin", () => {
  it("prefers SITE_URL", () => {
    expect(siteOrigin("evil.example", "https://pikalo.org")).toBe("https://pikalo.org");
  });
  it("uses http for localhost in development", () => {
    expect(siteOrigin("localhost:3000", undefined)).toBe("http://localhost:3000");
  });
  it("falls back to the production domain for unknown hosts", () => {
    expect(siteOrigin("evil.example", undefined)).toBe("https://pikalo.org");
  });
});

describe("parseEmail", () => {
  it("normalizes valid emails", () => {
    expect(parseEmail("  Vitaliy@Example.com ")).toBe("vitaliy@example.com");
  });
  it.each([null, "", "nope", "a@b", "x".repeat(250) + "@a.com"])("rejects %s", (v) => {
    expect(parseEmail(v)).toBeNull();
  });
});
