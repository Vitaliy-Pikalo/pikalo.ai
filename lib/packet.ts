/**
 * Builds a FICA refund packet for a nonresident student (educational):
 * an email to the employer (the fastest route), a line-by-line guide for
 * IRS Form 843, answers for Form 8316, a document checklist and mailing
 * instructions.
 *
 * It deliberately never asks for an SSN or ITIN: the person writes it on the
 * official form themselves. Everything runs in the browser.
 *
 * Sources:
 * - IRS Instructions for Form 843 (employee refund of Social Security /
 *   Medicare tax withheld in error; employer statement or own statement;
 *   W-2; time limit).
 * - IRS Form 8316 (screening question, questions 1–9, attach to Form 843).
 * - IRS Pub 519 (2022, pp. 43–44, as quoted by Emory University): attach
 *   visa, I-94, I-20/DS-2019, EAD for practical training, W-2, pay statements
 *   if exempt for part of the year; mail separately from Form 1040-NR to the
 *   IRS in Ogden, UT 84201-0038.
 * - IRC §3121(b)(19): exempts services by nonresident aliens in F, J, M or Q
 *   status performed to carry out the purpose of their visa.
 */

export interface PacketInput {
  fullName: string;
  taxYear: number;
  /** e.g. "F-1", "J-1", "M-1" */
  visaLabel: string;
  /** e.g. "OPT", "CPT", "on-campus work" */
  jobLabel: string;
  employerName: string;
  employerAddress: string;
  socialSecurityWithheld: number;
  medicareWithheld: number;
  /** Amount the employer has already paid back. */
  employerRefunded: number;
  /** Whether the person has, or expects, a statement from the employer. */
  employerStatement: "have" | "none";
}

export interface FormLine {
  line: string;
  label: string;
  value: string;
  note?: string;
}

export interface Packet {
  claimAmount: number;
  employerEmail: { subject: string; body: string };
  form843: FormLine[];
  form8316: { q: string; question: string; a: string }[];
  explanation: string;
  checklist: string[];
  mailing: { address: string[]; notes: string[] };
  sources: { title: string; url: string }[];
}

export const PACKET_SOURCES = [
  {
    title: "IRS Instructions for Form 843",
    url: "https://www.irs.gov/instructions/i843",
  },
  { title: "IRS Form 8316 (PDF)", url: "https://www.irs.gov/pub/irs-pdf/f8316.pdf" },
  {
    title: "IRS Publication 519, U.S. Tax Guide for Aliens",
    url: "https://www.irs.gov/publications/p519",
  },
];

const PRACTICAL_TRAINING = ["OPT", "CPT", "practical training"];

export function usd2(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function buildPacket(input: PacketInput): Packet {
  const ss = input.socialSecurityWithheld;
  const med = input.medicareWithheld;
  const total = Math.round((ss + med) * 100) / 100;
  const refunded = Math.max(0, input.employerRefunded);
  const claimAmount = Math.max(0, Math.round((total - refunded) * 100) / 100);
  const year = input.taxYear;
  const name = input.fullName.trim() || "[your full name]";
  const employer = input.employerName.trim() || "[employer name]";
  const employerFull =
    [input.employerName.trim(), input.employerAddress.trim()]
      .filter(Boolean)
      .join(", ") || "[employer name and address]";
  const isTraining = PRACTICAL_TRAINING.some((t) => input.jobLabel.includes(t));

  const explanation =
    `I am a nonresident alien in ${input.visaLabel} status. My wages from ${employer} in ${year} were for ${input.jobLabel}, which is allowed by my visa and connected to its purpose. ` +
    `Under Internal Revenue Code section 3121(b)(19), these wages are exempt from Social Security and Medicare tax. ` +
    `My employer withheld ${usd2(ss)} in Social Security tax and ${usd2(med)} in Medicare tax in error (Form W-2, boxes 4 and 6)` +
    (refunded > 0 ? ` and has refunded ${usd2(refunded)}` : ` and has not refunded it`) +
    `. I request a refund of ${usd2(claimAmount)}. Form 8316 and supporting documents are attached.`;

  const employerEmail = {
    subject: `Request: refund of FICA withheld in error (${year})`,
    body: [
      `Hello,`,
      ``,
      `I'm a nonresident alien employee in ${input.visaLabel} status, working on ${input.jobLabel}. My wages are exempt from Social Security and Medicare tax under IRC section 3121(b)(19), but ${usd2(total)} was withheld in ${year} (${usd2(ss)} Social Security, ${usd2(med)} Medicare).`,
      ``,
      `Could you please:`,
      `1. Refund the FICA tax withheld in error and issue a corrected W-2 (W-2c), and`,
      `2. Stop withholding Social Security and Medicare tax on my future paychecks.`,
      ``,
      `If you can't refund it, could you send me a short signed statement saying how much, if anything, you refunded, and that you won't claim it back from the IRS? I'll need it for my claim on IRS Form 843.`,
      ``,
      `I can provide my visa, I-94 and I-20/DS-2019 if needed.`,
      ``,
      `Thank you,`,
      name,
    ].join("\n"),
  };

  const form843: FormLine[] = [
    {
      line: "Top",
      label: "Reason box",
      value:
        "Check the box for a refund to an employee of Social Security or Medicare tax withheld in error",
      note: "Use this only if your employer won't fix it.",
    },
    { line: "Name", label: "Name of claimant", value: name },
    {
      line: "SSN",
      label: "Your SSN or ITIN",
      value: "Write it yourself on the paper form",
      note: "Pikalo never asks for it.",
    },
    {
      line: "Address",
      label: "Your current address",
      value: "Your full mailing address",
    },
    { line: "1", label: "Period", value: `01/01/${year} to 12/31/${year}` },
    { line: "2", label: "Amount to be refunded", value: usd2(claimAmount) },
    {
      line: "4",
      label: "Type of tax",
      value: "Employment",
    },
    {
      line: "8",
      label: "Explanation",
      value: "Copy the explanation below",
    },
  ];

  const yesNo = (v: boolean) => (v ? "Yes" : "No");
  const form8316 = [
    {
      q: "Start",
      question:
        "Was the income directly related to your course of study, as defined by your visa?",
      a: "Yes",
    },
    {
      q: "1",
      question: "Has your employer repaid any part of the tax?",
      a: yesNo(refunded > 0),
    },
    {
      q: "2",
      question: "If yes, how much?",
      a: refunded > 0 ? usd2(refunded) : "Leave blank",
    },
    {
      q: "3",
      question:
        "Have you authorized your employer to claim any of it as a credit or refund?",
      a: "No (unless you did)",
    },
    { q: "4", question: "If yes, how much?", a: "Leave blank" },
    {
      q: "5",
      question: "Has your employer claimed any of it as a credit or refund?",
      a: "Ask your employer; answer No if they haven't",
    },
    { q: "6", question: "If yes, how much?", a: "Leave blank unless they have" },
    {
      q: "7",
      question: "Have you claimed any of it against your federal income tax?",
      a: "No",
    },
    { q: "8", question: "If yes, how much?", a: "Leave blank" },
    { q: "9", question: "Employer's name and address", a: employerFull },
  ];

  const checklist = [
    "Form 843, signed and dated",
    "Form 8316, signed and dated",
    `Copy of your ${year} Form W-2`,
    input.employerStatement === "have"
      ? "The statement from your employer saying how much they refunded (or that they won't)"
      : "Your own signed statement saying your employer didn't refund the tax and why you couldn't get a statement from them",
    "Copy of your visa",
    "Copy of your Form I-94 (print it from the CBP website)",
    "Copy of your I-20 or DS-2019",
    ...(isTraining
      ? ["Copy of your EAD card (for OPT or other practical training)"]
      : []),
    "Pay statements, if you were exempt for only part of the year",
  ];

  const mailing = {
    address: [
      "Department of the Treasury",
      "Internal Revenue Service Center",
      "Ogden, UT 84201-0038",
    ],
    notes: [
      "Mail it in its own envelope, separate from your tax return (Form 1040-NR).",
      "Check the current Form 843 instructions for the address before you mail it.",
      "Keep copies of everything and consider tracked mail.",
      "Claims generally must be filed within 3 years of when you filed the return or 2 years of when the tax was paid, whichever is later.",
    ],
  };

  return {
    claimAmount,
    employerEmail,
    form843,
    form8316,
    explanation,
    checklist,
    mailing,
    sources: PACKET_SOURCES,
  };
}
