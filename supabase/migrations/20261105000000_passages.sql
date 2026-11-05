-- IRS passages for retrieval. Public IRS text, so anyone may read it;
-- only the ingestion pipeline (service role, which bypasses RLS) writes.
create extension if not exists vector with schema extensions;

create table public.passages (
  id text primary key,
  doc_id text not null,
  doc_title text not null,
  section text not null,
  url text not null check (url like 'https://%'),
  content text not null check (char_length(content) between 1 and 4000),
  tax_year int,
  embedding extensions.vector(1024) not null,
  updated_at timestamptz not null default now()
);

create index passages_doc_id_idx on public.passages (doc_id);
create index passages_embedding_idx
  on public.passages using hnsw (embedding extensions.vector_cosine_ops);

alter table public.passages enable row level security;

create policy "anyone can read passages"
  on public.passages for select
  to anon, authenticated
  using (true);

-- Top matches by cosine similarity, above a floor so weak matches return nothing.
create or replace function public.match_passages(
  query_embedding extensions.vector(1024),
  match_count int default 6,
  min_similarity float default 0.3
)
returns table (
  id text,
  doc_id text,
  doc_title text,
  section text,
  url text,
  content text,
  similarity float
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.doc_id, p.doc_title, p.section, p.url, p.content,
         1 - (p.embedding operator(extensions.<=>) query_embedding) as similarity
  from public.passages p
  where 1 - (p.embedding operator(extensions.<=>) query_embedding) >= min_similarity
  order by p.embedding operator(extensions.<=>) query_embedding
  limit least(match_count, 20);
$$;
