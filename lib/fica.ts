/**
 * FICA (Social Security + Medicare) exemption and refund checker for
 * nonresident students (educational).
 *
 * Source: IRS, "Foreign student liability for Social Security and Medicare
 * taxes" — nonresident alien students in F-1, J-1 or M-1 status are exempt
 * on wages for work USCIS allows and that's connected to the purpose of the
 * visa (on-campus work, practical training). Spouses and children (F-2, J-2,
 * M-2) are not exempt. If tax was withheld in error, ask the employer first,
 * then file Form 843 with Form 8316.
 *
 * Nonresident status is approximated with the student exempt-individual rule
 * from lib/residency.ts (first 5 calendar years, continuous status).
 */

import { SOURCES as RESIDENCY_SOURCES, type Source } from "@/lib/residency";

export const FICA_RATES = {
  /** Employee share of Social Security tax. */
  socialSecurity: 0.062,
  /** Employee share of Medicare tax (before any Additional Medicare Tax). */
  medicare: 0.0145,
} as const;

const STUDENT_EXEMPT_YEARS = 5;

export type FicaVisa =
  | "f1"
  | "j1_student"
  | "m1"
  | "j1_scholar" // J-1 researcher, professor, teacher, trainee
  | "dependent" // F-2, J-2, M-2
  | "h1b_other"; // H-1B, L-1, O-1, TN, green card, etc.

export type FicaJob =
  | "on_campus"
  | "cpt"
  | "opt" // includes STEM OPT
  | "unauthorized"; // work USCIS hasn't allowed

export interface FicaInput {
  taxYear: number;
  visa: FicaVisa;
  /** First calendar year in the U.S. in this student status. */
  firstYearInStatus: number;
  job: FicaJob;
  /** W-2 box 3 (Social Security wages); used only for a sanity check. */
  wages: number;
  /** W-2 box 4. */
  socialSecurityWithheld: number;
  /** W-2 box 6. */
  medicareWithheld: number;
  /** Did the visa type change during the tax year (e.g. OPT → H-1B in October)? */
  statusChanged?: boolean;
}

export type FicaResult = "exempt" | "not_exempt" | "needs_review" | "invalid";

export type FicaFlagCode =
  | "withholding_above_rate"
  | "student_fica_exception"
  | "status_assumption"
  | "on_campus_hours"
  | "state_and_income_tax";

export interface FicaOutput {
  result: FicaResult;
  /** Dollars likely refundable (0 unless result is "exempt"). */
  refundEstimate: number;
  totalWithheld: number;
  reasons: string[];
  steps: string[];
  flags: { code: FicaFlagCode; message: string }[];
  sources: Source[];
}

export const FICA_SOURCES: Source[] = [
  {
    title: "IRS: Foreign student liability for Social Security and Medicare taxes",
    url: "https://www.irs.gov/individuals/international-taxpayers/foreign-student-liability-for-social-security-and-medicare-taxes",
  },
  { title: "IRS Form 843", url: "https://www.irs.gov/forms-pubs/about-form-843" },
  { title: "IRS Form 8316 (PDF)", url: "https://www.irs.gov/pub/irs-pdf/f8316.pdf" },
  RESIDENCY_SOURCES[0],
];

const STUDENT_VISAS: FicaVisa[] = ["f1", "j1_student", "m1"];

const toCents = (n: number) => Math.round(n * 100) / 100;

export function checkFica(input: FicaInput): FicaOutput {
  const out: FicaOutput = {
    result: "invalid",
    refundEstimate: 0,
    totalWithheld: 0,
    reasons: [],
    steps: [],
    flags: [],
    sources: FICA_SOURCES,
  };

  const amounts = [input.wages, input.socialSecurityWithheld, input.medicareWithheld];
  if (amounts.some((n) => !Number.isFinite(n) || n < 0)) {
    out.reasons.push("Enter dollar amounts of 0 or more from your W-2.");
    return out;
  }
  if (
    !Number.isInteger(input.firstYearInStatus) ||
    input.firstYearInStatus > input.taxYear ||
    input.firstYearInStatus < 1950
  ) {
    out.reasons.push("First year in status must be a year on or before the tax year.");
    return out;
  }

  out.totalWithheld = toCents(input.socialSecurityWithheld + input.medicareWithheld);

  const expectedMax = input.wages * (FICA_RATES.socialSecurity + FICA_RATES.medicare);
  if (out.totalWithheld > expectedMax + 1) {
    out.flags.push({
      code: "withholding_above_rate",
      message: `The amount withheld is more than 7.65% of the Social Security wages you entered. Double-check boxes 3, 4 and 6 on your W-2.`,
    });
  }

  if (input.statusChanged) {
    out.result = "needs_review";
    out.reasons.push(
      "Your status changed during the year. FICA applies to wages paid after the change (for example, once H-1B starts) but not before it, so the year has to be split by pay date. Ask your payroll office which paychecks fall before the change.",
    );
    return out;
  }

  if (input.visa === "j1_scholar") {
    out.result = "needs_review";
    out.reasons.push(
      "J-1 researchers, professors and trainees have their own FICA rules that this tool doesn't cover yet. Ask your sponsor or international office.",
    );
    return out;
  }

  if (input.visa === "dependent") {
    out.result = "not_exempt";
    out.reasons.push(
      "Spouses and children in F-2, J-2 or M-2 status aren't covered by the student exemption, so FICA is owed on their U.S. wages.",
    );
    return out;
  }

  if (!STUDENT_VISAS.includes(input.visa)) {
    out.result = "not_exempt";
    out.reasons.push(
      "The FICA exemption covers F-1, J-1 student and M-1 nonresident students. Work visas like H-1B owe Social Security and Medicare tax.",
    );
    return out;
  }

  const yearsBefore = input.taxYear - input.firstYearInStatus;
  const withinExemptYears = yearsBefore < STUDENT_EXEMPT_YEARS;

  out.flags.push({
    code: "status_assumption",
    message: `This assumes you've been in student status since ${input.firstYearInStatus}, were in the U.S. for part of every calendar year since, and haven't chosen to be treated as a resident (for example, by filing jointly with a U.S. citizen spouse). Confirm your status with the residency checker.`,
  });

  if (!withinExemptYears) {
    out.result = "not_exempt";
    out.reasons.push(
      `${input.taxYear} is your year ${yearsBefore + 1} in student status. After 5 calendar years most students become resident aliens for tax, and the nonresident FICA exemption no longer applies.`,
    );
    out.flags.push({
      code: "student_fica_exception",
      message:
        "Resident students can still be exempt on wages from their own school if they're enrolled at least half-time and the job is incidental to their studies (the student FICA exception). Off-campus jobs and OPT employers don't qualify.",
    });
    return out;
  }

  if (input.visa === "m1" && (input.job === "on_campus" || input.job === "cpt")) {
    out.result = "not_exempt";
    out.reasons.push(
      "M-1 students can generally only work in practical training after finishing their program, not on campus or in CPT. The exemption covers only work USCIS allows, so talk to your school's international office about this job.",
    );
    return out;
  }

  if (input.job === "unauthorized") {
    out.result = "not_exempt";
    out.reasons.push(
      "The exemption only covers work USCIS allows for your visa (on-campus jobs, CPT, OPT). Work outside those isn't exempt. Unauthorized work can also affect your visa, so talk to your international office.",
    );
    return out;
  }

  out.result = "exempt";
  if (input.job === "on_campus") {
    out.flags.push({
      code: "on_campus_hours",
      message:
        "On-campus work is covered for up to 20 hours a week while school is in session and 40 hours a week during summer vacation.",
    });
  }
  out.flags.push({
    code: "state_and_income_tax",
    message:
      "This covers only Social Security and Medicare. Federal and state income tax withholding are separate and are settled on your tax return.",
  });

  if (out.totalWithheld === 0) {
    out.reasons.push(
      `As a nonresident ${input.visa === "m1" ? "M-1" : input.visa === "f1" ? "F-1" : "J-1"} student doing ${jobLabel(input.job)}, you're exempt from Social Security and Medicare tax, and your employer withheld none. That's handled correctly.`,
    );
    return out;
  }

  out.refundEstimate = out.totalWithheld;
  out.reasons.push(
    `As a nonresident student doing ${jobLabel(input.job)} in your first 5 calendar years, you're exempt from Social Security and Medicare tax. Your W-2 shows ${formatUsd(out.totalWithheld)} withheld, which you can likely get back.`,
  );
  out.steps = [
    "Ask your employer's payroll office to refund the Social Security and Medicare tax withheld in error and correct your W-2. This is the fastest route.",
    "Ask payroll to stop withholding FICA on future paychecks.",
    "If the employer won't or can't refund all of it, file Form 843 (Claim for Refund) with Form 8316 and copies of your W-2, I-94, visa and I-20 or DS-2019 (plus your EAD card for OPT).",
    "Attach a letter from your employer saying how much they refunded, or that they won't refund it. If you can't get one, attach your own signed statement explaining why.",
    "Mail it to the IRS address in the Form 843 instructions, separately from your tax return. Keep copies of everything.",
    "Refund claims have a time limit (generally 3 years), so don't wait.",
  ];
  return out;
}

function jobLabel(job: FicaJob): string {
  return {
    on_campus: "on-campus work",
    cpt: "CPT",
    opt: "OPT",
    unauthorized: "this work",
  }[job];
}

export function formatUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
  });
}
