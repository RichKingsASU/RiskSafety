# Build Status & Blockers — Forrest RSOS

_Tracks what's done and what's blocking the next phases. Update as blockers clear._

## Done (Phase 0 — scaffold)
- Monorepo scaffold (workspaces, tsconfig project refs, Vitest).
- Golden files at canonical paths: `CLAUDE.md`, `packages/shared/src/constants.ts`,
  `packages/scoring/src/index.test.ts`, `supabase/migrations/0001_init.sql`.
- **Canonical scoring engine** at `packages/scoring/src/index.ts` (HIGH = GOOD;
  hard gates force red; thin-file safe; open-flag routes to review). THE engine —
  not a second version.
- Governance defaults in `.env.example` (dispatch-block dormant, AI off, COI OCR
  parse-only). `README`, `CODEOWNERS`, `SECURITY.md`, CI workflow.

## Done (Phase 1 — database layer) ✅ NEW
The two spec docs that blocked this are now in `docs/` (Implementation Plan +
Project Documentation), so the full schema/RLS/seed were generated from the table
dictionary (§4) and RBAC matrix (§5) and **validated end-to-end on Postgres 16**.

- **`supabase/migrations/0002_schema.sql`** — the remaining 23 tables (27 total),
  all enums, FKs, indexes, `updated_at` touch triggers, `fmcsa_snapshots` snapshot
  store, and the append-only audit trigger extended to every state-change table.
- **`supabase/migrations/0003_rls.sql`** — RLS for the ten roles (101 policies).
  Enforced hard rules: dispatcher = status + pre-screen (no risk data);
  external_carrier = own rows only; delete near-absent (VP only); enforcement
  writes limited to VP/safety mgr; `audit_logs` append-only + staff-read-only.
- **`supabase/seed/seed.sql`** — deterministic seed: **1,136 carriers**, **22**
  own-fleet units, 4 named example carriers, 10 role users, 9 integrations, plus
  insurance/claims/DNU/dossier/load-check fixtures. **Correct directionality**
  (an 86 is excellent/green; a revoked carrier is red despite a good score).
  Scores are **engine-emitted literals** — the FMCSA weighted-sum is computed by
  `packages/scoring` at build time (`npm run seed:build` → `supabase/seed/*.generated.sql`
  via `\ir`) and **never re-expressed in SQL**, so the seed cannot be a second scoring
  engine. `tests/unit/seed-scoring.test.ts` fails CI if a seed literal ever diverges
  from the engine (proven against both an engine-weight change and a hand-edited literal).
- **`packages/shared/src/enums.ts`** — TS mirror of every Postgres enum; one
  dictionary for app/workers/tests. `packages/fmcsa-adapter` snapshot interface
  aligned to `fmcsa_snapshots`.
- **Tests:** `tests/unit/enums.parity.test.ts` (DB↔TS enum drift guard, in
  `npm run test`) and `tests/rls/{assert.sql,run_local.sh}` (behavioral RLS +
  invariant proof). CI now has a Postgres-backed `db` job (`npm run db:validate`).

**Verified locally:** 60/60 vitest pass · typecheck clean · migrations apply on
PG16 · all RLS/invariant assertions pass · 1,136/22 canonical counts · 0 score
directionality violations · seed↔engine anti-drift guard green.

## BLOCKERS — need owner action

### 1. Apply migrations to the live Supabase project (network/access)
The migrations + seed are validated locally but **not yet pushed to Supabase**:
this sandbox's network policy denies outbound to `*.supabase.co` (403 on HTTPS,
5432/6543 time out). To apply, run the runbook in `docs/SUPABASE_SETUP.md` from a
networked machine or CI (`supabase link` + `db push`, or `psql -f` the migrations
then the seed), or allow `*.supabase.co`/`*.supabase.com` in the env network policy.
- **Rotate** the DB password (shared in plaintext) after setup; provide a
  `service_role` key if server-side workers need it.

### 2. Confirm the real repo/target
Working in **`RichKingsASU/RiskSafety`** on branch `claude/md-files-completion-94b26t`.
The plan references an org repo named `forrest-rsos`; confirm whether that's the
intended target before go-live.

## Next (not yet built)
- **Phase 3** FMCSA adapter implementation + `datahub-daily`/`sms-monthly` workers
  (needs live MOTUS/QCMobile field names — Q4).
- **Phase 4** Next.js UI (`apps/web`): single 14-item nav, corrected score views,
  confirm-with-reason enforcement, dormant dispatch-block toggle.
- **Phase 2** claims/incidents + IR playbook; Blue Wire calibration.

## Open questions (from CLAUDE.md — config placeholders, not invented)
- **Q1** R/Y/G thresholds + band→eligibility mapping (`packages/shared` defaults;
  asserted in `packages/scoring` tests).
- **Q2** Blue Wire weights + two source docs.
- **Q5** TMS name/API/auth (connector interface-first).
- **Q7** Final platform mandate (Supabase-first vs Azure/Entra).
- **Q15** Dispatch-block activation (ratify before flipping the flag).
