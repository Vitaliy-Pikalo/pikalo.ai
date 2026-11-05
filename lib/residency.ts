/**
 * U.S. federal tax residency checker (educational).
 *
 * Implements the green card test and the substantial presence test (SPT)
 * from IRS Publication 519, chapter 1, including the "exempt individual"
 * rules for F/J/M/Q students and J/Q teachers & trainees.
 *
 * Deliberately out of scope (surfaced as flags, never guessed):
 * dual-status years, the closer connection exception (Form 8840),
 * the student 5-year extension, treaty tie-breakers, the first-year choice,
 * and other exempt-day categories (commuters, transit, medical).
 *
 * This is a pure, deterministic function: no I/O, no LLM.
 */

export type ResidencyStatus =
  | "citizen"
  | "green_card"
  | "student" // F, J (student), M or Q visa
  | "teacher_trainee" // J or Q visa, not a student
  | "other"; // e.g. H-1B, L-1, O-1, B-1/B-2 — days always count

export interface ResidencyInput {
  taxYear: number;
  status: ResidencyStatus;
  /** Days physically present in the U.S. during the tax year. */
  daysCurrent: number;
  /** Days present in the year before the tax year. */
  daysPrior1: number;
  /** Days present two years before the tax year. */
  daysPrior2: number;
  /**
   * First calendar year in which the person was in the U.S. in their current
   * exempt status (any part of the year counts as a full year).
   * Required for "student" and "teacher_trainee".
   */
  firstYearInStatus?: number;
  /** Was the person in the U.S. as a student, teacher or trainee before this status? */
  priorExemptHistory?: boolean;
  /** Teacher/trainee only: a foreign employer paid all compensation every year here. */
  foreignEmployer?: boolean;
  /**
   * Did the person's visa type change during the 3 years being counted
   * (e.g. F-1 → H-1B)? Exempt days then cover only part of a year, which
   * this tool doesn't model, so the result becomes "needs_review".
   */
  statusChanged?: boolean;
}

export type FlagCode =
  | "closer_connection"
  | "student_extended_exemption"
  | "prior_exempt_history"
  | "dual_status"
  | "status_assumption"
  | "other_excluded_days";

export interface Flag {
  code: FlagCode;
  message: string;
}

export interface Source {
  title: string;
  url: string;
}

export type ResidencyResult =
  "citizen" | "resident" | "nonresident" | "needs_review" | "invalid";

export interface ResidencyOutput {
  result: ResidencyResult;
  test: "green_card" | "substantial_presence" | "none";
  weightedDays: number;
  countedDays: { current: number; prior1: number; prior2: number };
  exemptYears: { current: boolean; prior1: boolean; prior2: boolean };
  reasons: string[];
  flags: Flag[];
  sources: Source[];
}

export const SOURCES: Source[] = [
  {
    title: "IRS Publication 519, U.S. Tax Guide for Aliens",
    url: "https://www.irs.gov/publications/p519",
  },
  {
    title: "IRS: Substantial Presence Test",
    url: "https://www.irs.gov/individuals/international-taxpayers/substantial-presence-test",
  },
];

/** Calendar years in which a student is exempt (first year counts as year 1). */
const STUDENT_EXEMPT_YEARS = 5;
/** Teachers/trainees: not exempt if exempt in any part of 2 of the prior 6 years. */
const TEACHER_EXEMPT_YEARS = 2;
/** With all pay from a foreign employer: still exempt if exempt in ≤3 of the prior 6. */
const TEACHER_FOREIGN_EMPLOYER_EXEMPT_YEARS = 4;

const SPT_WEIGHTED_THRESHOLD = 183;
const SPT_CURRENT_MINIMUM = 31;

export function daysInYear(year: number): number {
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 366 : 365;
}

function emptyOutput(): ResidencyOutput {
  return {
    result: "invalid",
    test: "none",
    weightedDays: 0,
    countedDays: { current: 0, prior1: 0, prior2: 0 },
    exemptYears: { current: false, prior1: false, prior2: false },
    reasons: [],
    flags: [],
    sources: SOURCES,
  };
}

function validate(input: ResidencyInput): string[] {
  const errors: string[] = [];
  const { taxYear } = input;

  if (!Number.isInteger(taxYear) || taxYear < 1985 || taxYear > 2100) {
    errors.push("Tax year must be a valid calendar year.");
    return errors;
  }

  const dayFields: [keyof ResidencyInput, number, string][] = [
    ["daysCurrent", taxYear, "this year"],
    ["daysPrior1", taxYear - 1, "last year"],
    ["daysPrior2", taxYear - 2, "two years ago"],
  ];
  for (const [field, year, label] of dayFields) {
    const value = input[field] as number;
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`Days ${label} must be a whole number of 0 or more.`);
    } else if (value > daysInYear(year)) {
      errors.push(`Days ${label} can't exceed ${daysInYear(year)} (${year}).`);
    }
  }

  if (input.status === "student" || input.status === "teacher_trainee") {
    const first = input.firstYearInStatus;
    if (first === undefined || !Number.isInteger(first)) {
      errors.push("Enter the first calendar year you were in the U.S. in this status.");
    } else if (first > taxYear) {
      errors.push("First year in status can't be after the tax year.");
    } else if (first < 1950) {
      errors.push("First year in status looks too early.");
    }
  }

  return errors;
}

/**
 * Whether the person is an exempt individual in `year`, assuming continuous
 * status since `firstYear` (an assumption we flag to the user).
 */
function isExemptInYear(
  status: ResidencyStatus,
  year: number,
  firstYear: number | undefined,
  foreignEmployer = false,
): boolean {
  if (firstYear === undefined || year < firstYear) return false;
  const yearsInStatusBefore = year - firstYear; // full calendar years before `year`
  if (status === "student") return yearsInStatusBefore < STUDENT_EXEMPT_YEARS;
  if (status === "teacher_trainee") {
    // Exempt in year Y unless exempt for any part of 2 of the 6 preceding
    // calendar years. Computed year by year because exemption can return
    // after a long enough run of non-exempt years.
    const exempt = new Map<number, boolean>();
    for (let y = firstYear; y <= year; y++) {
      let count = 0;
      for (let p = y - 6; p < y; p++) if (exempt.get(p)) count++;
      const limit = foreignEmployer
        ? TEACHER_FOREIGN_EMPLOYER_EXEMPT_YEARS
        : TEACHER_EXEMPT_YEARS;
      exempt.set(y, count < limit);
    }
    return exempt.get(year) ?? false;
  }
  return false;
}

export function checkResidency(input: ResidencyInput): ResidencyOutput {
  const out = emptyOutput();

  if (input.status === "citizen") {
    out.result = "citizen";
    out.reasons.push(
      "U.S. citizens are taxed as U.S. persons — the residency tests for aliens don't apply.",
    );
    return out;
  }

  const errors = validate(input);
  if (errors.length > 0) {
    out.reasons = errors;
    return out;
  }

  out.flags.push({
    code: "dual_status",
    message:
      "If you arrived in or left the U.S. permanently during this year, you may be a dual-status alien (resident for part of the year). This tool doesn't handle dual-status years.",
  });

  if (input.status === "green_card") {
    out.result = "resident";
    out.test = "green_card";
    out.reasons.push(
      "Lawful permanent residents (green card holders) are resident aliens under the green card test.",
    );
    return out;
  }

  const { taxYear, status, firstYearInStatus } = input;
  out.test = "substantial_presence";

  out.flags.push({
    code: "other_excluded_days",
    message:
      "Some days never count: regular commutes from Canada or Mexico, under 24 hours in transit between two foreign places, days you couldn't leave because of a medical condition, and days as an immediate family member of an exempt individual or diplomat. This tool doesn't subtract them for you. The first-year choice to be treated as a resident isn't covered either.",
  });

  if (input.statusChanged) {
    out.result = "needs_review";
    out.reasons.push(
      `Your visa type changed between ${taxYear - 2} and ${taxYear}. Only days spent in a non-exempt status (like H-1B) count, so each year has to be split at the date your status changed. This tool doesn't split years yet.`,
      "To do it yourself: for each year, count only the days outside F, J, M or Q status, then add this year's days + ⅓ of last year's + ⅙ of the year before. You need at least 31 days this year and 183 in total.",
    );
    return out;
  }

  out.exemptYears = {
    current: isExemptInYear(status, taxYear, firstYearInStatus, input.foreignEmployer),
    prior1: isExemptInYear(status, taxYear - 1, firstYearInStatus, input.foreignEmployer),
    prior2: isExemptInYear(status, taxYear - 2, firstYearInStatus, input.foreignEmployer),
  };

  out.countedDays = {
    current: out.exemptYears.current ? 0 : input.daysCurrent,
    prior1: out.exemptYears.prior1 ? 0 : input.daysPrior1,
    prior2: out.exemptYears.prior2 ? 0 : input.daysPrior2,
  };

  const { current, prior1, prior2 } = out.countedDays;
  out.weightedDays = current + prior1 / 3 + prior2 / 6;
  // Integer comparison avoids floating-point edge cases: 6x ≥ 6·183.
  const meetsWeighted = 6 * current + 2 * prior1 + prior2 >= 6 * SPT_WEIGHTED_THRESHOLD;
  const meetsMinimum = current >= SPT_CURRENT_MINIMUM;

  if (status === "student" || status === "teacher_trainee") {
    out.flags.push({
      code: "status_assumption",
      message: `This assumes you've been in ${status === "student" ? "F/J/M/Q student" : "J/Q teacher or trainee"} status since ${firstYearInStatus} and were in the U.S. for at least part of every calendar year since. A full calendar year spent outside the U.S. doesn't use up an exempt year, so the result may differ.`,
    });
    if (out.exemptYears.current) {
      out.reasons.push(
        `As an exempt individual in ${taxYear}, your days this year don't count toward the substantial presence test. You still generally need to file Form 8843.`,
      );
    }
  }

  if (status === "student" && !out.exemptYears.current) {
    out.flags.push({
      code: "student_extended_exemption",
      message:
        "Students past 5 calendar years can sometimes stay exempt by showing they don't intend to live in the U.S. permanently and have complied with their visa. This needs case-by-case review.",
    });
  }

  if (
    (status === "teacher_trainee" || status === "student") &&
    input.priorExemptHistory
  ) {
    out.flags.push({
      code: "prior_exempt_history",
      message:
        status === "student"
          ? "Years you spent in the U.S. as a teacher or trainee count toward the student 5-year limit. This tool only counts years since your first year as a student, so your exemption may end sooner."
          : "Years you spent in the U.S. as a student, teacher or trainee before this visa count toward the 2-of-6-years limit. This tool only counts years since your first year in this status, so your exemption may end sooner.",
    });
  }

  if (!meetsMinimum) {
    out.result = "nonresident";
    out.reasons.push(
      `You have ${current} countable day(s) this year. The test requires at least ${SPT_CURRENT_MINIMUM}.`,
    );
    return out;
  }

  if (!meetsWeighted) {
    out.result = "nonresident";
    out.reasons.push(
      `Your weighted total is ${formatDays(out.weightedDays)} days, below the ${SPT_WEIGHTED_THRESHOLD}-day threshold.`,
    );
    return out;
  }

  out.result = "resident";
  out.reasons.push(
    `You have ${current} countable days this year and a weighted total of ${formatDays(out.weightedDays)} days, meeting the substantial presence test.`,
  );

  if (current < SPT_WEIGHTED_THRESHOLD) {
    out.flags.push({
      code: "closer_connection",
      message:
        "Because you were present fewer than 183 days this year, you may qualify for the closer connection exception if your tax home and closer ties are in another country. You'd need to file Form 8840 on time, and it's generally not available if you've applied for or taken steps toward a green card.",
    });
  }

  return out;
}

export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
