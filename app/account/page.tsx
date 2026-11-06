import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import ProfileGuide from "@/components/ProfileGuide";
import { PageIntro } from "@/components/ui";
import { getMyFacts } from "@/lib/profile/load";

export const metadata: Metadata = {
  title: "My Pikalo",
  robots: { index: false },
};

const TAX_YEAR = 2026;

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <PageIntro title="My Pikalo">
        Answer once, and the calculators fill themselves in. Each step says which tools it
        unlocks, so you only answer what you need.
      </PageIntro>
      <Suspense fallback={<p className="text-slate">Loading your answers…</p>}>
        <Account />
      </Suspense>
    </div>
  );
}

async function Account() {
  const me = await getMyFacts();
  if (!me.signedIn) redirect("/login?next=/account");
  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate">
        <span>Signed in as {me.email}</span>
        <form action="/auth/signout" method="post">
          <button className="underline underline-offset-2">Sign out</button>
        </form>
      </div>
      <ProfileGuide initialFacts={me.facts} taxYear={TAX_YEAR} />
    </>
  );
}
