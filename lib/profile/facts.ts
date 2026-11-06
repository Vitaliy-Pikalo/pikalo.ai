/**
 * A signed-in user's saved answers, shared by every calculator so nobody
 * types their visa, arrival year or W-2 twice. Never holds SSNs, ITINs or
 * account numbers. Mirrors the user_facts table and its checks.
 */

import { z } from "zod";
import type { FicaJob, FicaVisa } from "@/lib/fica";
import type { ResidencyStatus } from "@/lib/residency";
import type { FilingStatus } from "@/lib/roth";

export const STATUS_KINDS = [
  "f1",
  "j1_student",
  "m1",
  "j1_scholar",
  "dependent",
  "h1b_other",
  "green_card",
  "citizen",
] as const;
export type StatusKind = (typeof STATUS_KINDS)[number];

export const STATUS_LABELS: Record<StatusKind, string> = {
  f1: "F-1 student",
  j1_student: "J-1 student",
  m1: "M-1 student",
  j1_scholar: "J-1 researcher, professor or trainee",
  dependent: "Dependent (F-2, J-2, M-2)",
  h1b_other: "H-1B or another work visa",
  green_card: "Green card holder",
  citizen: "U.S. citizen",
};

const money = (max: number) => z.coerce.number().min(0).max(max).nullable().optional();

const schema = z
  .object({
    status_kind: z.enum(STATUS_KINDS).nullable().optional(),
    first_year_in_status: z.coerce
      .number()
      .int()
      .min(1950)
      .max(2100)
      .nullable()
      .optional(),
    days_by_year: z
      .record(z.string().regex(/^\d{4}$/), z.coerce.number().int().min(0).max(366))
      .optional(),
    job: z.enum(["on_campus", "cpt", "opt", "unauthorized"]).nullable().optional(),
    w2_year: z.coerce.number().int().min(2000).max(2100).nullable().optional(),
    wages: money(10_000_000),
    ss_withheld: money(10_000_000),
    medicare_withheld: money(10_000_000),
    filing_status: z
      .enum([
        "single",
        "head_of_household",
        "married_joint",
        "married_separate",
        "qualifying_surviving_spouse",
      ])
      .nullable()
      .optional(),
    age_50_plus: z.boolean().nullable().optional(),
    compensation: money(100_000_000),
    magi: money(100_000_000),
    other_ira: money(100_000),
  })
  .strict();

export type Facts = z.infer<typeof schema>;

/** Validates and normalizes; unknown fields (e.g. an SSN) are rejected. */
export function parseFacts(input: unknown): Facts {
  return schema.parse(input);
}

export function mergeFacts(base: Facts, patch: Facts): Facts {
  return {
    ...base,
    ...patch,
    ...(patch.days_by_year || base.days_by_year
      ? { days_by_year: { ...base.days_by_year, ...patch.days_by_year } }
      : {}),
  };
}

export function toResidencyStatus(k: StatusKind): ResidencyStatus {
  if (k === "f1" || k === "j1_student" || k === "m1") return "student";
  if (k === "j1_scholar") return "teacher_trainee";
  if (k === "green_card" || k === "citizen") return k;
  return "other";
}

/** FICA exemptions only exist for nonimmigrant statuses. */
export function toFicaVisa(k: StatusKind): FicaVisa | null {
  return k === "green_card" || k === "citizen" ? null : k;
}

export type ToolState = "ready" | "missing" | "not_applicable";
export interface ToolReadiness {
  state: ToolState;
  missing: string[];
}

const daysLabel = (y: number) => `Days in the U.S. in ${y}`;
const ARRIVAL = "Year you first arrived on this visa";

export function readiness(
  f: Facts,
  taxYear: number,
): Record<"residency" | "fica" | "roth", ToolReadiness> {
  const has = (v: unknown) => v !== null && v !== undefined;
  const result = (missing: string[]): ToolReadiness => ({
    state: missing.length ? "missing" : "ready",
    missing,
  });

  const residencyMissing: string[] = [];
  if (!f.status_kind) residencyMissing.push("Your visa or status");
  for (const y of [taxYear, taxYear - 1, taxYear - 2]) {
    if (!has(f.days_by_year?.[String(y)])) residencyMissing.push(daysLabel(y));
  }
  const kind = f.status_kind ? toResidencyStatus(f.status_kind) : null;
  if (
    (kind === "student" || kind === "teacher_trainee") &&
    !has(f.first_year_in_status)
  ) {
    residencyMissing.push(ARRIVAL);
  }

  let fica: ToolReadiness;
  if (f.status_kind && !toFicaVisa(f.status_kind)) {
    fica = { state: "not_applicable", missing: [] };
  } else {
    const m: string[] = [];
    if (!f.status_kind) m.push("Your visa or status");
    if (!has(f.first_year_in_status)) m.push(ARRIVAL);
    if (!f.job) m.push("What kind of job you had");
    if (!has(f.wages)) m.push("W-2 wages");
    if (!has(f.ss_withheld)) m.push("Social Security withheld (W-2 box 4)");
    if (!has(f.medicare_withheld)) m.push("Medicare withheld (W-2 box 6)");
    fica = result(m);
  }

  const rothMissing: string[] = [];
  if (!f.filing_status) rothMissing.push("How you file your taxes");
  if (!has(f.age_50_plus)) rothMissing.push("Whether you're 50 or older");
  if (!has(f.compensation)) rothMissing.push("Your income from work");

  return { residency: result(residencyMissing), fica, roth: result(rothMissing) };
}

export type { FicaJob, FilingStatus };
