-- RLS test for the review queue. Runs in one transaction and rolls back.
-- Run in the Supabase SQL editor (or via MCP execute_sql); every row of the
-- final result must read "denied", "0 rows", "user", or the expected count.
--
-- Last run 2026-11-05: 15/15 as expected.
begin;
create temp table t (n int, test text, outcome text) on commit drop;
grant all on t to anon, authenticated;
insert into auth.users (id, email, aud, role) values
 ('00000000-0000-0000-0000-0000000000a1', 'rls-user@test.invalid', 'authenticated', 'authenticated'),
 ('00000000-0000-0000-0000-0000000000b2', 'rls-reviewer@test.invalid', 'authenticated', 'authenticated');
update public.profiles set role = 'reviewer' where id = '00000000-0000-0000-0000-0000000000b2';

-- anon
set local role anon;
do $$ begin perform public.record_withheld_answer('wrong-token-wrong-token-wrong-token', 'm', 'q', 'd'); insert into t values (1,'anon RPC wrong token','ALLOWED (bad)'); exception when others then insert into t values (1,'anon RPC wrong token','denied: '||sqlerrm); end $$;
do $$ declare c int; begin select count(*) into c from public.withheld_answers; insert into t values (3,'anon reads queue', c||' rows'); exception when others then insert into t values (3,'anon reads queue','denied: '||sqlerrm); end $$;
do $$ begin perform 1 from private.app_secrets; insert into t values (4,'anon reads secrets','ALLOWED (bad)'); exception when others then insert into t values (4,'anon reads secrets','denied: '||sqlerrm); end $$;
do $$ begin insert into public.withheld_answers (model, question, draft) values ('m','q','d'); insert into t values (5,'anon direct insert','ALLOWED (bad)'); exception when others then insert into t values (5,'anon direct insert','denied: '||sqlerrm); end $$;
reset role;

select public.record_withheld_answer((select value from private.app_secrets where name='queue_token'), 'us.amazon.nova-micro-v1:0', 'test question', 'draft with $9,999', '["$9,999"]'::jsonb);
insert into t values (2,'RPC with correct token', (select count(*)||' row(s) in queue' from public.withheld_answers));

-- normal signed-in user
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
do $$ declare c int; begin select count(*) into c from public.withheld_answers; insert into t values (6,'user reads queue', c||' rows'); end $$;
do $$ declare c int; begin update public.withheld_answers set status='approved'; get diagnostics c = row_count; insert into t values (7,'user triages queue', c||' rows updated'); exception when others then insert into t values (7,'user triages queue','denied: '||sqlerrm); end $$;
do $$ begin update public.profiles set role='admin' where id = auth.uid(); insert into t values (8,'user promotes self','ALLOWED (bad)'); exception when others then insert into t values (8,'user promotes self','denied: '||sqlerrm); end $$;
do $$ declare r text; begin select role into r from public.profiles where id = auth.uid(); insert into t values (9,'user reads own role', coalesce(r,'none')); end $$;
reset role;

-- reviewer
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}', true);
do $$ declare c int; begin select count(*) into c from public.withheld_answers; insert into t values (10,'reviewer reads queue', c||' rows'); end $$;
do $$ declare c int; begin update public.withheld_answers set status='rejected', reviewer_note='wrong year'; get diagnostics c = row_count; insert into t values (11,'reviewer triages', c||' rows updated'); exception when others then insert into t values (11,'reviewer triages','denied: '||sqlerrm); end $$;
do $$ begin update public.withheld_answers set draft='tampered'; insert into t values (12,'reviewer edits draft','ALLOWED (bad)'); exception when others then insert into t values (12,'reviewer edits draft','denied: '||sqlerrm); end $$;
do $$ begin delete from public.withheld_answers; insert into t values (13,'reviewer deletes', 'no error (check rows)'); exception when others then insert into t values (13,'reviewer deletes','denied: '||sqlerrm); end $$;
reset role;
insert into t select 14, 'stamped reviewer + time', (reviewed_by = '00000000-0000-0000-0000-0000000000b2' and reviewed_at is not null)::text from public.withheld_answers limit 1;
insert into t select 15, 'rows left after reviewer delete', count(*)::text from public.withheld_answers;
select n, test, outcome from t order by n;
rollback;
