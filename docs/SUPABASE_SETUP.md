# Supabase Setup & Migration Runbook

Project **RiskSafety** (Work4Vince org). Ref `xzmegdibmdufgfldsbms`,
URL `https://xzmegdibmdufgfldsbms.supabase.co`.

> **Why this is a runbook and not "already done":** the Claude Code sandbox that
> built this repo has a network policy that **denies outbound access to Supabase**
> (the egress gateway returns `403` on HTTPS to `*.supabase.co`, IPv6 is
> unsupported, and Postgres ports 5432/6543 are blocked). So the migration must be
> applied from a machine with normal network access — yours, or CI. The migration
> itself was validated locally against Postgres 16 and applies cleanly.

## Secrets — do not commit
Real values live in **`.env.local`** (git-ignored). `.env.example` is the template.
The DB password and connection string were shared in chat — **rotate the DB
password** after setup (Dashboard → Project Settings → Database → Reset password),
and generate a **service_role key** if server-side workers need it (not yet provided).

## Option A — Supabase CLI (recommended; tracks migrations)
```bash
# 1. Personal access token: https://supabase.com/dashboard/account/tokens
export SUPABASE_ACCESS_TOKEN=<your-token>

# 2. Link this repo to the project (prompts for the DB password)
supabase link --project-ref xzmegdibmdufgfldsbms

# 3. Apply everything in supabase/migrations/ to the remote DB
supabase db push
```

## Option B — direct psql (no CLI)
```bash
psql "postgresql://postgres:<DB_PASSWORD>@db.xzmegdibmdufgfldsbms.supabase.co:5432/postgres?sslmode=require" \
  -f supabase/migrations/0001_init.sql
```
If your network is **IPv4-only** (the direct host is IPv6-only), use the session pooler
— get `<region>` from Dashboard → Project Settings → Database → Connection pooling:
```bash
psql "postgresql://postgres.xzmegdibmdufgfldsbms:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require" \
  -f supabase/migrations/0001_init.sql
```

## Verify after applying
```sql
select tablename from pg_tables where schemaname='public' order by 1;
-- expect: audit_logs, carriers, risk_scores, safety_events (Phase 0 golden set)
select relname from pg_class where relrowsecurity and relkind='r';  -- RLS on all four
```

## To let the Claude Code environment reach Supabase (optional)
The sandbox's network policy would need to allow `*.supabase.co` / `*.supabase.com`
(and IPv4 pooler egress). This is an environment setting, not a repo change — see
https://code.claude.com/docs/en/claude-code-on-the-web (network policies). Until
then, apply migrations from your machine or CI as above.

## Still needed before Phase 1 schema
The remaining ~22 tables + the 10-role RLS matrix require the **table dictionary**
and **RBAC matrix** from `docs/Forrest_RSOS_Project_Documentation.md`, which is still
a placeholder. Provide that doc and Phase 1 migrations can be generated.
