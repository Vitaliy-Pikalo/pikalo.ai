-- Trigger functions run from their triggers; nobody should call them over
-- the API (Supabase security advisor 0028/0029). record_withheld_answer
-- (token-gated, insert-only) and is_reviewer (returns the caller's own
-- role check, used by RLS) stay callable on purpose.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.stamp_review() from public, anon, authenticated;
