import type { Metadata } from "next";
import { Suspense } from "react";
import FicaChecker from "@/components/FicaChecker";
import { getMyFacts } from "@/lib/profile/load";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = {
  title: "FICA refund checker for international students",
  description:
    "See if Social Security and Medicare tax was withheld from your F-1, J-1 or M-1 paycheck by mistake, and how to get it back.",
};

export default function FicaPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <PageIntro title="Were you charged Social Security tax you don't owe?">
        Most nonresident F-1, J-1 and M-1 students don&apos;t owe Social Security or
        Medicare tax on campus jobs, CPT or OPT. Payroll systems often take it anyway,
        about 7.65% of every paycheck. Enter your W-2 to see what you can get back.
      </PageIntro>
      <Suspense fallback={<FicaChecker />}>
        <WithSaved />
      </Suspense>
    </div>
  );
}

/** Signed in: start from saved answers. Signed out: the plain calculator. */
async function WithSaved() {
  const me = await getMyFacts();
  return <FicaChecker initial={me.facts} signedIn={me.signedIn} />;
}
