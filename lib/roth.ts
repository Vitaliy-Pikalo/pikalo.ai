/**
 * Roth IRA contribution calculator (educational), 2026.
 *
 * Figures: IRS news release IR-2025-111 ("401(k) limit increases to $24,500
 * for 2026, IRA limit increases to $7,500").
 * Method: IRS Publication 590-A, "Can You Contribute to a Roth IRA?" and its
 * reduced-contribution worksheet:
 *   reduction = limit × (MAGI − lower) / (upper − lower)
 *   allowed   = limit − reduction, rounded UP to the next $10,
 *               and at least $200 if it's more than $0.
 * Contributions also can't exceed taxable compensation, and every IRA
 * contribution (traditional + Roth) shares one annual limit.
 *
 * Pub 590-A: compensation excludes amounts you exclude from income, so wages
 * exempt under a tax treaty don't count.
 */

import type { Source } from "@/lib/residency";

export type FilingStatus =
  | "single"
  | "head_of_household"
  | "married_joint"
  | "married_separate"
  | "qualifying_surviving_spouse";

export const ROTH_2026 = {
  limit: 7_500,
  catchUp: 1_100,
  phaseOut: {
    single: [153_000, 168_000],
    married_joint: [242_000, 252_000],
    married_separate: [0, 10_000],
  },
} as const;

export interface RothInput {
  taxYear: number;
  filingStatus: FilingStatus;
  age50OrOlder: boolean;
  /** Taxable U.S. wages/self-employment income. Leave out treaty-exempt wages. */
  taxableCompensation: number;
  /** Modified AGI for Roth purposes (for most people, close to AGI). */
  modifiedAgi: number;
  /** Traditional IRA contributions already made for this year. */
  otherIraContributions: number;
  /** Married filing separately but lived apart from your spouse all year. */
  livedApartAllYear?: boolean;
}

export type RothResult =
  "eligible" | "reduced" | "over_income" | "no_compensation" | "invalid";

export interface RothOutput {
  result: RothResult;
  maxContribution: number;
  /** The full limit before income and compensation rules. */
  baseLimit: number;
  limitedBy: "none" | "income" | "compensation" | "other_contributions";
  phaseOutRange: readonly [number, number] | null;
  reasons: string[];
  notes: string[];
  sources: Source[];
}

export const ROTH_SOURCES: Source[] = [
  {
    title: "IRS: 2026 IRA and 401(k) limits (IR-2025-111)",
    url: "https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500",
  },
  {
    title: "IRS Publication 590-A, Contributions to IRAs",
    url: "https://www.irs.gov/publications/p590a",
  },
];

export const ROTH_NOTES = [
  "On a visa, only taxable U.S. compensation counts. Wages exempt under a tax treaty, scholarships that pay only tuition, and investment income don't.",
  "Nonresident aliens aren't barred from Roth IRAs, but many brokerages require an SSN and U.S. address to open one.",
  "Withdrawals after you leave the U.S. can be taxed differently, and your home country may tax the account. Check before contributing if you might move back.",
  "Contributions for 2026 are allowed until the April 2027 tax deadline.",
];

const roundUpTo10 = (n: number) => Math.ceil(n / 10) * 10;

export function phaseOutRange(
  status: FilingStatus,
  livedApartAllYear = false,
): readonly [number, number] {
  if (status === "married_joint" || status === "qualifying_surviving_spouse") {
    return ROTH_2026.phaseOut.married_joint;
  }
  if (status === "married_separate" && !livedApartAllYear) {
    return ROTH_2026.phaseOut.married_separate;
  }
  return ROTH_2026.phaseOut.single;
}

export function checkRoth(input: RothInput): RothOutput {
  const out: RothOutput = {
    result: "invalid",
    maxContribution: 0,
    baseLimit: 0,
    limitedBy: "none",
    phaseOutRange: null,
    reasons: [],
    notes: ROTH_NOTES,
    sources: ROTH_SOURCES,
  };

  if (input.taxYear !== 2026) {
    out.reasons.push("This calculator uses 2026 IRS limits only.");
    return out;
  }
  const amounts = [
    input.taxableCompensation,
    input.modifiedAgi,
    input.otherIraContributions,
  ];
  if (amounts.some((n) => !Number.isFinite(n) || n < 0)) {
    out.reasons.push("Enter dollar amounts of 0 or more.");
    return out;
  }

  const limit = ROTH_2026.limit + (input.age50OrOlder ? ROTH_2026.catchUp : 0);
  out.baseLimit = limit;

  if (input.taxableCompensation === 0) {
    out.result = "no_compensation";
    out.reasons.push(
      "You need taxable U.S. compensation (wages or self-employment income) to contribute. Wages exempt under a tax treaty don't count.",
    );
    return out;
  }

  const range = phaseOutRange(input.filingStatus, input.livedApartAllYear);
  out.phaseOutRange = range;
  const [lower, upper] = range;
  const magi = input.modifiedAgi;

  let incomeLimit: number;
  if (magi >= upper) {
    incomeLimit = 0;
  } else if (magi <= lower) {
    incomeLimit = limit;
  } else {
    const reduction = (limit * (magi - lower)) / (upper - lower);
    incomeLimit = roundUpTo10(limit - reduction);
    if (incomeLimit > 0 && incomeLimit < 200) incomeLimit = 200;
  }

  if (incomeLimit === 0) {
    out.result = "over_income";
    out.reasons.push(
      `Your modified AGI of ${usd(magi)} is at or above ${usd(upper)}, the 2026 cutoff for your filing status, so you can't contribute directly to a Roth IRA this year.`,
    );
    return out;
  }

  // Traditional IRA contributions come out of whichever cap applies.
  const other = input.otherIraContributions;
  const candidates: [number, RothOutput["limitedBy"]][] = [
    [
      Math.max(0, incomeLimit - other),
      incomeLimit < limit ? "income" : "other_contributions",
    ],
    [Math.max(0, input.taxableCompensation - other), "compensation"],
  ];
  const [max, by] = candidates.reduce((a, b) => (b[0] < a[0] ? b : a));
  out.maxContribution = max;
  out.limitedBy = max === limit ? "none" : by;
  out.result = out.limitedBy === "none" ? "eligible" : "reduced";

  out.reasons.push(
    {
      none: `You can contribute up to ${usd(max)} to a Roth IRA for 2026.`,
      income: `Your income is inside the ${usd(lower)}–${usd(upper)} phase-out range, so your limit drops to ${usd(max)}.`,
      compensation: `You can't contribute more than your taxable compensation, so your limit is ${usd(max)}.`,
      other_contributions: `Traditional and Roth IRAs share one ${usd(limit)} limit. After the ${usd(input.otherIraContributions)} you already put in a traditional IRA, ${usd(max)} is left.`,
    }[out.limitedBy],
  );
  return out;
}

function usd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
