"use client";

import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { deleteFacts, saveFacts } from "@/app/account/actions";
import {
  readiness,
  STATUS_KINDS,
  STATUS_LABELS,
  toFicaVisa,
  type Facts,
  type StatusKind,
} from "@/lib/profile/facts";

const TOOLS = [
  {
    key: "residency",
    name: "Residency",
    href: "/check",
    what: "Resident or nonresident",
  },
  {
    key: "fica",
    name: "FICA refund",
    href: "/fica",
    what: "Social Security and Medicare refund",
  },
  { key: "roth", name: "Roth IRA", href: "/roth", what: "How much you can put in" },
] as const;

const JOBS = [
  ["on_campus", "On-campus job"],
  ["cpt", "CPT (curricular practical training)"],
  ["opt", "OPT (optional practical training)"],
  ["unauthorized", "Not sure it was authorized"],
] as const;

const FILING = [
  ["single", "Single"],
  ["head_of_household", "Head of household"],
  ["married_joint", "Married filing jointly"],
  ["married_separate", "Married filing separately"],
  ["qualifying_surviving_spouse", "Qualifying surviving spouse"],
] as const;

const field =
  "mt-1 w-full rounded-md border border-field-line bg-surface px-3 py-2 text-base text-ink";
const num = (s: string) => (s.trim() === "" ? null : Number(s));
const str = (n: number | null | undefined) =>
  n === null || n === undefined ? "" : String(n);

function Step({
  n,
  id,
  title,
  why,
  usedBy,
  onSave,
  children,
}: {
  n: number;
  id: string;
  title: string;
  why: string;
  usedBy: string;
  onSave: () => Promise<string | null>;
  children: ReactNode;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("saving");
    const err = await onSave();
    if (err) {
      setError(err);
      setState("error");
    } else setState("saved");
  }
  return (
    <form
      aria-labelledby={`${id}-title`}
      onSubmit={submit}
      onChange={() => state === "saved" && setState("idle")}
      className="rounded-lg border border-line bg-surface p-5"
    >
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-sm text-slate">{n}</span>
        <h2 id={`${id}-title`} className="text-lg font-semibold">
          {title}
        </h2>
      </div>
      <p className="mt-1 text-sm text-slate">
        {why} <span className="font-semibold">Used by: {usedBy}.</span>
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={state === "saving"}
          className="rounded-md bg-ink px-4 py-2 font-semibold text-surface disabled:opacity-50"
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        <span role="status" className="text-sm">
          {state === "saved" && <span className="text-stamp">Saved</span>}
          {state === "error" && <span className="text-amber">{error}</span>}
        </span>
      </div>
    </form>
  );
}

export default function ProfileGuide({
  initialFacts,
  taxYear,
}: {
  initialFacts: Facts;
  taxYear: number;
}) {
  const [facts, setFacts] = useState<Facts>(initialFacts);
  const ready = readiness(facts, taxYear);
  const years = [taxYear, taxYear - 1, taxYear - 2];

  // Drafts for each step (strings, so empty fields stay empty).
  const [status, setStatus] = useState<string>(facts.status_kind ?? "");
  const [arrival, setArrival] = useState(str(facts.first_year_in_status));
  const [days, setDays] = useState<Record<string, string>>(
    Object.fromEntries(years.map((y) => [y, str(facts.days_by_year?.[String(y)])])),
  );
  const [job, setJob] = useState<string>(facts.job ?? "");
  const [wages, setWages] = useState(str(facts.wages));
  const [ss, setSs] = useState(str(facts.ss_withheld));
  const [med, setMed] = useState(str(facts.medicare_withheld));
  const [filing, setFiling] = useState<string>(facts.filing_status ?? "");
  const [age50, setAge50] = useState<string>(
    facts.age_50_plus === undefined || facts.age_50_plus === null
      ? ""
      : String(facts.age_50_plus),
  );
  const [comp, setComp] = useState(str(facts.compensation));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleted, setDeleted] = useState(false);

  async function save(patch: Facts) {
    const r = await saveFacts(patch);
    if (!r.ok) return r.error;
    setFacts(r.facts);
    setDeleted(false);
    return null;
  }

  const kind = (status || null) as StatusKind | null;
  const needsArrival = kind !== "green_card" && kind !== "citizen";
  const ficaApplies = !kind || toFicaVisa(kind) !== null;

  return (
    <div className="space-y-8">
      <div className="grid gap-3 sm:grid-cols-3">
        {TOOLS.map((t) => {
          const r = ready[t.key];
          return (
            <section
              key={t.key}
              aria-labelledby={`tool-${t.key}`}
              className="rounded-lg border border-line bg-surface p-4"
            >
              <h2 id={`tool-${t.key}`} className="font-semibold">
                {t.name}
              </h2>
              <p className="text-sm text-slate">{t.what}</p>
              {r.state === "ready" && (
                <Link
                  href={t.href}
                  className="mt-3 inline-block rounded-md bg-stamp px-3 py-1.5 text-sm font-semibold text-surface"
                >
                  Open with your answers
                </Link>
              )}
              {r.state === "missing" && (
                <div className="mt-3 text-sm">
                  <p className="font-semibold">Still needs:</p>
                  <ul className="mt-1 list-disc pl-5 text-slate">
                    {r.missing.map((m) => (
                      <li key={m}>{m}</li>
                    ))}
                  </ul>
                </div>
              )}
              {r.state === "not_applicable" && (
                <p className="mt-3 text-sm text-slate">
                  Doesn&apos;t apply to green card holders or citizens: you pay these
                  taxes like everyone else.
                </p>
              )}
            </section>
          );
        })}
      </div>

      <Step
        n={1}
        id="status"
        title="Your visa or status"
        why="Your status decides which tax rules apply to you, and whether Social Security and Medicare should be taken from your pay."
        usedBy="Residency, FICA refund"
        onSave={() =>
          save({
            status_kind: (status || null) as StatusKind | null,
            ...(needsArrival ? { first_year_in_status: num(arrival) } : {}),
          })
        }
      >
        <label className="block">
          <span className="font-semibold">Status</span>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className={field}
          >
            <option value="">Choose…</option>
            {STATUS_KINDS.map((k) => (
              <option key={k} value={k}>
                {STATUS_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {needsArrival && (
          <label className="block">
            <span className="font-semibold">Year you first arrived on this visa</span>
            <input
              inputMode="numeric"
              value={arrival}
              onChange={(e) => setArrival(e.target.value)}
              placeholder="e.g. 2024"
              className={field}
            />
          </label>
        )}
      </Step>

      <Step
        n={2}
        id="days"
        title="Days in the U.S."
        why="The IRS counts the days you were physically here this year and the two years before to decide if you're a resident for tax purposes. Your passport stamps or I-94 history have these."
        usedBy="Residency"
        onSave={() =>
          save({
            days_by_year: Object.fromEntries(
              years
                .filter((y) => days[y]?.trim())
                .map((y) => [String(y), Number(days[y])]),
            ),
          })
        }
      >
        {years.map((y) => (
          <label key={y} className="block">
            <span className="font-semibold">{y}</span>
            <input
              inputMode="numeric"
              value={days[y] ?? ""}
              onChange={(e) => setDays({ ...days, [y]: e.target.value })}
              placeholder="0–366"
              className={field}
            />
          </label>
        ))}
      </Step>

      {ficaApplies && (
        <Step
          n={3}
          id="w2"
          title="Your job and W-2"
          why="Many student jobs are exempt from Social Security and Medicare, but payroll takes it anyway. Your W-2 (or last pay stub) shows what was withheld."
          usedBy="FICA refund"
          onSave={() =>
            save({
              job: (job || null) as Facts["job"],
              w2_year: taxYear,
              wages: num(wages),
              ss_withheld: num(ss),
              medicare_withheld: num(med),
            })
          }
        >
          <label className="block sm:col-span-2">
            <span className="font-semibold">What kind of job</span>
            <select
              value={job}
              onChange={(e) => setJob(e.target.value)}
              className={field}
            >
              <option value="">Choose…</option>
              {JOBS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="font-semibold">Wages ($, W-2 box 3)</span>
            <input
              inputMode="decimal"
              value={wages}
              onChange={(e) => setWages(e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            <span className="font-semibold">Social Security withheld ($, box 4)</span>
            <input
              inputMode="decimal"
              value={ss}
              onChange={(e) => setSs(e.target.value)}
              className={field}
            />
          </label>
          <label className="block">
            <span className="font-semibold">Medicare withheld ($, box 6)</span>
            <input
              inputMode="decimal"
              value={med}
              onChange={(e) => setMed(e.target.value)}
              className={field}
            />
          </label>
        </Step>
      )}

      <Step
        n={ficaApplies ? 4 : 3}
        id="roth"
        title="Retirement savings"
        why="Roth IRA limits depend on how you file and how much you earn."
        usedBy="Roth IRA"
        onSave={() =>
          save({
            filing_status: (filing || null) as Facts["filing_status"],
            age_50_plus: age50 === "" ? null : age50 === "true",
            compensation: num(comp),
          })
        }
      >
        <label className="block">
          <span className="font-semibold">How you file</span>
          <select
            value={filing}
            onChange={(e) => setFiling(e.target.value)}
            className={field}
          >
            <option value="">Choose…</option>
            {FILING.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="font-semibold">50 or older by the end of {taxYear}?</span>
          <select
            value={age50}
            onChange={(e) => setAge50(e.target.value)}
            className={field}
          >
            <option value="">Choose…</option>
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        </label>
        <label className="block">
          <span className="font-semibold">Income from work ($ per year)</span>
          <input
            inputMode="decimal"
            value={comp}
            onChange={(e) => setComp(e.target.value)}
            className={field}
          />
        </label>
      </Step>

      <section aria-labelledby="your-data" className="border-t border-line pt-6 text-sm">
        <h2 id="your-data" className="font-semibold">
          Your data
        </h2>
        <p className="mt-1 max-w-[65ch] text-slate">
          Only you can see these answers. Pikalo never asks for your SSN, ITIN or bank
          details.
        </p>
        {deleted ? (
          <p role="status" className="mt-3 text-stamp">
            Your saved answers were deleted.
          </p>
        ) : !confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="mt-3 underline underline-offset-2"
          >
            Delete my saved answers
          </button>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span>This removes everything above. Continue?</span>
            <button
              type="button"
              onClick={async () => {
                const r = await deleteFacts();
                if (r.ok) {
                  setFacts({});
                  setDeleted(true);
                }
                setConfirmDelete(false);
              }}
              className="rounded-md bg-ink px-3 py-1.5 font-semibold text-surface"
            >
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="underline"
            >
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
