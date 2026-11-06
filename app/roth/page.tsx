import type { Metadata } from "next";
import { Suspense } from "react";
import RothCalculator from "@/components/RothCalculator";
import { getMyFacts } from "@/lib/profile/load";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = {
  title: "2026 Roth IRA calculator",
  description:
    "How much you can put in a Roth IRA for 2026, using IRS income limits, with notes for people on visas.",
};

export default function RothPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6">
      <PageIntro title="How much can you put in a Roth IRA?">
        A Roth IRA lets your investments grow tax-free for retirement. How much you can
        put in for 2026 depends on your wages, your income and how you file. This uses the
        IRS&apos;s 2026 limits.
      </PageIntro>
      <Suspense fallback={<RothCalculator />}>
        <WithSaved />
      </Suspense>
    </div>
  );
}

/** Signed in: start from saved answers. Signed out: the plain calculator. */
async function WithSaved() {
  const me = await getMyFacts();
  return <RothCalculator initial={me.facts} signedIn={me.signedIn} />;
}
