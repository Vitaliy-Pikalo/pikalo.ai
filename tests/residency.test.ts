import { describe, expect, it } from "vitest";
import {
  checkResidency,
  daysInYear,
  type ResidencyInput,
} from "@/lib/residency";

const base: ResidencyInput = {
  taxYear: 2026,
  status: "other",
  daysCurrent: 0,
  daysPrior1: 0,
  daysPrior2: 0,
};

const run = (overrides: Partial<ResidencyInput>) =>
  checkResidency({ ...base, ...overrides });

describe("daysInYear", () => {
  it("handles leap years", () => {
    expect(daysInYear(2024)).toBe(366);
    expect(daysInYear(2026)).toBe(365);
    expect(daysInYear(2000)).toBe(366);
    expect(daysInYear(1900)).toBe(365);
  });
});

describe("citizens and green card holders", () => {
  it("citizens are not subject to the test", () => {
    expect(run({ status: "citizen" }).result).toBe("citizen");
  });

  it("green card holders are residents under the green card test", () => {
    const r = run({ status: "green_card", daysCurrent: 10 });
    expect(r.result).toBe("resident");
    expect(r.test).toBe("green_card");
  });
});

describe("substantial presence test (non-exempt, e.g. H-1B)", () => {
  it("is resident at exactly 183 days in the current year", () => {
    const r = run({ daysCurrent: 183 });
    expect(r.result).toBe("resident");
    expect(r.weightedDays).toBe(183);
  });

  it("is nonresident at 182 days with no prior presence", () => {
    expect(run({ daysCurrent: 182 }).result).toBe("nonresident");
  });

  it("uses the IRS Pub 519 example: 120 days each year → 180, nonresident", () => {
    const r = run({ daysCurrent: 120, daysPrior1: 120, daysPrior2: 120 });
    expect(r.weightedDays).toBe(180);
    expect(r.result).toBe("nonresident");
  });

  it("weights prior years at 1/3 and 1/6 without rounding errors", () => {
    // 122 + 122/3 + 122/6 = 122 + 40.67 + 20.33 = 183 exactly
    const r = run({ daysCurrent: 122, daysPrior1: 122, daysPrior2: 122 });
    expect(r.weightedDays).toBeCloseTo(183, 10);
    expect(r.result).toBe("resident");
  });

  it("requires at least 31 days in the current year", () => {
    const r = run({ daysCurrent: 30, daysPrior1: 365, daysPrior2: 365 });
    expect(r.result).toBe("nonresident");
    expect(r.reasons.join(" ")).toMatch(/31/);
  });

  it("passes at exactly 31 current days when the weighted total is met", () => {
    // 31 + 365/3 + 365/6 = 31 + 121.67 + 60.83 = 213.5
    const r = run({
      taxYear: 2026,
      daysCurrent: 31,
      daysPrior1: 365,
      daysPrior2: 365,
    });
    expect(r.result).toBe("resident");
  });

  it("flags the closer connection exception when resident with <183 current days", () => {
    const r = run({ daysCurrent: 150, daysPrior1: 200, daysPrior2: 0 });
    expect(r.result).toBe("resident");
    expect(r.flags.map((f) => f.code)).toContain("closer_connection");
  });

  it("does not flag closer connection with 183+ current days", () => {
    const r = run({ daysCurrent: 200 });
    expect(r.flags.map((f) => f.code)).not.toContain("closer_connection");
  });
});

describe("F/J/M/Q students (exempt individuals)", () => {
  it("excludes all days during the first 5 calendar years", () => {
    // first year 2022 → exempt 2022–2026
    const r = run({
      status: "student",
      firstYearInStatus: 2022,
      daysCurrent: 365,
      daysPrior1: 365,
      daysPrior2: 365,
    });
    expect(r.result).toBe("nonresident");
    expect(r.countedDays).toEqual({ current: 0, prior1: 0, prior2: 0 });
    expect(r.exemptYears.current).toBe(true);
  });

  it("starts counting days in the 6th calendar year", () => {
    // first year 2021 → exempt 2021–2025; 2026 is year 6
    const r = run({
      status: "student",
      firstYearInStatus: 2021,
      daysCurrent: 200,
      daysPrior1: 365,
      daysPrior2: 365,
    });
    expect(r.exemptYears.current).toBe(false);
    expect(r.exemptYears.prior1).toBe(true);
    expect(r.countedDays).toEqual({ current: 200, prior1: 0, prior2: 0 });
    expect(r.result).toBe("resident");
    expect(r.flags.map((f) => f.code)).toContain("student_extended_exemption");
  });

  it("counts a partial year of arrival as a full exempt calendar year", () => {
    // arrived Aug 2022 → 2022 is year 1, so 2026 is year 5 (still exempt)
    const r = run({
      status: "student",
      firstYearInStatus: 2022,
      daysCurrent: 300,
    });
    expect(r.exemptYears.current).toBe(true);
    expect(r.result).toBe("nonresident");
  });

  it("requires firstYearInStatus", () => {
    const r = run({ status: "student", daysCurrent: 100 });
    expect(r.result).toBe("invalid");
  });
});

describe("J/Q teachers and trainees (exempt individuals)", () => {
  it("is exempt in the first 2 calendar years", () => {
    const r = run({
      status: "teacher_trainee",
      firstYearInStatus: 2025,
      daysCurrent: 365,
      daysPrior1: 200,
    });
    expect(r.exemptYears.current).toBe(true);
    expect(r.exemptYears.prior1).toBe(true);
    expect(r.result).toBe("nonresident");
  });

  it("is not exempt in the 3rd calendar year", () => {
    const r = run({
      status: "teacher_trainee",
      firstYearInStatus: 2024,
      daysCurrent: 200,
      daysPrior1: 365,
      daysPrior2: 200,
    });
    expect(r.exemptYears.current).toBe(false);
    expect(r.countedDays.current).toBe(200);
    expect(r.result).toBe("resident");
  });

  it("flags earlier F/J/M/Q history as out of scope", () => {
    const r = run({
      status: "teacher_trainee",
      firstYearInStatus: 2025,
      priorExemptHistory: true,
      daysCurrent: 100,
    });
    expect(r.flags.map((f) => f.code)).toContain("prior_exempt_history");
  });
});

describe("input validation", () => {
  it("rejects negative days", () => {
    expect(run({ daysCurrent: -1 }).result).toBe("invalid");
  });

  it("rejects non-integer days", () => {
    expect(run({ daysCurrent: 10.5 }).result).toBe("invalid");
  });

  it("rejects more days than the calendar year has", () => {
    expect(run({ taxYear: 2026, daysCurrent: 366 }).result).toBe("invalid");
    // 2024 was a leap year, so prior2 for 2026 can be 366
    expect(run({ taxYear: 2026, daysPrior2: 366 }).result).not.toBe(
      "invalid",
    );
  });

  it("rejects a first year in status after the tax year", () => {
    const r = run({ status: "student", firstYearInStatus: 2027 });
    expect(r.result).toBe("invalid");
  });
});

describe("always-on guardrails", () => {
  it("always includes the dual-status note and a Pub 519 citation", () => {
    const r = run({ daysCurrent: 200 });
    expect(r.flags.map((f) => f.code)).toContain("dual_status");
    expect(r.sources.some((s) => s.url.includes("p519"))).toBe(true);
  });
});

describe("teacher/trainee exemption cycle", () => {
  // first year 2018 → exempt 2018, 2019. Each later year Y is exempt only if
  // fewer than 2 of Y-6..Y-1 were exempt, so exemption returns in 2025.
  const exemptIn = (taxYear: number) =>
    checkResidency({
      taxYear,
      status: "teacher_trainee",
      firstYearInStatus: 2018,
      daysCurrent: 100,
      daysPrior1: 0,
      daysPrior2: 0,
    }).exemptYears.current;

  it.each([
    [2018, true],
    [2019, true],
    [2020, false], // window 2014–2019: 2018, 2019
    [2024, false], // window 2018–2023: 2018, 2019
    [2025, true], // window 2019–2024: only 2019
    [2026, true], // window 2020–2025: only 2025
    [2027, false], // window 2021–2026: 2025, 2026
  ])("tax year %i → exempt %s", (year, expected) => {
    expect(exemptIn(year)).toBe(expected);
  });
});

describe("review fixes", () => {
  it("returns needs_review when visa type changed (F-1 → H-1B)", () => {
    const r = run({
      status: "other",
      statusChanged: true,
      daysCurrent: 365,
      daysPrior1: 365,
      daysPrior2: 365,
    });
    expect(r.result).toBe("needs_review");
    expect(r.reasons.join(" ")).toMatch(/split/);
  });

  it("teacher paid by a foreign employer stays exempt through year 4", () => {
    const exemptIn = (taxYear: number) =>
      checkResidency({
        taxYear,
        status: "teacher_trainee",
        firstYearInStatus: 2023,
        foreignEmployer: true,
        daysCurrent: 300,
        daysPrior1: 0,
        daysPrior2: 0,
      }).exemptYears.current;
    expect(exemptIn(2025)).toBe(true); // 2 prior exempt
    expect(exemptIn(2026)).toBe(true); // 3 prior exempt → still ≤3
    expect(exemptIn(2027)).toBe(false); // 4 prior exempt
  });

  it("flags earlier teacher/trainee history for students", () => {
    const r = run({
      status: "student",
      firstYearInStatus: 2024,
      priorExemptHistory: true,
      daysCurrent: 300,
    });
    expect(r.flags.map((f) => f.code)).toContain("prior_exempt_history");
  });

  it("year 5 vs year 6 for a student, with prior-year days", () => {
    const base5 = {
      status: "student" as const,
      daysCurrent: 300,
      daysPrior1: 300,
      daysPrior2: 300,
    };
    // first 2022: 2026 is year 5 → all exempt
    expect(run({ ...base5, firstYearInStatus: 2022 }).weightedDays).toBe(0);
    // first 2021: 2026 is year 6 → only current year counts
    expect(run({ ...base5, firstYearInStatus: 2021 }).weightedDays).toBe(300);
  });

  it("always shows the other-excluded-days note for the SPT", () => {
    expect(run({ daysCurrent: 100 }).flags.map((f) => f.code)).toContain(
      "other_excluded_days",
    );
  });
});
