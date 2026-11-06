-- Saved answers so signed-in users don't retype them in every calculator.
-- One row per user, readable and writable only by that user (RLS).
-- Only what the calculators need: never SSNs, ITINs or account numbers.

create table public.user_facts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  status_kind text check (status_kind in (
    'f1', 'j1_student', 'm1', 'j1_scholar', 'dependent', 'h1b_other', 'green_card', 'citizen'
  )),
  first_year_in_status int check (first_year_in_status between 1950 and 2100),
  -- {"2026": 300, "2025": 330, "2024": 120}: days physically in the U.S. per year
  days_by_year jsonb not null default '{}'::jsonb check (jsonb_typeof(days_by_year) = 'object'),
  job text check (job in ('on_campus', 'cpt', 'opt', 'unauthorized')),
  w2_year int check (w2_year between 2000 and 2100),
  wages numeric(12, 2) check (wages between 0 and 10000000),
  ss_withheld numeric(12, 2) check (ss_withheld between 0 and 10000000),
  medicare_withheld numeric(12, 2) check (medicare_withheld between 0 and 10000000),
  filing_status text check (filing_status in (
    'single', 'head_of_household', 'married_joint', 'married_separate', 'qualifying_surviving_spouse'
  )),
  age_50_plus boolean,
  compensation numeric(12, 2) check (compensation between 0 and 100000000),
  magi numeric(12, 2) check (magi between 0 and 100000000),
  other_ira numeric(12, 2) check (other_ira between 0 and 100000),
  updated_at timestamptz not null default now()
);

alter table public.user_facts enable row level security;

create policy "users read their own facts"
  on public.user_facts for select to authenticated
  using (user_id = (select auth.uid()));

create policy "users add their own facts"
  on public.user_facts for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "users update their own facts"
  on public.user_facts for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "users delete their own facts"
  on public.user_facts for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.user_facts from anon;
revoke truncate on public.user_facts from authenticated;

create function public.touch_user_facts()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke execute on function public.touch_user_facts() from public, anon, authenticated;

create trigger user_facts_touch
  before update on public.user_facts
  for each row execute function public.touch_user_facts();
