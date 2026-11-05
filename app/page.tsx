import SituationPicker from "@/components/SituationPicker";
import WaitlistForm from "@/components/WaitlistForm";

export default function Home() {
  return (
    <>
      <section className="mx-auto max-w-5xl px-4 pt-10 pb-12 sm:px-6 sm:pt-16">
        <h1 className="max-w-[20ch] text-4xl leading-[1.08] font-bold tracking-tight sm:text-6xl">
          Your first years of U.S. money, explained.
        </h1>
        <p className="mt-5 max-w-[60ch] text-lg leading-relaxed text-slate">
          Taxes, retirement accounts and credit work differently when you&apos;re new to
          the U.S. Pikalo shows the rules that apply to you, runs the numbers with IRS
          figures, and links the official source for every answer. The calculators are
          free and run in your browser, so nothing you enter is saved.
        </p>
      </section>

      <section className="border-y border-line bg-surface/60 py-12">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <SituationPicker />
        </div>
      </section>

      <section id="waitlist" className="mx-auto max-w-5xl scroll-mt-6 px-4 py-14 sm:px-6">
        <h2 className="text-2xl font-bold tracking-tight">Get the assistant first</h2>
        <p className="mt-2 mb-6 max-w-[60ch] leading-relaxed text-slate">
          We&apos;re building an assistant that answers your tax and retirement questions
          using IRS publications, with the source next to every answer. It launches for
          the 2027 tax season. Join to get early access and tell us what to build.
        </p>
        <WaitlistForm />
      </section>
    </>
  );
}
