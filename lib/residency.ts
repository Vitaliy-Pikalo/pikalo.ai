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
  /** Teacher/trainee only: was the person ever in the U.S. on F/J/M/Q before? */
  priorExemptHistory?: boolean;
}

export type FlagCode =
  | "closer_connection"
  | "student_extended_exemption"
  | "prior_exempt_history"
  | "dual_status"
  | "status_assumption";

export interface Flag {
  code: FlagCode;
  message: string;
}

export interface Source {
  title: string;
  url: string;
}

export type ResidencyResult =
  | "citizen"
  | "resident"
  | "nonresident"
  | "invalid";

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
      exempt.set(y, count < TEACHER_EXEMPT_YEARS);
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

  out.exemptYears = {
    current: isExemptInYear(status, taxYear, firstYearInStatus),
    prior1: isExemptInYear(status, taxYear - 1, firstYearInStatus),
    prior2: isExemptInYear(status, taxYear - 2, firstYearInStatus),
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
      message: `This assumes you've been in ${status === "student" ? "F/J/M/Q student" : "J/Q teacher or trainee"} status continuously since ${firstYearInStatus}. If your visa type changed, the result may differ.`,
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

  if (status === "teacher_trainee" && input.priorExemptHistory) {
    out.flags.push({
      code: "prior_exempt_history",
      message:
        "Earlier time in the U.S. on F, J, M or Q status can shorten or remove the teacher/trainee exemption. This tool can't account for that — check Pub 519 or a tax professional.",
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
        "Because you were present fewer than 183 days this year, you may qualify for the closer connection exception (Form 8840) if your tax home and closer ties are in another country.",
    });
  }

  return out;
}

export function formatDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
