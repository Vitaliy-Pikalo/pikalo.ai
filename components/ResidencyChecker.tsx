"use client";

import { useId, useState } from "react";
import {
  checkResidency,
  daysInYear,
  formatDays,
  type ResidencyStatus,
} from "@/lib/residency";
import SaveBar from "@/components/SaveBar";
import { toResidencyStatus, type Facts, type StatusKind } from "@/lib/profile/facts";

const STATUS_OPTIONS: { value: ResidencyStatus; label: string; hint: string }[] = [
  { value: "student", label: "Student", hint: "F-1, J-1 student, M-1 or Q" },
  {
    value: "teacher_trainee",
    label: "Teacher, researcher or trainee",
    hint: "J-1 or Q, not a student",
  },
  { value: "other", label: "Work or other visa", hint: "H-1B, L-1, O-1, TN, B-1/B-2" },
  { value: "green_card", label: "Green card holder", hint: "Lawful permanent resident" },
  { value: "citizen", label: "U.S. citizen", hint: "" },
];

// Update each January when a new filing season starts.
const DEFAULT_TAX_YEAR = 2026;
const TAX_YEARS = [2026, 2025, 2024];

/** Empty → 0; whole digits only (rejects "1e2", "0x1F", "-3", "4.5"). */
function toInt(value: string): number {
  const v = value.trim();
  if (v === "") return 0;
  return /^\d+$/.test(v) ? Number(v) : NaN;
}

// Saving a calculator choice back: the residency groups are broader than visas,
// so keep the saved visa when it still fits and pick the common one otherwise.
const KIND_FOR: Record<ResidencyStatus, StatusKind> = {
  student: "f1",
  teacher_trainee: "j1_scholar",
  other: "h1b_other",
  green_card: "green_card",
  citizen: "citizen",
};

const savedDays = (f: Facts, y: number) => {
  const v = f.days_by_year?.[String(y)];
  return v === undefined ? "" : String(v);
};

export default function ResidencyChecker({
  initial = {},
  signedIn,
}: {
  initial?: Facts;
  signedIn?: boolean;
}) {
  const id = useId();
  const [taxYear, setTaxYear] = useState(DEFAULT_TAX_YEAR);
  const [status, setStatus] = useState<ResidencyStatus>(
    initial.status_kind ? toResidencyStatus(initial.status_kind) : "student",
  );
  const [days, setDays] = useState({
    current: savedDays(initial, DEFAULT_TAX_YEAR),
    prior1: savedDays(initial, DEFAULT_TAX_YEAR - 1),
    prior2: savedDays(initial, DEFAULT_TAX_YEAR - 2),
  });
  const [firstYear, setFirstYear] = useState(
    String(initial.first_year_in_status ?? DEFAULT_TAX_YEAR - 1),
  );
  const [priorHistory, setPriorHistory] = useState(false);
  const [foreignEmployer, setForeignEmployer] = useState(false);
  const [statusChanged, setStatusChanged] = useState(false);

  const needsFirstYear = status === "student" || status === "teacher_trainee";
  const needsDays = status !== "citizen" && status !== "green_card";

  const output = checkResidency({
    taxYear,
    status,
    daysCurrent: toInt(days.current),
    daysPrior1: toInt(days.prior1),
    daysPrior2: toInt(days.prior2),
    firstYearInStatus:
      needsFirstYear && firstYear.trim() !== "" ? toInt(firstYear) : undefined,
    priorExemptHistory: needsFirstYear ? priorHistory : undefined,
    foreignEmployer: status === "teacher_trainee" ? foreignEmployer : undefined,
    statusChanged: needsDays ? statusChanged : undefined,
  });

  // Don't show a verdict until the current-year days are filled in.
  const awaitingInput = needsDays && days.current.trim() === "";
  const invalid = output.result === "invalid";

  const dayFields = [
    { key: "current" as const, year: taxYear },
    { key: "prior1" as const, year: taxYear - 1 },
    { key: "prior2" as const, year: taxYear - 2 },
  ];

  const inputClass =
    "mt-1 w-full rounded-md border border-field-line bg-surface px-3 py-2 text-base text-ink tabular-nums placeholder:text-slate/60";

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <form className="space-y-7" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend className="font-semibold">What was your status in {taxYear}?</legend>
          <div className="mt-3 space-y-2">
            {STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-baseline gap-3 rounded-md border px-3 py-2.5 ${
                  status === opt.value ? "border-ink bg-surface" : "border-line"
                }`}
              >
                <input
                  type="radio"
                  name={`${id}-status`}
                  value={opt.value}
                  checked={status === opt.value}
                  onChange={() => setStatus(opt.value)}
                  className="accent-[var(--ink)]"
                />
                <span>
                  <span className="font-medium">{opt.label}</span>
                  {opt.hint && (
                    <span className="ml-2 text-sm text-slate">{opt.hint}</span>
                  )}
                </span>
              </label>
            ))}
          </div>
          <p className="mt-2 text-sm text-slate">
            On an F-2, J-2, M-2 or Q-3 dependent visa? Pick the same option as the main
            visa holder.
          </p>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="font-semibold">Tax year</span>
            <select
              className={inputClass}
              value={taxYear}
              onChange={(e) => setTaxYear(Number(e.target.value))}
            >
              {TAX_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          {needsFirstYear && (
            <label className="block">
              <span className="font-semibold">First year in the U.S. on this visa</span>
              <input
                inputMode="numeric"
                className={inputClass}
                value={firstYear}
                onChange={(e) => setFirstYear(e.target.value)}
                aria-invalid={invalid || undefined}
                aria-describedby={`${id}-first-hint${invalid ? ` ${id}-result` : ""}`}
              />
              <span id={`${id}-first-hint`} className="mt-1 block text-sm text-slate">
                Arriving in August still counts that whole year.
              </span>
            </label>
          )}
        </div>

        {needsDays && (
          <div className="space-y-3">
            <Checkbox checked={statusChanged} onChange={setStatusChanged}>
              My visa type changed between {taxYear - 2} and {taxYear} (for example, F-1
              to H-1B)
            </Checkbox>
            {needsFirstYear && (
              <Checkbox checked={priorHistory} onChange={setPriorHistory}>
                {status === "student"
                  ? "I was in the U.S. as a teacher, researcher or trainee before becoming a student"
                  : "I was in the U.S. on an F, J, M or Q visa before this one"}
              </Checkbox>
            )}
            {status === "teacher_trainee" && (
              <Checkbox checked={foreignEmployer} onChange={setForeignEmployer}>
                An employer outside the U.S. has paid all of my compensation every year
                I&apos;ve been here
              </Checkbox>
            )}
          </div>
        )}

        {status !== "citizen" && status !== "green_card" && (
          <fieldset>
            <legend className="font-semibold">
              Days you were physically in the U.S.
            </legend>
            <p className="mt-1 text-sm text-slate">
              Any part of a day counts as a full day. Check your I-94 travel history if
              you&apos;re unsure.
            </p>
            <div className="mt-3 grid grid-cols-3 gap-3">
              {dayFields.map(({ key, year }) => (
                <label key={key} className="block">
                  <span className="text-sm font-medium">{year}</span>
                  <input
                    inputMode="numeric"
                    placeholder="0"
                    className={inputClass}
                    value={days[key]}
                    aria-invalid={invalid || undefined}
                    aria-describedby={invalid ? `${id}-result` : undefined}
                    aria-label={`Days in the U.S. in ${year} (up to ${daysInYear(year)})`}
                    onChange={(e) => setDays((d) => ({ ...d, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <SaveBar
          signedIn={signedIn}
          prefilled={Object.keys(initial).length > 0}
          from="/check"
          patch={{
            status_kind:
              initial.status_kind && toResidencyStatus(initial.status_kind) === status
                ? initial.status_kind
                : KIND_FOR[status],
            ...(needsFirstYear && /^\d{4}$/.test(firstYear.trim())
              ? { first_year_in_status: Number(firstYear) }
              : {}),
            ...(needsDays
              ? {
                  days_by_year: Object.fromEntries(
                    dayFields
                      .filter((f) => /^\d+$/.test(days[f.key].trim()))
                      .map((f) => [String(f.year), Number(days[f.key])]),
                  ),
                }
              : {}),
          }}
        />
      </form>

      {awaitingInput ? (
        <section className="lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg border border-dashed border-field-line px-5 py-6 text-slate">
            Enter your days in the U.S. for {taxYear} to see your result.
          </div>
        </section>
      ) : (
        <Result
          output={output}
          taxYear={taxYear}
          status={status}
          resultId={`${id}-result`}
        />
      )}
    </div>
  );
}

function Result({
  output,
  taxYear,
  status,
  resultId,
}: {
  output: ReturnType<typeof checkResidency>;
  taxYear: number;
  status: ResidencyStatus;
  resultId: string;
}) {
  const verdict = {
    resident: {
      title: `Likely a resident alien for ${taxYear}`,
      body: "You'd generally file Form 1040 and report worldwide income, like a U.S. citizen.",
      tone: "border-stamp bg-stamp-soft",
    },
    nonresident: {
      title: `Likely a nonresident alien for ${taxYear}`,
      body:
        status === "student" || status === "teacher_trainee"
          ? "File Form 8843 even if you had no income. If you had U.S. wages or other taxable U.S. income, you'd also generally file Form 1040-NR. Most mainstream tax software only handles resident returns."
          : "If you had U.S. wages or other taxable U.S. income, you'd generally file Form 1040-NR. Most mainstream tax software only handles resident returns.",
      tone: "border-ink bg-surface",
    },
    needs_review: {
      title: "Your days need to be split by status",
      body: "",
      tone: "border-amber bg-amber-soft",
    },
    citizen: {
      title: "Residency tests don't apply to citizens",
      body: "U.S. citizens file Form 1040 and report worldwide income.",
      tone: "border-line bg-surface",
    },
    invalid: {
      title: "Check your entries",
      body: "",
      tone: "border-amber bg-amber-soft",
    },
  }[output.result];

  const showMeter =
    output.test === "substantial_presence" && output.result !== "needs_review";

  return (
    <section className="lg:sticky lg:top-6 lg:self-start">
      {/* Announce only the short verdict, not the whole panel, on each change. */}
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {verdict.title}
      </p>
      <div id={resultId} className={`rounded-lg border-l-4 px-5 py-4 ${verdict.tone}`}>
        <h2 className="text-xl font-bold tracking-tight">{verdict.title}</h2>
        {verdict.body && <p className="mt-2 leading-relaxed">{verdict.body}</p>}
        {output.result !== "citizen" && (
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed">
            {output.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      {showMeter && <DayMeter output={output} taxYear={taxYear} />}

      {output.flags.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold">Things this result doesn&apos;t cover</h3>
          <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate">
            {output.flags.map((f) => (
              <li key={f.code} className="border-l-2 border-amber pl-3">
                {f.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-6 text-sm text-slate">
        Rules from{" "}
        {output.sources.map((s, i) => (
          <span key={s.url}>
            {i > 0 && " and "}
            <a className="underline underline-offset-2 hover:text-ink" href={s.url}>
              {s.title}
            </a>
          </span>
        ))}
        .{" "}
        {status === "student" || status === "teacher_trainee"
          ? "Your school's international office can confirm your status."
          : ""}
      </p>
    </section>
  );
}

/** Stacked bar of weighted days against the 183-day threshold. */
function DayMeter({
  output,
  taxYear,
}: {
  output: ReturnType<typeof checkResidency>;
  taxYear: number;
}) {
  const { current, prior1, prior2 } = output.countedDays;
  const parts = [
    { label: `${taxYear}`, detail: "every day", value: current, color: "bg-meter-1" },
    {
      label: `${taxYear - 1}`,
      detail: "⅓ of days",
      value: prior1 / 3,
      color: "bg-meter-2",
    },
    {
      label: `${taxYear - 2}`,
      detail: "⅙ of days",
      value: prior2 / 6,
      color: "bg-meter-3",
    },
  ];
  // Scale so 183 sits at 61% of the bar; totals above 300 fill the bar.
  const scale = 300;
  const pct = (v: number) => Math.min(100, (v / scale) * 100);
  const thresholdPct = (183 / scale) * 100;

  return (
    <figure className="mt-6">
      <figcaption className="flex items-baseline justify-between">
        <span className="font-semibold">Weighted days</span>
        <span className="text-3xl font-bold tracking-tight tabular-nums">
          {formatDays(output.weightedDays)}
          <span className="ml-1 text-base font-medium text-slate">/ 183</span>
        </span>
      </figcaption>
      <div
        className="relative mt-3 h-6 w-full overflow-hidden rounded-sm bg-line/60"
        role="img"
        aria-label={`${formatDays(output.weightedDays)} weighted days out of 183 needed`}
      >
        <div className="flex h-full">
          {parts.map((p) => (
            <div
              key={p.label}
              className={`${p.color} h-full transition-[width] duration-300`}
              style={{ width: `${pct(p.value)}%` }}
            />
          ))}
        </div>
        <div
          className="absolute inset-y-0 w-0.5 bg-amber"
          style={{ left: `${thresholdPct}%` }}
          aria-hidden
        />
      </div>
      <div className="relative mt-1 h-5 text-xs text-amber" aria-hidden>
        <span className="absolute -translate-x-1/2" style={{ left: `${thresholdPct}%` }}>
          183
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        {parts.map((p) => (
          <div key={p.label}>
            <dt className="flex items-center gap-2">
              <span className={`inline-block size-2.5 rounded-sm ${p.color}`} />
              {p.label}
            </dt>
            <dd className="mt-0.5 text-slate">
              {formatDays(p.value)} <span className="text-xs">({p.detail})</span>
            </dd>
          </div>
        ))}
      </dl>
      {(output.exemptYears.current ||
        output.exemptYears.prior1 ||
        output.exemptYears.prior2) && (
        <p className="mt-3 text-sm text-slate">
          Exempt years count as 0:{" "}
          {[
            output.exemptYears.current && taxYear,
            output.exemptYears.prior1 && taxYear - 1,
            output.exemptYears.prior2 && taxYear - 2,
          ]
            .filter(Boolean)
            .join(", ")}
          .
        </p>
      )}
    </figure>
  );
}

function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 accent-[var(--ink)]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{children}</span>
    </label>
  );
}
