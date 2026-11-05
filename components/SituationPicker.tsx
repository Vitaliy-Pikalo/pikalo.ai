"use client";

import { useState } from "react";
import Link from "next/link";
import { TRAPS, type Situation } from "@/lib/traps";

const SITUATIONS: { value: Situation; label: string; detail: string }[] = [
  { value: "student", label: "International student", detail: "F-1, J-1, M-1, OPT" },
  { value: "worker", label: "Working on a visa", detail: "H-1B, L-1, O-1, TN" },
  { value: "newcomer", label: "New green card holder", detail: "or just moved here" },
  { value: "first_gen", label: "Grew up here", detail: "first in my family to do this" },
];

const TOOLS: Record<Situation, { href: string; title: string; body: string }[]> = {
  student: [
    {
      href: "/check",
      title: "Am I a resident or nonresident?",
      body: "Decides which return you file.",
    },
    {
      href: "/fica",
      title: "Was I overcharged Social Security tax?",
      body: "Check your W-2 in a minute.",
    },
  ],
  worker: [
    {
      href: "/check",
      title: "Am I a resident or nonresident?",
      body: "Your status can change mid-visa.",
    },
    {
      href: "/roth",
      title: "How much can I put in a Roth IRA?",
      body: "2026 IRS limits.",
    },
  ],
  newcomer: [
    {
      href: "/check",
      title: "When did I become a tax resident?",
      body: "Green card holders usually are.",
    },
    {
      href: "/roth",
      title: "How much can I put in a Roth IRA?",
      body: "2026 IRS limits.",
    },
  ],
  first_gen: [
    {
      href: "/roth",
      title: "How much can I put in a Roth IRA?",
      body: "2026 IRS limits.",
    },
  ],
};

export default function SituationPicker() {
  const [situation, setSituation] = useState<Situation>("student");
  const traps = TRAPS.filter((t) => t.situations.includes(situation));

  return (
    <div>
      <fieldset>
        <legend className="mb-3 font-semibold">I&apos;m</legend>
        <div className="grid gap-2 sm:grid-cols-4">
          {SITUATIONS.map((s) => (
            <label
              key={s.value}
              className={`cursor-pointer rounded-md border px-4 py-3 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-[var(--focus)] ${
                situation === s.value
                  ? "border-ink bg-ink text-paper"
                  : "border-field-line bg-surface hover:border-ink"
              }`}
            >
              <input
                type="radio"
                name="situation"
                value={s.value}
                checked={situation === s.value}
                onChange={() => setSituation(s.value)}
                className="sr-only"
              />
              <span className="block font-semibold">{s.label}</span>
              <span
                className={`block text-sm ${situation === s.value ? "text-paper/75" : "text-slate"}`}
              >
                {s.detail}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-labelledby="tools-heading">
          <h2 id="tools-heading" className="text-lg font-bold tracking-tight">
            Answer your questions
          </h2>
          <ul className="mt-3 space-y-3">
            {TOOLS[situation].map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="block rounded-lg border-l-4 border-ink bg-surface px-4 py-3 hover:bg-paper"
                >
                  <span className="block font-semibold">{t.title}</span>
                  <span className="block text-sm text-slate">{t.body}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="traps-heading">
          <h2 id="traps-heading" className="text-lg font-bold tracking-tight">
            Watch out for
          </h2>
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {traps.map((t) => (
              <li key={t.slug}>
                <Link href={`/traps#${t.slug}`} className="block py-3 hover:text-slate">
                  {t.title}
                </Link>
              </li>
            ))}
          </ul>
          <Link
            href="/traps"
            className="mt-3 inline-block text-sm underline underline-offset-2"
          >
            See all money traps
          </Link>
        </section>
      </div>
    </div>
  );
}
