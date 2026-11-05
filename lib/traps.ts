/**
 * "Money traps" guide content. Each entry is something newcomers commonly
 * lose money on, with an official or primary source. See docs/research.md.
 */

export type Situation = "student" | "worker" | "newcomer" | "first_gen";

export interface Trap {
  slug: string;
  title: string;
  /** What goes wrong, in one or two sentences. */
  happens: string;
  /** How to tell if it applies to you. */
  check: string;
  /** What to do about it. */
  action: string;
  situations: Situation[];
  category: "taxes" | "banking" | "scams";
  tool?: { href: string; label: string };
  source: { title: string; url: string };
}

export const TRAPS: Trap[] = [
  {
    slug: "fica",
    title: "Social Security tax taken from a student paycheck",
    happens:
      "Nonresident F-1, J-1 and M-1 students usually don't owe Social Security or Medicare tax on campus jobs, CPT or OPT, but payroll often withholds it anyway.",
    check:
      "Look at boxes 4 and 6 on your W-2. If they aren't empty, check whether you're exempt.",
    action:
      "Ask your employer to refund it first. If they won't, file IRS Form 843 with Form 8316.",
    situations: ["student"],
    category: "taxes",
    tool: { href: "/fica", label: "Check your W-2" },
    source: {
      title: "IRS: Foreign student liability for Social Security and Medicare taxes",
      url: "https://www.irs.gov/individuals/international-taxpayers/foreign-student-liability-for-social-security-and-medicare-taxes",
    },
  },
  {
    slug: "wrong-return",
    title: "Filing a resident return when you're a nonresident",
    happens:
      "Mainstream tax software files Form 1040, the resident return. Nonresidents file Form 1040-NR. Filing the wrong one can claim credits you don't qualify for and may cause problems with future visa applications.",
    check: "Find out whether you're a resident or nonresident for tax before you file.",
    action:
      "If you already filed the wrong return, file an amended return (Form 1040-X) as a nonresident. Your school may offer nonresident tax software.",
    situations: ["student", "worker"],
    category: "taxes",
    tool: { href: "/check", label: "Check your residency" },
    source: {
      title: "IRS Publication 519, U.S. Tax Guide for Aliens",
      url: "https://www.irs.gov/publications/p519",
    },
  },
  {
    slug: "form-8843",
    title: "Skipping Form 8843 because you had no income",
    happens:
      "Students, teachers and trainees who exclude days from the presence test generally must file Form 8843, even with no U.S. income at all.",
    check: "You're on F, J, M or Q status and were in the U.S. any part of the year.",
    action:
      "File Form 8843 for each year, by itself if you had no income, or attached to your 1040-NR.",
    situations: ["student"],
    category: "taxes",
    source: {
      title: "IRS: About Form 8843",
      url: "https://www.irs.gov/forms-pubs/about-form-8843",
    },
  },
  {
    slug: "fbar",
    title: "Not reporting bank accounts back home",
    happens:
      "Once you're a U.S. tax resident, you're a U.S. person for this rule. If your foreign accounts add up to more than $10,000 at any point in the year, you must file an FBAR (FinCEN Form 114). Penalties for not filing can be large.",
    check:
      "Add up the highest balance of every account you have outside the U.S. during the year, including savings and accounts you can sign on.",
    action:
      "File FinCEN Form 114 online through BSA E-Filing. It's due April 15, with an automatic extension to October 15.",
    situations: ["worker", "newcomer"],
    category: "banking",
    source: {
      title: "IRS: Report of Foreign Bank and Financial Accounts (FBAR)",
      url: "https://www.irs.gov/businesses/small-businesses-self-employed/report-of-foreign-bank-and-financial-accounts-fbar",
    },
  },
  {
    slug: "treaty",
    title: "Missing a tax treaty benefit",
    happens:
      "The U.S. has tax treaties with many countries that can exempt some student or researcher income. They aren't applied automatically, and some must be disclosed on Form 8833, with a $1,000 penalty for not filing it when required.",
    check: "Look up your home country in IRS Publication 901.",
    action:
      "Ask your employer or school how to claim the treaty on withholding, and claim it on your return.",
    situations: ["student", "worker"],
    category: "taxes",
    source: {
      title: "IRS Publication 901, U.S. Tax Treaties",
      url: "https://www.irs.gov/publications/p901",
    },
  },
  {
    slug: "ghost-preparer",
    title: "Paying a preparer who won't sign your return",
    happens:
      "Ghost preparers fill out returns, often with fake deductions, then don't sign them and disappear. You're responsible for what's on the return.",
    check:
      "Warning signs: they won't sign as preparer, want cash only, charge a percentage of your refund, or want the refund sent to their account.",
    action:
      "Check the preparer in the IRS directory, read the whole return before signing, and never sign a blank form. Free help: IRS VITA clinics.",
    situations: ["student", "worker", "newcomer", "first_gen"],
    category: "scams",
    source: {
      title: "GAO: Beware ghost preparers",
      url: "https://www.gao.gov/blog/beware-ghost-preparers-they-can-haunt-your-tax-filings",
    },
  },
  {
    slug: "notario",
    title: "Getting immigration advice from a notario",
    happens:
      "In the U.S., a notary public can't give legal advice. People advertising as notarios sometimes charge for immigration help they're not allowed to give, or for government forms that are free.",
    check:
      "Only a licensed attorney or a DOJ-accredited representative can give immigration legal advice. Government forms are always free.",
    action:
      "Never sign a blank form or hand over original documents. Report fraud to the FTC at ftc.gov/complaint.",
    situations: ["newcomer"],
    category: "scams",
    source: {
      title: "Connecticut: Common scams targeting immigrants",
      url: "https://portal.ct.gov/SmartConsumer/SmartConsumer/Immigrants-and-Refugees/Common-Scams-Targeting-Immigrants---Do",
    },
  },
  {
    slug: "credit",
    title: "Starting with no credit history",
    happens:
      "Your credit history from home doesn't transfer. With no U.S. history you can face rejected rental applications, bigger deposits and higher insurance rates.",
    check: "You've never had a U.S. credit card or loan in your name.",
    action:
      "Start with a secured card or a student card, pay the full balance every month, and keep usage low. Some issuers accept an ITIN instead of an SSN.",
    situations: ["student", "worker", "newcomer"],
    category: "banking",
    source: {
      title: "WAMC: Immigrants and the U.S. credit system",
      url: "https://www.wamc.org/2023-05-24/welcome-to-america-now-learn-to-be-in-debt",
    },
  },
  {
    slug: "remittance",
    title: "Overpaying to send money home",
    happens:
      "Transfer costs include the fee and a markup on the exchange rate. The UN goal is to bring the cost of sending money below 3%.",
    check:
      "Compare how much arrives on the other side, not just the fee. Check the provider's rate against the market rate.",
    action:
      "Compare a few licensed providers for your corridor before each large transfer, and keep the receipt.",
    situations: ["worker", "newcomer"],
    category: "banking",
    source: {
      title: "World Bank: SDG indicator 10.c.1",
      url: "https://worldbank.github.io/sdg-metadata/phase-2/metadata/en/10-c-1",
    },
  },
  {
    slug: "roth",
    title: "Contributing to a Roth IRA with income that doesn't count",
    happens:
      "You can only contribute up to your taxable compensation. Wages exempt under a tax treaty don't count, and income limits cut the amount for higher earners.",
    check: "Check your taxable U.S. wages and income for the year.",
    action:
      "Use the calculator before you contribute, and fix excess contributions before the tax deadline.",
    situations: ["worker", "first_gen"],
    category: "taxes",
    tool: { href: "/roth", label: "Calculate your limit" },
    source: {
      title: "IRS Publication 590-A",
      url: "https://www.irs.gov/publications/p590a",
    },
  },
];

export const CATEGORY_LABELS: Record<Trap["category"], string> = {
  taxes: "Taxes",
  banking: "Banking and credit",
  scams: "Scams",
};
