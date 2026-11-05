-- Waitlist (applied 2026-11-04). Public can insert, never read.
create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null
    check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  segment text
    check (segment in ('international_student','recent_immigrant','us_young_adult','other')),
  school text check (char_length(school) <= 120),
  source text check (char_length(source) <= 60),
  created_at timestamptz not null default now()
);

create unique index waitlist_email_unique on public.waitlist (lower(email));

alter table public.waitlist enable row level security;

create policy "public can join waitlist"
  on public.waitlist for insert
  to anon
  with check (true);
