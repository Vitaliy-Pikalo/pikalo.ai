"use client";

import { useId, useState } from "react";
import { buildPacket, usd2, type PacketInput } from "@/lib/packet";
import { inputClass, MoneyField, parseMoney, RadioGroup, Sources } from "@/components/ui";

type Base = Pick<
  PacketInput,
  "taxYear" | "visaLabel" | "jobLabel" | "socialSecurityWithheld" | "medicareWithheld"
>;

export default function RefundPacket(base: Base) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [fullName, setFullName] = useState("");
  const [employerName, setEmployerName] = useState("");
  const [employerAddress, setEmployerAddress] = useState("");
  const [refunded, setRefunded] = useState("");
  const [statement, setStatement] = useState<"have" | "none">("none");

  const refundedValue = parseMoney(refunded);
  const packet = buildPacket({
    ...base,
    fullName,
    employerName,
    employerAddress,
    employerRefunded: Number.isFinite(refundedValue) ? refundedValue : 0,
    employerStatement: statement,
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-6 rounded-md bg-ink px-5 py-2.5 font-semibold text-paper"
      >
        Build my refund packet
      </button>
    );
  }

  const print = () => {
    document.body.classList.add("printing-packet");
    window.print();
    document.body.classList.remove("printing-packet");
  };

  return (
    <div className="mt-8 border-t border-line pt-6">
      <h3 className="text-lg font-bold tracking-tight">Your refund packet</h3>
      <p className="mt-1 text-sm text-slate">
        Fill these in to personalize the email and forms. Nothing leaves your browser, and
        we never ask for your SSN.
      </p>

      <div className="mt-5 grid gap-4">
        <label className="block">
          <span className="font-semibold">Your full name</span>
          <input
            className={inputClass}
            value={fullName}
            autoComplete="name"
            onChange={(e) => setFullName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="font-semibold">Employer name</span>
          <input
            className={inputClass}
            value={employerName}
            autoComplete="organization"
            onChange={(e) => setEmployerName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="font-semibold">Employer address</span>
          <span className="block text-sm text-slate">It&apos;s on your W-2, box c.</span>
          <input
            className={inputClass}
            value={employerAddress}
            onChange={(e) => setEmployerAddress(e.target.value)}
          />
        </label>
        <MoneyField
          id={`${id}-refunded`}
          label="Already refunded by your employer"
          hint="Leave empty if they haven't paid any back."
          value={refunded}
          onChange={setRefunded}
        />
        <RadioGroup
          legend="Statement from your employer"
          name={`${id}-statement`}
          value={statement}
          onChange={setStatement}
          options={[
            { value: "none", label: "I don't have one", hint: "you'll write your own" },
            { value: "have", label: "I have one, or they'll send it" },
          ]}
        />
      </div>

      <div id="refund-packet" className="mt-8 space-y-8">
        <p className="text-sm text-slate">
          Claim amount:{" "}
          <span className="font-semibold text-ink">{usd2(packet.claimAmount)}</span>
        </p>

        <PacketSection n={1} title="Email your employer first">
          <p className="text-sm text-slate">
            Most refunds are fixed by payroll. Send this before filing anything.
          </p>
          <CopyBlock label="Subject" text={packet.employerEmail.subject} />
          <CopyBlock label="Email" text={packet.employerEmail.body} multiline />
        </PacketSection>

        <PacketSection n={2} title="If they won't refund it: Form 843">
          <p className="text-sm text-slate">
            Download the form from{" "}
            <a className="underline" href="https://www.irs.gov/forms-pubs/about-form-843">
              irs.gov
            </a>
            . For lines not listed here, follow the Form 843 instructions.
          </p>
          <dl className="mt-3 divide-y divide-line border-y border-line text-sm">
            {packet.form843.map((l) => (
              <div key={l.line} className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr]">
                <dt className="font-semibold">
                  {/^\d+$/.test(l.line) ? `Line ${l.line}` : l.line}
                  <span className="block font-normal text-slate">{l.label}</span>
                </dt>
                <dd>
                  {l.value}
                  {l.note && <span className="block text-slate">{l.note}</span>}
                </dd>
              </div>
            ))}
          </dl>
          <CopyBlock label="Line 8 explanation" text={packet.explanation} multiline />
        </PacketSection>

        <PacketSection n={3} title="Form 8316 answers">
          <p className="text-sm text-slate">
            Download it from{" "}
            <a className="underline" href="https://www.irs.gov/pub/irs-pdf/f8316.pdf">
              irs.gov
            </a>
            , answer as below, sign, and attach it to Form 843.
          </p>
          <dl className="mt-3 divide-y divide-line border-y border-line text-sm">
            {packet.form8316.map((q) => (
              <div key={q.q} className="grid gap-1 py-2.5 sm:grid-cols-[10rem_1fr]">
                <dt className="font-semibold">
                  {q.q === "Start" ? "First question" : `Question ${q.q}`}
                  <span className="block font-normal text-slate">{q.question}</span>
                </dt>
                <dd>{q.a}</dd>
              </div>
            ))}
          </dl>
        </PacketSection>

        <PacketSection n={4} title="Put these in the envelope">
          <ul className="mt-2 space-y-1.5 text-sm">
            {packet.checklist.map((c) => (
              <li key={c} className="flex gap-2">
                <span aria-hidden className="text-slate">
                  ☐
                </span>
                {c}
              </li>
            ))}
          </ul>
        </PacketSection>

        <PacketSection n={5} title="Mail it">
          <address className="mt-2 text-sm leading-relaxed not-italic">
            {packet.mailing.address.map((a) => (
              <span key={a} className="block font-medium">
                {a}
              </span>
            ))}
          </address>
          <ul className="mt-3 space-y-1.5 text-sm text-slate">
            {packet.mailing.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </PacketSection>

        <Sources sources={packet.sources} />
      </div>

      <button
        type="button"
        onClick={print}
        className="mt-6 rounded-md border border-ink px-5 py-2.5 font-semibold"
      >
        Print packet
      </button>
    </div>
  );
}

function PacketSection({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="break-inside-avoid">
      <h4 className="flex items-baseline gap-2 font-bold">
        <span className="text-slate tabular-nums">{n}.</span>
        {title}
      </h4>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function CopyBlock({
  label,
  text,
  multiline = false,
}: {
  label: string;
  text: string;
  multiline?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="rounded px-2 py-0.5 text-slate underline-offset-2 hover:text-ink hover:underline print:hidden"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre
        className={`mt-1 rounded-md border border-line bg-surface px-3 py-2 font-sans text-sm leading-relaxed whitespace-pre-wrap ${
          multiline ? "" : "truncate"
        }`}
      >
        {text}
      </pre>
    </div>
  );
}
