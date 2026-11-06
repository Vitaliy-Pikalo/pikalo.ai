import Link from "next/link";
import SituationPicker from "@/components/SituationPicker";
import W2Example from "@/components/W2Example";
import WaitlistForm from "@/components/WaitlistForm";

const SOURCES = [
  { label: "Publication 519", href: "https://www.irs.gov/publications/p519" },
  { label: "Publication 901", href: "https://www.irs.gov/publications/p901" },
  { label: "Publication 590-A", href: "https://www.irs.gov/publications/p590a" },
  { label: "Form 8843", href: "https://www.irs.gov/forms-pubs/about-form-8843" },
  { label: "Form 843", href: "https://www.irs.gov/instructions/i843" },
];

const CHECKS = [
  {
    title: "Numbers come from calculators, not guesses",
    body: "When your question has your own figures, the answer has to come from Pikalo's residency, FICA or Roth calculator. Those run the IRS rules as code, with tests at every threshold.",
  },
  {
    title: "Every figure is traced to a source",
    body: "Each dollar amount, percentage and day count in an answer must appear in the IRS passage or calculator result it came from. Each answer links the IRS pages it used.",
  },
  {
    title: "Unverified answers aren't shown",
    body: "If a check fails, you see that the answer was held back instead of a confident wrong number. A person reviews what went wrong.",
  },
];

const btn = "inline-flex items-center justify-center rounded-lg px-5 py-3 font-semibold";

export default function Home() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-16 px-4 pt-14 pb-20 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-24 lg:pb-28">
        <div>
          <h1 className="max-w-[16ch] text-[2.6rem] leading-[1.04] font-bold tracking-[-0.03em] sm:text-6xl">
            U.S. taxes, explained for people who just got here.
          </h1>
          <p className="mt-6 max-w-[54ch] text-lg leading-relaxed text-slate">
            Find out if you&apos;re a resident for taxes, spot Social Security tax your
            employer shouldn&apos;t have taken, and get answers that link the IRS page
            they came from. Free, and no SSN needed.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link href="/fica" className={`${btn} bg-ink text-surface hover:opacity-90`}>
              Check my W-2 for a refund
            </Link>
            <Link
              href="/ask"
              className={`${btn} border border-field-line bg-surface text-ink hover:border-ink`}
            >
              Ask a tax question
            </Link>
          </div>
        </div>
        <div>
          <W2Example />
        </div>
      </section>

      <section aria-label="Sources" className="border-y border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:px-6 md:flex-row md:items-center md:gap-8">
          <p className="shrink-0 text-sm font-semibold">
            Built on the IRS&apos;s own rules
          </p>
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate">
            {SOURCES.map((s) => (
              <li key={s.href}>
                <a href={s.href} className="hover:text-ink hover:underline">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="start" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6">
        <h2 className="max-w-[24ch] text-3xl font-bold tracking-tight sm:text-4xl">
          Start with your situation
        </h2>
        <p className="mt-3 mb-10 max-w-[60ch] leading-relaxed text-slate">
          The rules depend on your visa and how long you&apos;ve been here. Pick the one
          that fits and see the tools and mistakes that matter for you.
        </p>
        <SituationPicker />
      </section>

      <section className="bg-ink text-paper">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_1.6fr]">
          <div>
            <h2 className="max-w-[16ch] text-3xl font-bold tracking-tight sm:text-4xl">
              Built to not make up numbers
            </h2>
            <p className="mt-4 max-w-[44ch] leading-relaxed text-paper/75">
              A wrong tax figure costs real money. Every answer from the assistant goes
              through three checks before you see it.
            </p>
            <Link
              href="/ask"
              className={`${btn} mt-8 bg-paper text-ink hover:opacity-90`}
            >
              Try the assistant
            </Link>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-xl bg-paper/15 sm:grid-cols-3 lg:grid-cols-1">
            {CHECKS.map((c) => (
              <li key={c.title} className="bg-ink p-6">
                <h3 className="font-semibold">{c.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-paper/70">{c.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Answer once</h2>
          <p className="mt-3 max-w-[48ch] leading-relaxed text-slate">
            Make a free account and save your visa, days in the U.S. and W-2 boxes. Every
            calculator fills itself in, and My Pikalo shows what each one still needs.
            Sign-in is a link by email, with no password.
          </p>
          <Link
            href="/login?next=%2Faccount"
            className={`${btn} mt-8 bg-ink text-surface hover:opacity-90`}
          >
            Create free account
          </Link>
        </div>
        <div
          id="waitlist"
          className="scroll-mt-20 rounded-xl border border-line bg-surface p-6"
        >
          <h2 className="text-xl font-bold tracking-tight">Get tax-season reminders</h2>
          <p className="mt-2 mb-6 leading-relaxed text-slate">
            One email when W-2s arrive and one before the April deadline.
          </p>
          <WaitlistForm />
        </div>
      </section>
    </>
  );
}
