-- RLS test for user_facts. One transaction, rolled back. Last run 2026-11-06.
-- Expect: owner reads/writes own row; other user sees 0 rows and can't
-- write or delete it; anon denied; out-of-range values rejected.
begin;
create temp table t (n int, test text, outcome text) on commit drop;
grant all on t to anon, authenticated;
insert into auth.users (id, email, aud, role) values
 ('00000000-0000-0000-0000-0000000000c1', 'facts-a@test.invalid', 'authenticated', 'authenticated'),
 ('00000000-0000-0000-0000-0000000000c2', 'facts-b@test.invalid', 'authenticated', 'authenticated');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$ begin insert into public.user_facts (user_id, status_kind, first_year_in_status, days_by_year) values (auth.uid(), 'f1', 2024, '{"2026":300}'); insert into t values (1,'owner inserts own row','ok'); exception when others then insert into t values (1,'owner inserts own row','denied: '||sqlerrm); end $$;
do $$ begin insert into public.user_facts (user_id, status_kind) values ('00000000-0000-0000-0000-0000000000c2', 'f1'); insert into t values (2,'owner inserts row for someone else','ALLOWED (bad)'); exception when others then insert into t values (2,'owner inserts row for someone else','denied: '||sqlerrm); end $$;
do $$ begin update public.user_facts set wages = -5 where user_id = auth.uid(); insert into t values (3,'negative wages','ALLOWED (bad)'); exception when others then insert into t values (3,'negative wages','denied: '||sqlerrm); end $$;
do $$ begin update public.user_facts set status_kind = 'tourist' where user_id = auth.uid(); insert into t values (4,'unknown status','ALLOWED (bad)'); exception when others then insert into t values (4,'unknown status','denied: '||sqlerrm); end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c2","role":"authenticated"}', true);
do $$ declare c int; begin select count(*) into c from public.user_facts; insert into t values (5,'other user reads', c||' rows'); end $$;
do $$ declare c int; begin update public.user_facts set wages = 1; get diagnostics c = row_count; insert into t values (6,'other user updates', c||' rows'); end $$;
do $$ declare c int; begin delete from public.user_facts; get diagnostics c = row_count; insert into t values (7,'other user deletes', c||' rows'); end $$;
reset role;

set local role anon;
do $$ begin perform 1 from public.user_facts; insert into t values (8,'anon reads','ALLOWED (bad)'); exception when others then insert into t values (8,'anon reads','denied: '||sqlerrm); end $$;
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000c1","role":"authenticated"}', true);
do $$ declare c int; begin select count(*) into c from public.user_facts; insert into t values (9,'owner still has row', c||' rows'); end $$;
do $$ declare c int; begin delete from public.user_facts where user_id = auth.uid(); get diagnostics c = row_count; insert into t values (10,'owner deletes own row', c||' rows'); end $$;
reset role;
select n, test, outcome from t order by n;
rollback;
