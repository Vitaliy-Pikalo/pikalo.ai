/**
 * The IRS pages the assistant is allowed to cite. Every retrieved passage
 * comes from one of these, so every citation links back to irs.gov or
 * FinCEN. Add a page here, re-run ingestion, and it becomes citable.
 */

export interface CorpusDoc {
  /** Stable short id used in chunk ids and citations. */
  id: string;
  title: string;
  url: string;
  /** Tax year the page describes, when it's year-specific. */
  taxYear?: number;
}

export const CORPUS: CorpusDoc[] = [
  {
    id: "p519",
    title: "IRS Publication 519, U.S. Tax Guide for Aliens",
    url: "https://www.irs.gov/publications/p519",
  },
  {
    id: "p590a",
    title: "IRS Publication 590-A, Contributions to IRAs",
    url: "https://www.irs.gov/publications/p590a",
  },
  {
    id: "p901",
    title: "IRS Publication 901, U.S. Tax Treaties",
    url: "https://www.irs.gov/publications/p901",
  },
  {
    id: "i843",
    title: "IRS Instructions for Form 843",
    url: "https://www.irs.gov/instructions/i843",
  },
  {
    id: "fica-students",
    title: "IRS: Foreign student liability for Social Security and Medicare taxes",
    url: "https://www.irs.gov/individuals/international-taxpayers/foreign-student-liability-for-social-security-and-medicare-taxes",
  },
  {
    id: "spt",
    title: "IRS: Substantial Presence Test",
    url: "https://www.irs.gov/individuals/international-taxpayers/substantial-presence-test",
  },
  {
    id: "f8843",
    title: "IRS: About Form 8843",
    url: "https://www.irs.gov/forms-pubs/about-form-8843",
  },
  {
    id: "fbar",
    title: "IRS: Report of Foreign Bank and Financial Accounts (FBAR)",
    url: "https://www.irs.gov/businesses/small-businesses-self-employed/report-of-foreign-bank-and-financial-accounts-fbar",
  },
  {
    id: "ira-2026",
    title: "IRS: 2026 IRA and 401(k) limits (IR-2025-111)",
    url: "https://www.irs.gov/newsroom/401k-limit-increases-to-24500-for-2026-ira-limit-increases-to-7500",
    taxYear: 2026,
  },
];
