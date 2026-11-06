import { describe, expect, it } from "vitest";
import {
  mergeFacts,
  parseFacts,
  readiness,
  toFicaVisa,
  toResidencyStatus,
  type Facts,
} from "@/lib/profile/facts";

describe("parseFacts", () => {
  it("accepts a partial profile and coerces numeric strings from the database", () => {
    const r = parseFacts({
      status_kind: "f1",
      wages: "10000.00",
      days_by_year: { "2026": 300 },
    });
    expect(r).toEqual({ status_kind: "f1", wages: 10000, days_by_year: { "2026": 300 } });
  });

  it.each([
    [{ status_kind: "tourist" }],
    [{ wages: -1 }],
    [{ days_by_year: { "2026": 400 } }],
    [{ days_by_year: { abc: 10 } }],
    [{ ssn: "123-45-6789" }],
  ])("rejects %j", (input) => {
    expect(() => parseFacts(input)).toThrow();
  });
});

describe("mapping to calculator inputs", () => {
  it.each([
    ["f1", "student", "f1"],
    ["j1_scholar", "teacher_trainee", "j1_scholar"],
    ["h1b_other", "other", "h1b_other"],
    ["green_card", "green_card", null],
    ["citizen", "citizen", null],
  ] as const)("%s → residency %s, FICA %s", (k, res, fica) => {
    expect(toResidencyStatus(k)).toBe(res);
    expect(toFicaVisa(k)).toBe(fica);
  });
});

describe("readiness", () => {
  const full: Facts = {
    status_kind: "f1",
    first_year_in_status: 2024,
    days_by_year: { "2026": 300, "2025": 330, "2024": 120 },
    job: "on_campus",
    wages: 10000,
    ss_withheld: 620,
    medicare_withheld: 145,
    filing_status: "single",
    age_50_plus: false,
    compensation: 10000,
  };

  it("marks every tool ready when the profile is complete", () => {
    const r = readiness(full, 2026);
    expect([r.residency.state, r.fica.state, r.roth.state]).toEqual([
      "ready",
      "ready",
      "ready",
    ]);
  });

  it("lists what's missing in plain words", () => {
    const r = readiness({ status_kind: "f1", days_by_year: { "2026": 300 } }, 2026);
    expect(r.residency.missing).toEqual([
      "Days in the U.S. in 2025",
      "Days in the U.S. in 2024",
      "Year you first arrived on this visa",
    ]);
    expect(r.roth.state).toBe("missing");
  });

  it("doesn't ask green card holders for a first-arrival year, and skips FICA for them", () => {
    const r = readiness(
      { status_kind: "green_card", days_by_year: { "2026": 1, "2025": 1, "2024": 1 } },
      2026,
    );
    expect(r.residency.state).toBe("ready");
    expect(r.fica.state).toBe("not_applicable");
  });
});

describe("mergeFacts", () => {
  it("merges days by year instead of replacing them", () => {
    expect(
      mergeFacts(
        { days_by_year: { "2025": 330 }, wages: 1 },
        { days_by_year: { "2026": 300 } },
      ),
    ).toEqual({ days_by_year: { "2025": 330, "2026": 300 }, wages: 1 });
  });
});
