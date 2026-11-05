# Pikalo

U.S. money, explained for your first years here. Pikalo is a financial education platform for international students, immigrants and first-time filers: taxes, investing and retirement accounts, with an IRS source next to every answer.

## What's here today

- **Tax residency checker** (`/check`): determines whether someone is likely a resident or nonresident alien for U.S. federal tax purposes, using the green card test and the substantial presence test from [IRS Publication 519](https://www.irs.gov/publications/p519). It handles the exempt-individual rules for F/J/M/Q students and J/Q teachers and trainees. Cases it can't decide reliably (dual-status years, the closer connection exception, the student 5-year extension) are flagged rather than guessed. It runs entirely in the browser.
- **Waitlist**: email signup stored in Supabase Postgres with row-level security (public role can insert, never read).

## Design decisions

- **Rules engine, not an LLM, for residency.** The residency test is deterministic law, so `lib/residency.ts` is a pure function with exhaustive unit tests, including boundary cases (183 days, 31 days, leap years, the year-6 student transition, and the teacher exemption cycle).
- **Integer math for the 183-day test.** `6·current + 2·prior1 + prior2 ≥ 1098` avoids floating-point errors at the threshold.
- **Insert-only RLS.** The waitlist uses the Supabase publishable key; the database policy allows `INSERT` for `anon` with no `SELECT`, so leaked keys can't read emails.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS v4 · Supabase · Vitest · Vercel

## Run locally

```bash
npm install
cp .env.example .env.local   # add your Supabase URL and publishable key
npm run dev                  # http://localhost:3000
npm test                     # unit tests
npm run build                # production build
```

## Deployment

Hosted on Vercel. Every push to `main` deploys to production, and GitHub Actions runs lint, typecheck, tests and build in parallel. Required environment variables (set in the Vercel project):

| Variable                   | Purpose                                             |
| -------------------------- | --------------------------------------------------- |
| `SUPABASE_URL`             | Supabase project URL                                |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key; the table's RLS allows insert-only |

## Roadmap

- Citation-grounded assistant (retrieval over IRS publications and state revenue guidance) with an evaluation set for answer and citation accuracy
- Scenario walkthroughs: first internship on OPT, moving states, Roth IRA eligibility on a work visa
- Short lessons on U.S. investing, credit and retirement accounts

## Disclaimer

Pikalo is educational. It is not tax, legal or investment advice.
