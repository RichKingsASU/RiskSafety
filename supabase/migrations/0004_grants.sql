-- supabase/migrations/0004_grants.sql
-- App-role privilege grants (the "Supabase-default" bootstrap), codified.
--
-- WHY THIS EXISTS
--   Every RLS policy in 0003 calls app.uid() / app.role() (and the app.is_*()
--   helpers built on them). To evaluate those, the querying role needs USAGE on
--   schema `app` AND EXECUTE on its functions. On a hosted Supabase project the
--   default privileges cover schema `public`, but NOT a custom schema like `app`
--   — so without the grant below, EVERY policy errors with
--       ERROR: permission denied for schema app
--   and authenticated users can read nothing. This migration makes the grants an
--   applied, reproducible part of the schema instead of an out-of-band step.
--
-- SINGLE SOURCE OF TRUTH
--   This block was previously duplicated inline in tests/rls/run_local.sh. That
--   script now relies on this migration (applied in its migration loop) instead
--   of re-issuing the grants, so the two cannot drift. Keep them in sync here.
--
-- IDEMPOTENT
--   GRANT/REVOKE are naturally idempotent — this migration is safe to re-run and
--   is a no-op against a project where the privileges already exist.
--
-- OPEN QUESTION (surfaced for review, not decided here)
--   `anon` is granted USAGE on schema app below to mirror the historical block.
--   Nothing anon-facing currently calls app.* functions, so this could likely be
--   scoped to `authenticated` only. Left as-is (authenticated, anon) pending a
--   reviewer decision — see the PR description.

grant usage on schema public to authenticated, anon;
grant usage on schema app    to authenticated, anon;
grant all    on all tables    in schema public to authenticated;
grant select on all tables    in schema public to anon;
grant execute on all functions in schema app to authenticated, anon;

-- Append-only backbone: the blanket `grant all ... to authenticated` above re-adds
-- UPDATE/DELETE on audit_logs, so re-assert the 0001 revoke to keep it append-only.
-- (CLAUDE.md rule #4 — audit_logs is append-only for app roles.)
revoke update, delete on audit_logs from authenticated, anon;
