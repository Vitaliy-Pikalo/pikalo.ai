-- Shared rate limit for /api/ask, so limits hold across serverless instances,
-- plus a global daily ceiling that caps model spend.
--
-- Clients are identified by an HMAC of their IP computed in the app (the
-- database never sees a raw IP). Limits live here, not in the request, so a
-- caller can't raise them. Same token gate as record_withheld_answer.

create table private.rate_limits (
  bucket text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, window_start)
);

create function public.hit_rate_limit(p_token text, p_client text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  per_minute constant int := 8;
  per_day constant int := 60;
  global_per_day constant int := 3000;
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  m int;
  d int;
  g int;
  expected text := (select value from private.app_secrets where name = 'queue_token');
begin
  if expected is null or p_token is null or p_token <> expected then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_client is null or p_client !~ '^[0-9a-f]{64}$' then
    raise exception 'bad client id' using errcode = '22023';
  end if;

  insert into private.rate_limits as r (bucket, window_start, hits)
  values ('m:' || p_client, minute_start, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into m;

  insert into private.rate_limits as r (bucket, window_start, hits)
  values ('d:' || p_client, day_start, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into d;

  insert into private.rate_limits as r (bucket, window_start, hits)
  values ('global', day_start, 1)
  on conflict (bucket, window_start) do update set hits = r.hits + 1
  returning hits into g;

  if g > global_per_day then
    return jsonb_build_object('ok', false, 'scope', 'global',
      'retry_after', ceil(extract(epoch from (day_start + interval '1 day' - now())))::int);
  elsif d > per_day then
    return jsonb_build_object('ok', false, 'scope', 'day',
      'retry_after', ceil(extract(epoch from (day_start + interval '1 day' - now())))::int);
  elsif m > per_minute then
    return jsonb_build_object('ok', false, 'scope', 'minute',
      'retry_after', ceil(extract(epoch from (minute_start + interval '1 minute' - now())))::int);
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.hit_rate_limit(text, text) from public;
grant execute on function public.hit_rate_limit(text, text) to anon, authenticated;

select cron.schedule(
  'purge-rate-limits',
  '7 * * * *',
  $$delete from private.rate_limits where window_start < now() - interval '2 days'$$
);
