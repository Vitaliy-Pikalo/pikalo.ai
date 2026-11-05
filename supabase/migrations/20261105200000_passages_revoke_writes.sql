-- Defense in depth: RLS already has no write policy for passages, but the
-- default grants still let anon/authenticated attempt writes. Remove them so
-- a future policy mistake can't open the table. Only the service role writes.
revoke insert, update, delete, truncate on public.passages from anon, authenticated;
