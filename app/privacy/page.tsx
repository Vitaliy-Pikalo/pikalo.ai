import type { Metadata } from "next";
import { PageIntro } from "@/components/ui";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Pikalo collects, what it never asks for, who processes it and how long it's kept.",
};

const CONTACT = "privacy@pikalo.org";

const h2 = "mt-10 text-xl font-semibold";
const p = "mt-3 leading-relaxed";
const ul = "mt-3 list-disc space-y-2 pl-6 leading-relaxed";
const a = "underline underline-offset-2 hover:text-stamp";

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-16 sm:px-6">
      <PageIntro title="Privacy">
        Pikalo is built to help with money questions without collecting the details that
        make people targets. Last updated November 5, 2026.
      </PageIntro>

      <div className="max-w-[72ch]">
        <h2 className={h2}>The short version</h2>
        <ul className={ul}>
          <li>
            We never ask for your Social Security number, ITIN, bank or card numbers, or
            tax documents.
          </li>
          <li>
            The calculators run in your browser. What you type into them isn&apos;t sent
            to us.
          </li>
          <li>
            Questions you ask the assistant are used to answer you and aren&apos;t stored,
            unless the answer is held back for review (below).
          </li>
          <li>We don&apos;t sell data, show ads or use tracking cookies.</li>
        </ul>

        <h2 className={h2}>What we collect and why</h2>
        <ul className={ul}>
          <li>
            <strong>Waitlist:</strong> your email, which situation fits you and, if you
            give it, your school. Used to tell you about launches.
          </li>
          <li>
            <strong>Sign-in:</strong> your email address, to send one-time sign-in links.
            A cookie keeps you signed in.
          </li>
          <li>
            <strong>Held-back answers:</strong> if the assistant can&apos;t verify an
            answer, it doesn&apos;t show it. It saves the question and its draft so a
            person can check what went wrong. Before saving, it removes anything that
            looks like an SSN, ITIN, immigration A-number, card or account number, or
            email address. These are deleted after 90 days.
          </li>
          <li>
            <strong>Service logs:</strong> whether an answer was given, which calculators
            ran, how long it took and how many model tokens it used. Never the text of
            your question. When an answer is held back, the log keeps a few words of the
            AI&apos;s draft around the number it couldn&apos;t verify.
          </li>
          <li>
            <strong>Abuse limits:</strong> to limit how many questions one device can ask,
            we store a keyed hash of your IP address (not the address itself) for 2 days.
          </li>
        </ul>

        <h2 className={h2}>Who processes it</h2>
        <ul className={ul}>
          <li>
            <strong>Vercel</strong> hosts the website.
          </li>
          <li>
            <strong>Supabase</strong> stores the waitlist, sign-in accounts and held-back
            answers, in the United States.
          </li>
          <li>
            <strong>Amazon Web Services (Bedrock)</strong> runs the AI model, in U.S.
            regions. AWS says Bedrock inputs and outputs{" "}
            <a className={a} href="https://aws.amazon.com/bedrock/faqs/">
              aren&apos;t used to train models and aren&apos;t shared with model providers
            </a>
            , and that it may store or review them only in{" "}
            <a
              className={a}
              href="https://docs.aws.amazon.com/bedrock/latest/userguide/abuse-detection.html"
            >
              limited abuse-detection cases
            </a>
            .
          </li>
          <li>
            <strong>An email delivery provider</strong> sends sign-in links.
          </li>
        </ul>

        <h2 className={h2}>Your choices</h2>
        <p className={p}>
          To see or delete what we hold about you (waitlist entry or account), email{" "}
          <a className={a} href={`mailto:${CONTACT}`}>
            {CONTACT}
          </a>{" "}
          from the address you used. We&apos;ll confirm within 30 days.
        </p>

        <h2 className={h2}>Not advice</h2>
        <p className={p}>
          Pikalo explains U.S. tax rules and cites IRS sources. It isn&apos;t tax, legal
          or investment advice and doesn&apos;t replace a tax professional.
        </p>

        <h2 className={h2}>Changes</h2>
        <p className={p}>
          If this policy changes, we&apos;ll update the date above and, for meaningful
          changes, email people on the waitlist.
        </p>
      </div>
    </div>
  );
}
