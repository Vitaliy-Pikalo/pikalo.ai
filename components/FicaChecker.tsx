"use client";

import { useId, useState } from "react";
import Link from "next/link";
import RefundPacket from "@/components/RefundPacket";
import { checkFica, formatUsd, type FicaJob, type FicaVisa } from "@/lib/fica";
import {
  Checkbox,
  inputClass,
  MoneyField,
  NoteList,
  parseMoney,
  parseWhole,
  Placeholder,
  RadioGroup,
  Sources,
  Verdict,
} from "@/components/ui";

// Update each January when a new filing season starts.
const TAX_YEARS = [2026, 2025, 2024];

const VISAS: { value: FicaVisa; label: string; hint?: string }[] = [
  { value: "f1", label: "F-1 student" },
  { value: "j1_student", label: "J-1 student" },
  { value: "m1", label: "M-1 student" },
  { value: "j1_scholar", label: "J-1 researcher, professor or trainee" },
  { value: "dependent", label: "Dependent visa", hint: "F-2, J-2, M-2" },
  { value: "h1b_other", label: "Work visa or green card", hint: "H-1B, L-1, O-1, TN" },
];

const JOBS: { value: FicaJob; label: string; hint?: string }[] = [
  { value: "opt", label: "OPT, STEM OPT or practical training" },
  { value: "cpt", label: "CPT internship" },
  { value: "on_campus", label: "On-campus job", hint: "TA, RA, dining, library" },
  { value: "unauthorized", label: "Something else", hint: "not approved for my visa" },
];

export default function FicaChecker() {
  const id = useId();
  const [taxYear, setTaxYear] = useState(2026);
  const [visa, setVisa] = useState<FicaVisa>("f1");
  const [job, setJob] = useState<FicaJob>("opt");
  const [firstYear, setFirstYear] = useState("2025");
  const [wages, setWages] = useState("");
  const [ss, setSs] = useState("");
  const [medicare, setMedicare] = useState("");
  const [statusChanged, setStatusChanged] = useState(false);

  const isStudent = visa === "f1" || visa === "j1_student" || visa === "m1";
  const output = checkFica({
    taxYear,
    visa,
    job,
    firstYearInStatus: parseWhole(firstYear, NaN),
    wages: parseMoney(wages),
    socialSecurityWithheld: parseMoney(ss),
    medicareWithheld: parseMoney(medicare),
    statusChanged,
  });
  const awaiting = isStudent && ss.trim() === "" && medicare.trim() === "";

  return (
    <>
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <form className="space-y-7" onSubmit={(e) => e.preventDefault()}>
          <RadioGroup
            legend={`Your visa in ${taxYear}`}
            name={`${id}-visa`}
            value={visa}
            onChange={setVisa}
            options={VISAS}
          />

          {isStudent && (
            <>
              <RadioGroup
                legend="What kind of job?"
                name={`${id}-job`}
                value={job}
                onChange={setJob}
                options={JOBS}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="font-semibold">Tax year</span>
                  <select
                    className={inputClass}
                    value={taxYear}
                    onChange={(e) => setTaxYear(Number(e.target.value))}
                  >
                    {TAX_YEARS.map((y) => (
                      <option key={y}>{y}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="font-semibold">
                    First year in the U.S. as a student
                  </span>
                  <input
                    inputMode="numeric"
                    className={inputClass}
                    value={firstYear}
                    onChange={(e) => setFirstYear(e.target.value)}
                  />
                </label>
              </div>

              <fieldset className="space-y-4">
                <legend className="font-semibold">From your W-2</legend>
                <p className="-mt-2 text-sm text-slate">
                  Your employer sends this by January 31. Leave a box empty if it&apos;s
                  blank.
                </p>
                <MoneyField
                  id={`${id}-wages`}
                  label="Box 3 · Social Security wages"
                  value={wages}
                  onChange={setWages}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <MoneyField
                    id={`${id}-ss`}
                    label="Box 4 · Social Security tax withheld"
                    value={ss}
                    onChange={setSs}
                  />
                  <MoneyField
                    id={`${id}-med`}
                    label="Box 6 · Medicare tax withheld"
                    value={medicare}
                    onChange={setMedicare}
                  />
                </div>
              </fieldset>

              <Checkbox checked={statusChanged} onChange={setStatusChanged}>
                My visa type changed during {taxYear} (for example, OPT to H-1B)
              </Checkbox>
            </>
          )}
        </form>

        <section className="lg:sticky lg:top-6 lg:self-start">
          {awaiting ? (
            <Placeholder>
              Enter boxes 4 and 6 from your W-2 to see if you&apos;re owed money.
            </Placeholder>
          ) : (
            <FicaResultView output={output} />
          )}
        </section>
      </div>
      {!awaiting && output.result === "exempt" && output.refundEstimate > 0 && (
        <div className="mt-4">
          <RefundPacket
            taxYear={taxYear}
            visaLabel={VISA_LABEL[visa]}
            jobLabel={JOB_LABEL[job]}
            socialSecurityWithheld={parseMoney(ss)}
            medicareWithheld={parseMoney(medicare)}
          />
        </div>
      )}
    </>
  );
}

const VISA_LABEL: Record<FicaVisa, string> = {
  f1: "F-1",
  j1_student: "J-1",
  m1: "M-1",
  j1_scholar: "J-1",
  dependent: "dependent",
  h1b_other: "work",
};

const JOB_LABEL: Record<FicaJob, string> = {
  opt: "OPT",
  cpt: "CPT",
  on_campus: "on-campus work",
  unauthorized: "work",
};

function FicaResultView({ output }: { output: ReturnType<typeof checkFica> }) {
  const view = {
    exempt:
      output.refundEstimate > 0
        ? { title: "You may be owed this back", tone: "good" as const }
        : { title: "You're exempt, and nothing was withheld", tone: "good" as const },
    not_exempt: {
      title: "Social Security and Medicare apply to you",
      tone: "neutral" as const,
    },
    needs_review: { title: "This needs a closer look", tone: "warn" as const },
    invalid: { title: "Check your entries", tone: "warn" as const },
  }[output.result];

  return (
    <>
      <Verdict title={view.title} tone={view.tone}>
        {output.result === "exempt" && output.refundEstimate > 0 && (
          <p className="mt-2 text-5xl font-bold tracking-tight tabular-nums">
            {formatUsd(output.refundEstimate)}
          </p>
        )}
        <ul className="mt-3 space-y-1.5 text-sm leading-relaxed">
          {output.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Verdict>

      {output.steps.length > 0 && (
        <div className="mt-6">
          <h3 className="font-semibold">How to get it back</h3>
          <ol className="mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
            {output.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      )}

      <NoteList title="Good to know" items={output.flags.map((f) => f.message)} />
      <p className="mt-6 text-sm">
        Not sure if you&apos;re a nonresident?{" "}
        <Link href="/check" className="font-medium underline underline-offset-2">
          Check your tax residency
        </Link>
        .
      </p>
      <Sources sources={output.sources} />
    </>
  );
}
