import { describe, expect, it } from "vitest";
import { checkRoth, ROTH_2026, type RothInput } from "@/lib/roth";

const base: RothInput = {
  taxYear: 2026,
  filingStatus: "single",
  age50OrOlder: false,
  taxableCompensation: 60_000,
  modifiedAgi: 60_000,
  otherIraContributions: 0,
};

const run = (o: Partial<RothInput>) => checkRoth({ ...base, ...o });

describe("2026 IRS figures (IR-2025-111)", () => {
  it("matches the published limits", () => {
    expect(ROTH_2026.limit).toBe(7_500);
    expect(ROTH_2026.catchUp).toBe(1_100);
    expect(ROTH_2026.phaseOut.single).toEqual([153_000, 168_000]);
    expect(ROTH_2026.phaseOut.married_joint).toEqual([242_000, 252_000]);
    expect(ROTH_2026.phaseOut.married_separate).toEqual([0, 10_000]);
  });
});

describe("full contribution", () => {
  it("below the phase-out you can put in the full $7,500", () => {
    const r = run({});
    expect(r.result).toBe("eligible");
    expect(r.maxContribution).toBe(7_500);
  });

  it("age 50+ adds the $1,100 catch-up", () => {
    expect(run({ age50OrOlder: true }).maxContribution).toBe(8_600);
  });

  it("head of household uses the single range", () => {
    expect(
      run({ filingStatus: "head_of_household", modifiedAgi: 152_000 }).maxContribution,
    ).toBe(7_500);
  });
});

describe("phase-out (Pub 590-A worksheet)", () => {
  it("halfway through the single range gives half, rounded up to $10", () => {
    // (168,000 − 160,500) / 15,000 × 7,500 = 3,750
    expect(run({ modifiedAgi: 160_500 }).maxContribution).toBe(3_750);
  });

  it("rounds up to the next $10", () => {
    // (168,000 − 160,001) / 15,000 × 7,500 = 3,999.5 → 4,000
    expect(run({ modifiedAgi: 160_001 }).maxContribution).toBe(4_000);
  });

  it("a small but positive amount becomes the $200 floor", () => {
    // (168,000 − 167,900) / 15,000 × 7,500 = 50 → 200
    expect(run({ modifiedAgi: 167_900 }).maxContribution).toBe(200);
  });

  it("at or above the top of the range you can't contribute", () => {
    const r = run({ modifiedAgi: 168_000 });
    expect(r.result).toBe("over_income");
    expect(r.maxContribution).toBe(0);
  });

  it("married filing jointly uses its own range", () => {
    // (252,000 − 247,000) / 10,000 × 7,500 = 3,750
    expect(
      run({ filingStatus: "married_joint", modifiedAgi: 247_000 }).maxContribution,
    ).toBe(3_750);
  });

  it("married filing separately phases out from $0 unless you lived apart", () => {
    expect(
      run({ filingStatus: "married_separate", modifiedAgi: 5_000 }).maxContribution,
    ).toBe(3_750);
    expect(
      run({
        filingStatus: "married_separate",
        livedApartAllYear: true,
        modifiedAgi: 5_000,
      }).maxContribution,
    ).toBe(7_500); // lived apart all year → treated as single for the phase-out
  });
});

describe("compensation cap", () => {
  it("can't contribute more than taxable compensation", () => {
    const r = run({ taxableCompensation: 3_000, modifiedAgi: 3_000 });
    expect(r.maxContribution).toBe(3_000);
    expect(r.limitedBy).toBe("compensation");
  });

  it("no taxable compensation means no contribution", () => {
    const r = run({ taxableCompensation: 0, modifiedAgi: 0 });
    expect(r.result).toBe("no_compensation");
    expect(r.maxContribution).toBe(0);
    expect(r.reasons.join(" ")).toMatch(/treaty/i);
  });

  it("traditional IRA contributions reduce the room", () => {
    const r = run({ otherIraContributions: 2_000 });
    expect(r.maxContribution).toBe(5_500);
    expect(r.limitedBy).toBe("other_contributions");
  });

  it("traditional contributions also come out of a reduced limit", () => {
    // reduced limit 3,750 − 1,000 traditional = 2,750
    expect(
      run({ modifiedAgi: 160_500, otherIraContributions: 1_000 }).maxContribution,
    ).toBe(2_750);
  });
});

describe("validation", () => {
  it("only supports 2026", () => {
    expect(run({ taxYear: 2025 }).result).toBe("invalid");
  });

  it("rejects negative amounts", () => {
    expect(run({ modifiedAgi: -5 }).result).toBe("invalid");
  });
});
