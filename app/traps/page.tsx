import type { Metadata } from "next";
import Link from "next/link";
import OpenFromHash from "@/components/OpenFromHash";
import { PageIntro } from "@/components/ui";
import { CATEGORY_LABELS, TRAPS, type Trap } from "@/lib/traps";

export const metadata: Metadata = {
  title: "Money traps for newcomers",
  description:
    "The most common ways immigrants and international students lose money in the U.S., and what to do about each one.",
};

const ORDER: Trap["category"][] = ["taxes", "banking", "scams"];

export default function TrapsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-8 pb-16 sm:px-6">
      <OpenFromHash />
      <PageIntro title="Where newcomers lose money">
        These are the mistakes and scams that come up most for people new to the U.S.
        money system. Each one links to the official rule, so you can check it yourself.
      </PageIntro>

      {ORDER.map((cat) => (
        <section key={cat} aria-labelledby={`cat-${cat}`} className="mb-12">
          <h2 id={`cat-${cat}`} className="mb-4 text-xl font-bold tracking-tight">
            {CATEGORY_LABELS[cat]}
          </h2>
          <div className="divide-y divide-line border-y border-line">
            {TRAPS.filter((t) => t.category === cat).map((t) => (
              <TrapItem key={t.slug} trap={t} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TrapItem({ trap }: { trap: Trap }) {
  return (
    <details id={trap.slug} className="group scroll-mt-6 py-4">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold [&::-webkit-details-marker]:hidden">
        <span>{trap.title}</span>
        <span
          aria-hidden
          className="mt-0.5 text-slate transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <div className="mt-3 max-w-[64ch] space-y-3 leading-relaxed">
        <p>{trap.happens}</p>
        <p>
          <span className="font-semibold">Does it apply to you? </span>
          <span className="text-slate">{trap.check}</span>
        </p>
        <p>
          <span className="font-semibold">What to do: </span>
          <span className="text-slate">{trap.action}</span>
        </p>
        <p className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {trap.tool && (
            <Link
              href={trap.tool.href}
              className="rounded-md bg-ink px-3 py-1.5 font-semibold text-paper"
            >
              {trap.tool.label}
            </Link>
          )}
          <a
            href={trap.source.url}
            className="self-center text-slate underline underline-offset-2 hover:text-ink"
          >
            Source: {trap.source.title}
          </a>
        </p>
      </div>
    </details>
  );
}
