"use client";

import { useId, useState } from "react";
import { checkRoth, ROTH_2026, type FilingStatus } from "@/lib/roth";
import { formatUsd } from "@/lib/fica";
import {
  Checkbox,
  inputClass,
  MoneyField,
  NoteList,
  parseMoney,
  Placeholder,
  Sources,
  Verdict,
} from "@/components/ui";
import SaveBar from "@/components/SaveBar";
import type { Facts } from "@/lib/profile/facts";

const STATUSES: { value: FilingStatus; label: string }[] = [
  { value: "single", label: "Single" },
  { value: "head_of_household", label: "Head of household" },
  { value: "married_joint", label: "Married filing jointly" },
  { value: "married_separate", label: "Married filing separately" },
  { value: "qualifying_surviving_spouse", label: "Qualifying surviving spouse" },
];

const money = (n: number | null | undefined) => (n == null ? "" : String(n));
const amount = (s: string) =>
  s.trim() === "" || !Number.isFinite(parseMoney(s)) ? undefined : parseMoney(s);

export default function RothCalculator({
  initial = {},
  signedIn,
}: {
  initial?: Facts;
  signedIn?: boolean;
}) {
  const id = useId();
  const [status, setStatus] = useState<FilingStatus>(initial.filing_status ?? "single");
  const [age50, setAge50] = useState(initial.age_50_plus ?? false);
  const [comp, setComp] = useState(money(initial.compensation));
  const [magi, setMagi] = useState(money(initial.magi));
  const [magiTouched, setMagiTouched] = useState(initial.magi != null);
  const [other, setOther] = useState(money(initial.other_ira));
  const [apart, setApart] = useState(false);
  const [spouseComp, setSpouseComp] = useState("");

  const compValue = parseMoney(comp);
  const output = checkRoth({
    taxYear: 2026,
    filingStatus: status,
    age50OrOlder: age50,
    taxableCompensation: compValue,
    // Until the user enters MAGI, assume it equals compensation.
    modifiedAgi: magiTouched ? parseMoney(magi) : compValue,
    otherIraContributions: parseMoney(other),
    livedApartAllYear: status === "married_separate" ? apart : undefined,
    spouseCompensation: status === "married_joint" ? parseMoney(spouseComp) : undefined,
  });

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <form className="space-y-6" onSubmit={(e) => e.preventDefault()}>
        <MoneyField
          id={`${id}-comp`}
          label="Your 2026 taxable compensation"
          hint="Wages, self-employment income and taxable non-tuition stipends. Leave out wages a tax treaty exempts."
          value={comp}
          onChange={setComp}
        />
        <label className="block">
          <span className="font-semibold">Filing status</span>
          <select
            className={inputClass}
            value={status}
            onChange={(e) => setStatus(e.target.value as FilingStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-sm text-slate">
            Nonresident aliens can generally only file as single or married filing
            separately.
          </span>
        </label>
        {status === "married_joint" && (
          <MoneyField
            id={`${id}-spouse`}
            label="Spouse's 2026 taxable compensation"
            hint="Minus anything your spouse puts in their own IRAs."
            value={spouseComp}
            onChange={setSpouseComp}
          />
        )}
        {status === "married_separate" && (
          <Checkbox checked={apart} onChange={setApart}>
            I lived apart from my spouse for all of 2026
          </Checkbox>
        )}
        <MoneyField
          id={`${id}-magi`}
          label="Modified AGI"
          hint="If you only have a salary, this is close to your wages. Leave empty to use your wages."
          value={magi}
          onChange={(v) => {
            setMagi(v);
            setMagiTouched(v.trim() !== "");
          }}
        />
        <MoneyField
          id={`${id}-other`}
          label="Already put in a traditional IRA for 2026"
          value={other}
          onChange={setOther}
        />
        <Checkbox checked={age50} onChange={setAge50}>
          I&apos;m 50 or older by the end of 2026
        </Checkbox>
        <SaveBar
          signedIn={signedIn}
          prefilled={Object.keys(initial).length > 0}
          from="/roth"
          patch={{
            filing_status: status,
            age_50_plus: age50,
            compensation: amount(comp),
            magi: magiTouched ? amount(magi) : undefined,
            other_ira: amount(other),
          }}
        />
      </form>

      <section className="lg:sticky lg:top-6 lg:self-start">
        {comp.trim() === "" ? (
          <Placeholder>
            Enter your 2026 compensation to see how much you can put in.
          </Placeholder>
        ) : (
          <RothResultView output={output} />
        )}
      </section>
    </div>
  );
}

function RothResultView({ output }: { output: ReturnType<typeof checkRoth> }) {
  const tone =
    output.result === "eligible" ? "good" : output.result === "reduced" ? "good" : "warn";
  const title =
    output.result === "invalid"
      ? "Check your entries"
      : output.maxContribution > 0
        ? "Your 2026 Roth IRA limit"
        : "You can't contribute directly this year";
  const pct =
    output.baseLimit > 0 ? (output.maxContribution / output.baseLimit) * 100 : 0;

  return (
    <>
      <Verdict title={title} tone={tone}>
        {output.result !== "invalid" && (
          <p className="mt-2 text-5xl font-bold tracking-tight tabular-nums">
            {formatUsd(output.maxContribution)}
            <span className="ml-2 text-base font-medium text-slate">
              of {formatUsd(output.baseLimit || ROTH_2026.limit)}
            </span>
          </p>
        )}
        <ul className="mt-3 space-y-1.5 text-sm leading-relaxed">
          {output.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </Verdict>

      {output.result !== "invalid" && (
        <div
          className="mt-5 h-3 w-full overflow-hidden rounded-sm bg-line/60"
          role="img"
          aria-label={`${Math.round(pct)}% of the full limit`}
        >
          <div
            className="h-full bg-meter-1 transition-[width] duration-300"
            style={{ width: `${pct}%` }}
          />
        </div>
      )}

      <NoteList title="On a visa? Read this" items={output.notes} />
      <Sources sources={output.sources} />
    </>
  );
}
