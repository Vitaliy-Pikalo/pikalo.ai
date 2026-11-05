import { describe, expect, it } from "vitest";
import { checkProvenance, extractNumbers } from "@/lib/assistant/provenance";

describe("extractNumbers", () => {
  it("normalizes money, percents and plain numbers", () => {
    const n = extractNumbers(
      "You can get back $3,672.00, which is 7.65% of $48,000 over 183 days.",
    );
    expect(n.map((x) => x.value)).toEqual([3672, 7.65, 48000, 183]);
  });

  it("ignores IRS identifiers like form numbers and code sections", () => {
    const n = extractNumbers(
      "File Form 843 with Form 8316 and a 1040-NR; see section 3121(b)(19) and Pub 519.",
    );
    expect(n).toEqual([]);
  });

  it("ignores ordinal list markers and tax years", () => {
    const n = extractNumbers("1. Email payroll for 2026.\n2. Mail it.");
    expect(n).toEqual([]);
  });

  it("reads fractions written as 1/3", () => {
    expect(extractNumbers("count 1/3 of last year's days").map((x) => x.raw)).toEqual([
      "1/3",
    ]);
  });
});

describe("checkProvenance", () => {
  const tool = JSON.stringify({ refundEstimate: 3672, totalWithheld: 3672 });
  const passage =
    "Social security and Medicare taxes are 7.65% of wages. You must be present at least 31 days.";

  it("passes when every number comes from a source", () => {
    const r = checkProvenance("You're owed $3,672. FICA is 7.65%; you need 31 days.", [
      tool,
      passage,
    ]);
    expect(r.ok).toBe(true);
    expect(r.unsupported).toEqual([]);
  });

  it("blocks a number that appears in no source", () => {
    const r = checkProvenance("You're owed $3,900.", [tool, passage]);
    expect(r.ok).toBe(false);
    expect(r.unsupported.map((u) => u.raw)).toEqual(["$3,900"]);
  });

  it("matches across formats ($3,672.00 vs 3672)", () => {
    expect(checkProvenance("Refund: $3,672.00", ["3672"]).ok).toBe(true);
  });

  it("treats a percent and its fraction as different claims", () => {
    expect(checkProvenance("Medicare is 1.45%", ["0.0145"]).ok).toBe(true);
    expect(checkProvenance("Medicare is 1.45", ["0.0145"]).ok).toBe(false);
  });

  it("allows numbers from the user's own question", () => {
    expect(checkProvenance("With 200 days you pass.", [], "I was here 200 days").ok).toBe(
      true,
    );
  });

  it("allows the small whitelist (0, 1, 2) used in plain language", () => {
    expect(checkProvenance("There are 2 forms to file.", []).ok).toBe(true);
  });
});
