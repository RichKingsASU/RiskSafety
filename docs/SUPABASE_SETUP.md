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
Apply migrations **in order**, then the seed. On Supabase the `authenticated` /
`anon` roles already exist, so the 0003 RLS policies resolve as-is.
```bash
CONN="postgresql://postgres:<DB_PASSWORD>@db.xzmegdibmdufgfldsbms.supabase.co:5432/postgres?sslmode=require"
for f in supabase/migrations/0001_init.sql supabase/migrations/0002_schema.sql supabase/migrations/0003_rls.sql; do
  psql "$CONN" -v ON_ERROR_STOP=1 -f "$f"
done
psql "$CONN" -v ON_ERROR_STOP=1 -f supabase/seed/seed.sql   # 1,136 carriers + 22 units
```
If your network is **IPv4-only** (the direct host is IPv6-only), use the session pooler
— get `<region>` from Dashboard → Project Settings → Database → Connection pooling
(`postgresql://postgres.xzmegdibmdufgfldsbms:<DB_PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`).

## Verify after applying
```sql
select count(*) from pg_tables where schemaname='public';          -- expect 27
select count(*) from carriers;                                     -- expect 1136
select count(*) from fleet_assets;                                 -- expect 22
select count(*) from pg_policies where schemaname='public';        -- expect 101
-- score directionality holds (expect 0):
select count(*) from risk_scores
 where (overall_score>=80 and quality_band<>'excellent')
    or (overall_score<40  and quality_band<>'poor');
```
Or run the full behavioral proof (RLS + invariants) against any reachable Postgres:
```bash
PSQL="psql \"$CONN\"" npm run db:validate    # local: PSQL="psql -h /var/run/postgresql -U postgres"
```

## To let the Claude Code environment reach Supabase (optional)
The sandbox's network policy would need to allow `*.supabase.co` / `*.supabase.com`
(and IPv4 pooler egress). This is an environment setting, not a repo change — see
https://code.claude.com/docs/en/claude-code-on-the-web (network policies). Until
then, apply migrations from your machine or CI as above.

## Phase 1 schema — DONE (as of the docs landing)
The table dictionary and RBAC matrix in `docs/Forrest_RSOS_Project_Documentation.md`
are now in-repo, so the full Phase-1 database layer is generated and validated:
- `0002_schema.sql` — all 27 tables, enums, FKs, indexes, audit + touch triggers.
- `0003_rls.sql` — ten-role RLS (101 policies).
- `supabase/seed/seed.sql` — 1,136 carriers + 22 units, correct directionality.

Only the **remote apply** (this runbook) remains, pending network/access.
