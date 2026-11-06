import type { Metadata } from "next";
import { Suspense } from "react";
import ResidencyChecker from "@/components/ResidencyChecker";
import { getMyFacts } from "@/lib/profile/load";

export const metadata: Metadata = {
  title: "U.S. tax residency checker",
  description:
    "Find out if you're a resident or nonresident alien for U.S. taxes using the substantial presence test from IRS Publication 519.",
};

export default function CheckPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        U.S. tax residency checker
      </h1>
      <p className="mt-3 mb-10 max-w-[64ch] leading-relaxed text-slate">
        Answer a few questions to see whether you&apos;re likely a resident or nonresident
        alien under the green card and substantial presence tests. Nothing you enter is
        sent to us unless you sign in and save it.
      </p>
      <Suspense fallback={<ResidencyChecker />}>
        <WithSaved />
      </Suspense>
    </div>
  );
}

/** Signed in: start from saved answers. Signed out: the plain calculator. */
async function WithSaved() {
  const me = await getMyFacts();
  return <ResidencyChecker initial={me.facts} signedIn={me.signedIn} />;
}
