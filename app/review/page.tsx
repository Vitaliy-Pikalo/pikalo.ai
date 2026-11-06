import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { PageIntro } from "@/components/ui";
import { canReview, getViewer } from "@/lib/auth/session";
import { createSupabaseServer } from "@/lib/supabase/server";
import { reviewAnswer } from "./actions";

export const metadata: Metadata = {
  title: "Review queue",
  robots: { index: false },
};

interface Item {
  id: string;
  created_at: string;
  model: string;
  question: string;
  draft: string;
  reason: string[];
  citations: { n: number; title: string; url: string }[];
  tools: { name: string; ok: boolean }[];
}

const when = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(iso));

export default function ReviewPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 pt-8 pb-16 sm:px-6">
      <PageIntro title="Review queue">
        Answers the assistant drafted but withheld because a guard couldn&apos;t verify
        them. Mark each one: was the guard right, or was the draft actually fine? False
        positives become new eval cases.
      </PageIntro>
      <Suspense fallback={<p className="text-slate">Loading the queue…</p>}>
        <Queue />
      </Suspense>
    </div>
  );
}

async function Queue() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=/review");
  if (!canReview(viewer)) {
    return (
      <div className="max-w-xl space-y-4">
        <p>
          You&apos;re signed in as <strong>{viewer.email}</strong>, but this page is for
          reviewers.
        </p>
        <SignOut />
      </div>
    );
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("withheld_answers")
    .select("id, created_at, model, question, draft, reason, citations, tools")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return <p className="text-amber">Couldn&apos;t load the queue.</p>;
  const items = (data ?? []) as Item[];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate">
        <span>
          {items.length === 0 ? "Nothing to review." : `${items.length} open`} · signed in
          as {viewer.email}
        </span>
        <SignOut />
      </div>
      {items.map((item) => (
        <article key={item.id} className="rounded-lg border border-line bg-surface p-5">
          <p className="text-sm text-slate">
            {when(item.created_at)} · {item.model}
          </p>
          <h2 className="mt-2 font-semibold">{item.question}</h2>
          <div className="mt-3 rounded-md bg-paper p-3 text-sm leading-relaxed whitespace-pre-line">
            {item.draft || "(no draft text)"}
          </div>
          <dl className="mt-3 grid gap-1 text-sm">
            <div>
              <dt className="inline font-semibold">Why withheld: </dt>
              <dd className="inline">{item.reason.join(" · ") || "—"}</dd>
            </div>
            <div>
              <dt className="inline font-semibold">Tools: </dt>
              <dd className="inline">
                {item.tools
                  .map((t) => `${t.name}${t.ok ? "" : " (failed)"}`)
                  .join(", ") || "none"}
              </dd>
            </div>
            {item.citations.length > 0 && (
              <div>
                <dt className="inline font-semibold">Sources: </dt>
                <dd className="inline">
                  {item.citations.map((c, i) => (
                    <span key={c.n}>
                      {i > 0 && ", "}
                      <a href={c.url} className="underline underline-offset-2">
                        {c.title}
                      </a>
                    </span>
                  ))}
                </dd>
              </div>
            )}
          </dl>
          <form action={reviewAnswer} className="mt-4 grid gap-3">
            <input type="hidden" name="id" value={item.id} />
            <label className="block text-sm">
              <span className="font-semibold">Note (optional)</span>
              <textarea
                name="note"
                rows={2}
                maxLength={2000}
                className="mt-1 w-full rounded-md border border-field-line bg-surface px-3 py-2 text-base"
              />
            </label>
            <div className="flex flex-wrap gap-3">
              <button
                name="decision"
                value="rejected"
                className="rounded-md bg-ink px-4 py-2 font-semibold text-surface"
              >
                Guard was right
              </button>
              <button
                name="decision"
                value="approved"
                className="rounded-md border border-ink px-4 py-2 font-semibold"
              >
                Draft was fine (false positive)
              </button>
            </div>
          </form>
        </article>
      ))}
      <p className="text-sm text-slate">
        Withheld answers are deleted after 90 days. Questions are stored with SSNs,
        account numbers and emails removed.{" "}
        <Link href="/ask" className="underline">
          Back to Ask
        </Link>
      </p>
    </div>
  );
}

function SignOut() {
  return (
    <form action="/auth/signout" method="post">
      <button className="text-sm underline underline-offset-2">Sign out</button>
    </form>
  );
}
