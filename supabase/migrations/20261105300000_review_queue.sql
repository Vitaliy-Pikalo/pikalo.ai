-- Accounts, roles and the human review queue for withheld assistant answers.
--
-- Roles live in profiles and only the service role can change them.
-- The app (Vercel) records withheld answers through a token-gated,
-- insert-only RPC; it holds no service-role key. Reviewers read and
-- triage the queue under RLS and may only change status and their note.
-- Rows are deleted after 90 days.

-- ---------- Profiles and roles ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'reviewer', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "users read their own profile"
  on public.profiles for select
  to authenticated
  using (id = (select auth.uid()));

revoke insert, update, delete, truncate on public.profiles from anon, authenticated;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id) select id from auth.users on conflict do nothing;

create function public.is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role in ('reviewer', 'admin')
  );
$$;

revoke execute on function public.is_reviewer() from public, anon;
grant execute on function public.is_reviewer() to authenticated;

-- ---------- Private secrets (not exposed through the API) ----------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.app_secrets (
  name text primary key,
  value text not null check (char_length(value) >= 32)
);

-- ---------- Withheld answers ----------

create table public.withheld_answers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  model text not null check (char_length(model) between 1 and 100),
  question text not null check (char_length(question) between 1 and 1000),
  draft text not null check (char_length(draft) <= 6000),
  reason jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb,
  tools jsonb not null default '[]'::jsonb,
  status text not null default 'open' check (status in ('open', 'approved', 'rejected')),
  reviewer_note text check (char_length(reviewer_note) <= 2000),
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz
);

create index withheld_answers_status_created_idx
  on public.withheld_answers (status, created_at desc);

alter table public.withheld_answers enable row level security;

create policy "reviewers read the queue"
  on public.withheld_answers for select
  to authenticated
  using ((select public.is_reviewer()));

create policy "reviewers triage the queue"
  on public.withheld_answers for update
  to authenticated
  using ((select public.is_reviewer()))
  with check ((select public.is_reviewer()));

-- Reviewers may change only these two columns; everything else is fixed.
revoke insert, update, delete, truncate on public.withheld_answers from anon, authenticated;
grant update (status, reviewer_note) on public.withheld_answers to authenticated;

-- Who reviewed and when is stamped by the database, not sent by the client.
create function public.stamp_review()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.reviewed_by := (select auth.uid());
  new.reviewed_at := now();
  return new;
end;
$$;

create trigger withheld_answers_stamp_review
  before update on public.withheld_answers
  for each row execute function public.stamp_review();

-- The only write path for the app: checks a shared token, inserts, returns nothing.
create function public.record_withheld_answer(
  p_token text,
  p_model text,
  p_question text,
  p_draft text,
  p_reason jsonb default '[]'::jsonb,
  p_citations jsonb default '[]'::jsonb,
  p_tools jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  expected text := (select value from private.app_secrets where name = 'queue_token');
begin
  if expected is null or p_token is null or p_token <> expected then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.withheld_answers (model, question, draft, reason, citations, tools)
  values (
    p_model, p_question, p_draft,
    coalesce(p_reason, '[]'::jsonb),
    coalesce(p_citations, '[]'::jsonb),
    coalesce(p_tools, '[]'::jsonb)
  );
end;
$$;

revoke execute on function public.record_withheld_answer(text, text, text, text, jsonb, jsonb, jsonb) from public;
grant execute on function public.record_withheld_answer(text, text, text, text, jsonb, jsonb, jsonb) to anon, authenticated;

-- ---------- Retention: 90 days ----------

create extension if not exists pg_cron;

select cron.schedule(
  'purge-withheld-answers',
  '17 4 * * *',
  $$delete from public.withheld_answers where created_at < now() - interval '90 days'$$
);
