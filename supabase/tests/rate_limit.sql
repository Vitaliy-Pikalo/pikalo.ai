-- Rate-limit test. One transaction, rolled back. Last run 2026-11-05: 6/6.
-- Expect: 8th ok, 9th {"ok": false, "scope": "minute"}, other client ok,
-- wrong token / anon table read / raw IP all denied.
begin;
create temp table t (n int, test text, outcome text) on commit drop;
grant all on t to anon;
do $$
declare tok text := (select value from private.app_secrets where name='queue_token'); r jsonb; i int; c text := repeat('ab', 32);
begin
  for i in 1..8 loop r := public.hit_rate_limit(tok, c); end loop;
  insert into t values (1, '8th call in a minute', r::text);
  r := public.hit_rate_limit(tok, c);
  insert into t values (2, '9th call in a minute', r::text);
  r := public.hit_rate_limit(tok, repeat('cd', 32));
  insert into t values (3, 'different client same minute', r::text);
end $$;
set local role anon;
do $$ begin perform public.hit_rate_limit('wrong-token-wrong-token-wrong-token', repeat('ab',32)); insert into t values (4,'wrong token','ALLOWED (bad)'); exception when others then insert into t values (4,'wrong token','denied: '||sqlerrm); end $$;
do $$ begin perform 1 from private.rate_limits; insert into t values (5,'anon reads counters','ALLOWED (bad)'); exception when others then insert into t values (5,'anon reads counters','denied: '||sqlerrm); end $$;
reset role;
do $$ begin perform public.hit_rate_limit((select value from private.app_secrets where name='queue_token'), '1.2.3.4'); insert into t values (6,'raw IP as client id','ALLOWED (bad)'); exception when others then insert into t values (6,'raw IP as client id','denied: '||sqlerrm); end $$;
select n, test, outcome from t order by n;
rollback;
