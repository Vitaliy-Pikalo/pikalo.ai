"use client";

import type { ReactNode } from "react";

export const inputClass =
  "mt-1 w-full rounded-md border border-field-line bg-surface px-3 py-2 text-base text-ink tabular-nums placeholder:text-slate/60";

/** Parses a dollar input: "", "1,234.50", "$900" → number; garbage → NaN. */
export function parseMoney(value: string): number {
  const v = value.replace(/[$,\s]/g, "");
  if (v === "") return 0;
  return /^\d+(\.\d{1,2})?$/.test(v) ? Number(v) : NaN;
}

/** Whole digits only. Empty → fallback. */
export function parseWhole(value: string, fallback = 0): number {
  const v = value.trim();
  if (v === "") return fallback;
  return /^\d+$/.test(v) ? Number(v) : NaN;
}

export function MoneyField({
  label,
  hint,
  value,
  onChange,
  id,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  id: string;
}) {
  return (
    <label className="block">
      <span className="font-semibold">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute top-1/2 left-3 mt-0.5 -translate-y-1/2 text-slate">
          $
        </span>
        <input
          inputMode="decimal"
          placeholder="0"
          className={`${inputClass} pl-7`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-describedby={hint ? `${id}-hint` : undefined}
        />
      </div>
      {hint && (
        <span id={`${id}-hint`} className="mt-1 block text-sm text-slate">
          {hint}
        </span>
      )}
    </label>
  );
}

export function RadioGroup<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: ReactNode;
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <fieldset>
      <legend className="font-semibold">{legend}</legend>
      <div className="mt-3 space-y-2">
        {options.map((opt) => (
          <label
            key={opt.value}
            className={`flex cursor-pointer items-baseline gap-3 rounded-md border px-3 py-2.5 ${
              value === opt.value ? "border-ink bg-surface" : "border-line"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => onChange(opt.value)}
              className="accent-[var(--ink)]"
            />
            <span>
              <span className="font-medium">{opt.label}</span>
              {opt.hint && <span className="ml-2 text-sm text-slate">{opt.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Checkbox({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  children: ReactNode;
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

export type Tone = "good" | "neutral" | "warn";

const TONE: Record<Tone, string> = {
  good: "border-stamp bg-stamp-soft",
  neutral: "border-ink bg-surface",
  warn: "border-amber bg-amber-soft",
};

export function Verdict({
  title,
  tone,
  children,
  id,
}: {
  title: string;
  tone: Tone;
  children?: ReactNode;
  id?: string;
}) {
  return (
    <>
      <p aria-live="polite" aria-atomic="true" className="sr-only">
        {title}
      </p>
      <div id={id} className={`rounded-lg border-l-4 px-5 py-4 ${TONE[tone]}`}>
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {children}
      </div>
    </>
  );
}

export function NoteList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className="mt-6">
      <h3 className="font-semibold">{title}</h3>
      <ul className="mt-2 space-y-2 text-sm leading-relaxed text-slate">
        {items.map((m) => (
          <li key={m} className="border-l-2 border-amber pl-3">
            {m}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Sources({ sources }: { sources: { title: string; url: string }[] }) {
  return (
    <p className="mt-6 text-sm text-slate">
      Rules from{" "}
      {sources.map((s, i) => (
        <span key={s.url}>
          {i > 0 && (i === sources.length - 1 ? " and " : ", ")}
          <a className="underline underline-offset-2 hover:text-ink" href={s.url}>
            {s.title}
          </a>
        </span>
      ))}
      .
    </p>
  );
}

export function Placeholder({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-field-line px-5 py-6 text-slate">
      {children}
    </div>
  );
}

export function PageIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 mb-10 max-w-[64ch] leading-relaxed text-slate">{children}</p>
    </>
  );
}
