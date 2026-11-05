import { describe, expect, it } from "vitest";
import { checkFica, FICA_RATES, type FicaInput } from "@/lib/fica";

const base: FicaInput = {
  taxYear: 2026,
  visa: "f1",
  firstYearInStatus: 2024,
  job: "opt",
  wages: 50_000,
  socialSecurityWithheld: 3_100,
  medicareWithheld: 725,
};

const run = (o: Partial<FicaInput>) => checkFica({ ...base, ...o });

describe("FICA rates", () => {
  it("uses 6.2% Social Security and 1.45% Medicare", () => {
    expect(FICA_RATES.socialSecurity).toBe(0.062);
    expect(FICA_RATES.medicare).toBe(0.0145);
  });
});

describe("exempt nonresident students", () => {
  it("F-1 on OPT in year 3 is exempt and owed the full amount withheld", () => {
    const r = run({});
    expect(r.result).toBe("exempt");
    expect(r.refundEstimate).toBe(3_825);
    expect(r.steps.join(" ")).toMatch(/Form 843/);
    expect(r.steps.join(" ")).toMatch(/Form 8316/);
  });

  it.each(["on_campus", "cpt", "opt"] as const)("%s work is covered", (job) => {
    expect(run({ job }).result).toBe("exempt");
  });

  it("J-1 and M-1 students are covered too", () => {
    expect(run({ visa: "j1_student" }).result).toBe("exempt");
    expect(run({ visa: "m1" }).result).toBe("exempt");
  });

  it("year 5 is still exempt; year 6 is not", () => {
    expect(run({ firstYearInStatus: 2022 }).result).toBe("exempt");
    expect(run({ firstYearInStatus: 2021 }).result).toBe("not_exempt");
  });

  it("no refund when nothing was withheld", () => {
    const r = run({ socialSecurityWithheld: 0, medicareWithheld: 0 });
    expect(r.result).toBe("exempt");
    expect(r.refundEstimate).toBe(0);
    expect(r.reasons.join(" ")).toMatch(/correctly/);
  });

  it("flags withholding above the 7.65% rate as unusual", () => {
    const r = run({ wages: 10_000, socialSecurityWithheld: 2_000 });
    expect(r.flags.map((f) => f.code)).toContain("withholding_above_rate");
  });
});

describe("not exempt", () => {
  it("dependents on F-2 / J-2 / M-2 owe FICA", () => {
    const r = run({ visa: "dependent" });
    expect(r.result).toBe("not_exempt");
    expect(r.refundEstimate).toBe(0);
  });

  it("H-1B and other work visas owe FICA", () => {
    expect(run({ visa: "h1b_other" }).result).toBe("not_exempt");
  });

  it("work not allowed by USCIS is not covered", () => {
    expect(run({ job: "unauthorized" }).result).toBe("not_exempt");
  });

  it("resident students past 5 years see the on-campus student exception", () => {
    const r = run({ firstYearInStatus: 2020, job: "on_campus" });
    expect(r.result).toBe("not_exempt");
    expect(r.flags.map((f) => f.code)).toContain("student_fica_exception");
  });
});

describe("needs review", () => {
  it("J-1 researchers/teachers are out of scope", () => {
    expect(run({ visa: "j1_scholar" }).result).toBe("needs_review");
  });

  it("a status change during the year is out of scope", () => {
    expect(run({ statusChanged: true }).result).toBe("needs_review");
  });
});

describe("validation", () => {
  it("rejects negative or non-finite amounts", () => {
    expect(run({ wages: -1 }).result).toBe("invalid");
    expect(run({ medicareWithheld: Number.NaN }).result).toBe("invalid");
  });

  it("rejects first year after tax year", () => {
    expect(run({ firstYearInStatus: 2027 }).result).toBe("invalid");
  });

  it("rounds the refund to cents", () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point
    expect(
      run({ socialSecurityWithheld: 0.1, medicareWithheld: 0.2 }).refundEstimate,
    ).toBe(0.3);
  });
});
