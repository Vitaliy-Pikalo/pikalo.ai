"use client";

import Link from "next/link";
import { useState } from "react";
import { saveFacts } from "@/app/account/actions";
import type { Facts } from "@/lib/profile/facts";

/**
 * Under each calculator: save what's on screen to My Pikalo, or sign in to.
 * `signedIn` is undefined while the page is still finding out, so nothing
 * flashes for signed-in users.
 */
export default function SaveBar({
  signedIn,
  prefilled,
  from,
  patch,
}: {
  signedIn?: boolean;
  prefilled?: boolean;
  from: string;
  patch: Facts;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  if (signedIn === undefined) return null;

  if (!signedIn) {
    return (
      <p className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-slate">
        <Link
          href={`/login?next=${encodeURIComponent(from)}`}
          className="font-semibold text-ink underline underline-offset-2"
        >
          Sign in to save these answers
        </Link>{" "}
        and the calculators fill themselves in next time.
      </p>
    );
  }

  async function save() {
    setState("saving");
    // Empty fields are left out so they never erase a saved answer.
    const clean = Object.fromEntries(
      Object.entries(patch).filter(([, v]) => v !== undefined),
    ) as Facts;
    const r = await saveFacts(clean);
    if (r.ok) setState("saved");
    else {
      setError(r.error);
      setState("error");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface px-4 py-3 text-sm">
      <button
        type="button"
        onClick={save}
        disabled={state === "saving"}
        className="rounded-md bg-ink px-3 py-1.5 font-semibold text-surface disabled:opacity-50"
      >
        {state === "saving" ? "Saving…" : "Save to My Pikalo"}
      </button>
      <span role="status" className="text-slate">
        {state === "saved" && <span className="text-stamp">Saved. </span>}
        {state === "error" && <span className="text-amber">{error} </span>}
        {prefilled && state === "idle" && "Filled in from your saved answers. "}
        <Link href="/account" className="underline underline-offset-2">
          My Pikalo
        </Link>
      </span>
    </div>
  );
}
