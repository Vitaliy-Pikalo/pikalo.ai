/**
 * Roth IRA contribution calculator (educational), 2026.
 *
 * Figures: IRS news release IR-2025-111 ("401(k) limit increases to $24,500
 * for 2026, IRA limit increases to $7,500").
 * Method: IRS Publication 590-A, Worksheet 2-2 (reduced Roth contribution):
 *   line 6  = lesser of the contribution limit and taxable compensation
 *   line 8  = line 6 − line 6 × (MAGI − lower) / (upper − lower),
 *             rounded UP to the next $10; at least $200 if more than $0
 *   line 10 = line 6 − traditional IRA contributions for the year
 *   limit   = lesser of line 8 and line 10
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
  /**
   * Married filing jointly: spouse's taxable compensation (minus the spouse's
   * own IRA contributions), which can also support your contribution.
   */
  spouseCompensation?: number;
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
  "Only compensation you pay tax on counts. Wages a tax treaty exempts don't count, and neither does investment income. Taxable fellowship or stipend payments (not for tuition) do count.",
  "IRS rules tie eligibility to taxable compensation, not citizenship, but many brokerages require an SSN and a U.S. address to open an account.",
  "Withdrawals after you leave the U.S. can be taxed differently, and your home country may tax the account. Check before contributing if you might move back.",
  "Contributions for 2026 are allowed until April 15, 2027. Filing extensions don't extend this.",
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

  const spouse =
    input.filingStatus === "married_joint"
      ? Math.max(0, input.spouseCompensation ?? 0)
      : 0;
  if (!Number.isFinite(spouse)) {
    out.reasons.push("Enter dollar amounts of 0 or more.");
    return out;
  }
  const compensation = input.taxableCompensation + spouse;

  if (compensation === 0) {
    out.result = "no_compensation";
    out.reasons.push(
      "You need taxable compensation (wages or self-employment income) to contribute. Wages exempt under a tax treaty don't count.",
    );
    return out;
  }

  const range = phaseOutRange(input.filingStatus, input.livedApartAllYear);
  out.phaseOutRange = range;
  const [lower, upper] = range;
  const magi = input.modifiedAgi;

  // Worksheet 2-2.
  const line6 = Math.min(limit, compensation);
  let line8: number;
  if (magi >= upper) {
    line8 = 0;
  } else if (magi <= lower) {
    line8 = line6;
  } else {
    line8 = roundUpTo10(line6 - (line6 * (magi - lower)) / (upper - lower));
    if (line8 > 0 && line8 < 200) line8 = 200;
  }

  if (line8 === 0) {
    out.result = "over_income";
    out.reasons.push(
      `Your modified AGI of ${usd(magi)} is at or above ${usd(upper)}, the 2026 cutoff for your filing status, so you can't contribute directly to a Roth IRA this year.`,
    );
    return out;
  }

  const other = input.otherIraContributions;
  const line10 = Math.max(0, line6 - other);
  const max = Math.min(line8, line10);
  out.maxContribution = max;

  if (max === limit) out.limitedBy = "none";
  else if (other > 0 && line10 <= line8) out.limitedBy = "other_contributions";
  else if (line8 < line6) out.limitedBy = "income";
  else out.limitedBy = "compensation";
  out.result = out.limitedBy === "none" ? "eligible" : "reduced";

  out.reasons.push(
    {
      none: `You can contribute up to ${usd(max)} to a Roth IRA for 2026.`,
      income: `Your income is inside the ${usd(lower)}–${usd(upper)} phase-out range, so your limit drops to ${usd(max)}.`,
      compensation: `You can't contribute more than your taxable compensation, so your limit is ${usd(max)}.`,
      other_contributions: `Traditional and Roth IRAs share one limit. After the ${usd(other)} you already put in a traditional IRA, ${usd(max)} is left.`,
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
