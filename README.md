# Pikalo

U.S. money, explained for your first years here. Pikalo is a financial education platform for international students, immigrants and first-time filers: taxes, investing and retirement accounts, with an IRS source next to every answer.

## What's here today

- **Tax residency checker** (`/check`): determines whether someone is likely a resident or nonresident alien for U.S. federal tax purposes, using the green card test and the substantial presence test from [IRS Publication 519](https://www.irs.gov/publications/p519). It handles the exempt-individual rules for F/J/M/Q students and J/Q teachers and trainees. Cases it can't decide reliably (dual-status years, the closer connection exception, the student 5-year extension) are flagged rather than guessed. It runs entirely in the browser.
- **Ask Pikalo** (`/ask`): an AI tutor that answers U.S. tax questions from IRS publications (RAG over 1,491 passages), with every number either cited or computed by the calculators below through an MCP server. Answers that can't be verified are withheld.
- **FICA refund check** (`/fica`), **Roth IRA calculator** (`/roth`) and **money traps** (`/traps`).
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
| `EMBED_URL`                | `EmbedUrl` output of the CDK stack                  |
| `EMBED_SIGNING_SECRET`     | Value of the `EmbedSigningSecret` secret            |
| `REVIEW_QUEUE_TOKEN`       | Shared token checked by `record_withheld_answer`    |
| `SITE_URL`                 | Origin for magic-link redirects                     |
| `ASSISTANT_MODEL_ID`       | Chat model (default Nova Micro)                     |

## How the assistant works

```
question → embed (Titan v2) → top-6 IRS passages (pgvector)
         → Nova (Bedrock Converse) with MCP tools: residency, FICA, Roth
         → guards → answer with [n] citations, or withheld
```

Two deterministic guards run on every answer (`lib/assistant/ask.ts`):

1. **Tool-required.** If the user gives their own figures on a calculator's topic (W-2 amounts, income for a Roth, days in the U.S.), the answer must come from that calculator. The model gets one nudge; an answer that still states numbers without the tool is withheld.
2. **Number provenance.** Every quantity in the answer must appear in a retrieved passage, a tool result or the question (`lib/assistant/provenance.ts`). One repair attempt, then the answer is withheld.

Why both: in evals, a model answered a 2026 Roth question with $7,000 (the 2025 limit). That number _was_ in a retrieved source, so provenance alone passed it; the tool-required guard catches it.

### Evals

Production runs **Nova Micro**: it tied Nova Lite on the live suite at about a third of the cost. The decision rule (ship the cheaper model only on a tie) was set before the final run. The model is switchable with `ASSISTANT_MODEL_ID`.

- `npm run eval` (CI gate, every push): 33 calculator cases and 14 provenance cases, 100% required.
- `npm run eval:assistant -- --base https://pikalo.org` (live): 11 end-to-end questions covering tool use, retrieval facts, out-of-scope, prompt injection and invented-penalty bait. Deterministic scoring, no model grading.

| Model                       | Live eval | Cost per answer (approx.) |
| --------------------------- | --------- | ------------------------- |
| Nova Lite                   | 11/11     | ~$0.001                   |
| **Nova Micro (production)** | **11/11** | **~$0.0003**              |

## Accounts and the review queue

- **Sign-in:** Supabase Auth magic links (`/login`, PKCE). `proxy.ts` refreshes sessions only on `/review` and `/account`, so public pages stay static.
- **Roles:** `profiles.role` is `user`, `reviewer` or `admin`. Users can read their own role and can't change it.
- **Review queue** (`/review`, reviewers only): when a guard withholds an answer, `/api/ask` stores the question and draft, with SSNs, ITINs, A-numbers, account numbers and emails removed. It writes through `record_withheld_answer`, an insert-only RPC that checks a shared token inside the database, so the app holds no service-role key. Reviewers can change only status and note; the database stamps who reviewed and when. Rows are deleted after 90 days (pg_cron).
- **RLS test:** `supabase/tests/review_queue_rls.sql` simulates anon, a user and a reviewer in a rolled-back transaction (15 checks).

## AWS pipeline (`infra/`)

A CDK stack (TypeScript, us-east-2) that keeps the assistant's IRS knowledge base current and embeds questions at query time:

```
EventBridge (weekly) → Ingest Lambda → fetch IRS page → S3 archive (versioned)
                                     → chunk → Bedrock Titan v2 embeddings (1024-d)
                                     → Supabase pgvector (upsert, then drop stale rows)

Vercel app → HMAC-signed POST → Embed Lambda (function URL) → Bedrock Titan v2
```

- **No long-lived AWS keys.** Vercel holds only an HMAC signing key. Each request signs `timestamp.body`; the Lambda rejects bad signatures and anything outside a 5-minute window (replay protection) before calling Bedrock. OIDC roles for Vercel and GitHub exist behind `-c enableOidc=true` for accounts whose org policy allows OIDC providers.
- **Least privilege.** Every Bedrock grant is `InvokeModel` on the single Titan embedding model ARN; the S3 archive is append-only. Asserted in `infra/test/stack.test.ts`.
- **Safe re-ingest.** Unchanged pages are skipped by hash; an empty or failed page never deletes existing passages; the S3 archive is written last so a failed run retries.
- **The Supabase service key lives only in Secrets Manager**, read by the ingest Lambda; it never touches Vercel.

```bash
cd infra
npm install
npm test           # CDK assertion tests (synth + bundle)
npx cdk deploy     # needs AWS credentials and a bootstrapped account
```

## Roadmap

- Citation-grounded assistant (retrieval over IRS publications and state revenue guidance) with an evaluation set for answer and citation accuracy
- Scenario walkthroughs: first internship on OPT, moving states, Roth IRA eligibility on a work visa
- Short lessons on U.S. investing, credit and retirement accounts

## Disclaimer

Pikalo is educational. It is not tax, legal or investment advice.
