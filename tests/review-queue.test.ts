import { describe, expect, it, vi } from "vitest";
import { redactPii } from "@/lib/assistant/redact";
import { recordWithheld } from "@/lib/assistant/review-queue";

describe("redactPii", () => {
  it.each([
    ["My SSN is 123-45-6789", "My SSN is [redacted id]"],
    ["ITIN 912 70 1234 on file", "ITIN [redacted id] on file"],
    ["ssn 123456789", "ssn [redacted id]"],
    ["A-number A123456789", "A-number [redacted id]"],
    ["account 4111 1111 1111 1111", "account [redacted number]"],
    [
      "routing 021000021 acct 12345678901",
      "routing [redacted id] acct [redacted number]",
    ],
    ["email me at jo.doe+tax@gmail.com", "email me at [redacted email]"],
  ])("%s", (input, expected) => {
    expect(redactPii(input)).toBe(expected);
  });

  it("keeps the numbers a tax question needs", () => {
    const q =
      "F-1 since 2024, earned $10,000, W-2 box 4 shows $620; 1040-NR due April 15, 183 days";
    expect(redactPii(q)).toBe(q);
  });
});

describe("recordWithheld", () => {
  it("calls the insert-only RPC with redacted, size-capped fields", async () => {
    const fetchFn = vi.fn(
      async (_u: string, _i: RequestInit) => new Response(null, { status: 204 }),
    );
    await recordWithheld(
      {
        model: "us.amazon.nova-micro-v1:0",
        question: "SSN 123-45-6789, how much Roth?",
        draft: "x".repeat(7000),
        reason: ["$7,000"],
        citations: [{ n: 1, url: "https://www.irs.gov/p590a" }],
        tools: [{ name: "roth_ira_limit", ok: false }],
      },
      {
        url: "https://db.example",
        key: "sb_publishable_x",
        token: "t".repeat(64),
        fetchFn,
      },
    );
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("https://db.example/rest/v1/rpc/record_withheld_answer");
    const body = JSON.parse(init.body as string);
    expect(body.p_question).toBe("SSN [redacted id], how much Roth?");
    expect(body.p_draft).toHaveLength(6000);
    expect(body.p_token).toHaveLength(64);
    expect(body.p_reason).toEqual(["$7,000"]);
  });

  it("does nothing without a token (e.g. preview deploys)", async () => {
    const fetchFn = vi.fn();
    await recordWithheld(
      { model: "m", question: "q", draft: "d", reason: [], citations: [], tools: [] },
      { url: "https://db", key: "k", token: "", fetchFn },
    );
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("throws on HTTP errors so the caller can log them", async () => {
    const fetchFn = vi.fn(async () => new Response("forbidden", { status: 403 }));
    await expect(
      recordWithheld(
        { model: "m", question: "q", draft: "d", reason: [], citations: [], tools: [] },
        { url: "https://db", key: "k", token: "t".repeat(64), fetchFn },
      ),
    ).rejects.toThrow(/403/);
  });
});
