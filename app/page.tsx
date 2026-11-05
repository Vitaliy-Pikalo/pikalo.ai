import ResidencyChecker from "@/components/ResidencyChecker";
import WaitlistForm from "@/components/WaitlistForm";

const ROADMAP = [
  {
    title: "Ask anything, get the IRS source",
    body: "An assistant that answers questions about U.S. taxes and retirement accounts, and links the IRS or state page each answer comes from.",
  },
  {
    title: "Walk through your situation",
    body: "Step-by-step scenarios like a first internship on OPT, moving states, or opening a Roth IRA on a work visa.",
  },
  {
    title: "Learn the system in small pieces",
    body: "Short lessons on how U.S. investing, credit and retirement accounts work, written for people who didn't grow up with them.",
  },
];

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 pt-10 pb-14 sm:px-6 sm:pt-16">
        <h1 className="max-w-[20ch] text-4xl leading-[1.08] font-bold tracking-tight sm:text-6xl">
          Your first years of U.S. money, explained.
        </h1>
        <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-slate">
          Taxes, investing and retirement accounts work differently when you&apos;re new
          to the U.S. Pikalo explains the rules that apply to you, with the IRS source
          next to every answer.
        </p>
      </section>

      <section
        aria-labelledby="checker-heading"
        className="border-y border-line bg-surface/60 py-12"
      >
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2
            id="checker-heading"
            className="text-2xl font-bold tracking-tight sm:text-3xl"
          >
            Are you a resident or nonresident for taxes?
          </h2>
          <p className="mt-2 mb-8 max-w-[64ch] leading-relaxed text-slate">
            Your visa alone doesn&apos;t decide this. The IRS also counts your days in the
            U.S. over three years. Your status decides which forms you file and which
            software you can use. Filing as the wrong one is a common mistake.
          </p>
          <ResidencyChecker />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight">What&apos;s coming next</h2>
        <dl className="mt-6 grid gap-8 sm:grid-cols-3">
          {ROADMAP.map((item) => (
            <div key={item.title}>
              <dt className="font-semibold">{item.title}</dt>
              <dd className="mt-2 leading-relaxed text-slate">{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section id="waitlist" className="mx-auto max-w-5xl scroll-mt-6 px-4 pb-16 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Get early access</h2>
        <p className="mt-2 mb-6 max-w-[60ch] leading-relaxed text-slate">
          We&apos;re launching for the 2027 tax season. Join the waitlist to get the
          assistant first and help decide what we build.
        </p>
        <WaitlistForm />
      </section>
    </>
  );
}
