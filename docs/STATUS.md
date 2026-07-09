# Build Status & Blockers — Forrest RSOS

_Phase 0 scaffold committed. This file tracks what's done and what's blocking the
next phases. Update it as blockers clear._

## Done (Phase 0 — local, non-destructive)
- Monorepo scaffold (workspaces, tsconfig project refs, Vitest).
- Golden files placed at canonical paths: `CLAUDE.md`, `packages/shared/src/constants.ts`,
  `packages/scoring/src/index.test.ts`, `supabase/migrations/0001_init.sql`.
- **Canonical scoring engine reconstructed** at `packages/scoring/src/index.ts` to
  satisfy the golden tests (HIGH = GOOD; hard gates force red; thin-file safe;
  open-flag routes to review). This is THE implementation — not a second version.
- Governance defaults encoded in `.env.example` (dispatch-block dormant, AI off,
  COI OCR parse-only). `README`, `CODEOWNERS`, `SECURITY.md`, CI workflow.

## BLOCKERS — need owner action before the cloud/schema phases

### 1. Supabase credentials received, but this sandbox cannot reach Supabase
Project **RiskSafety** (ref `xzmegdibmdufgfldsbms`) credentials were provided and
stored in git-ignored `.env.local`. However, the sandbox **network policy denies
outbound access to Supabase**: the egress gateway returns `403` on HTTPS to
`*.supabase.co`, IPv6 is unsupported, and Postgres ports 5432/6543 time out. So
migrations cannot be applied from here.
- ✅ The golden `0001_init.sql` was **validated locally** against Postgres 16 —
  applies cleanly (9 enums, 4 tables, RLS on all, append-only audit trigger fires).
- **To apply:** run the runbook in `docs/SUPABASE_SETUP.md` from a networked machine
  or CI (`supabase link` + `db push`, or direct `psql`). Optionally, change the
  environment's network policy to allow `*.supabase.co`/`*.supabase.com`.
- **Rotate** the DB password (shared in plaintext) after setup; provide a
  `service_role` key if server-side workers need it.

### 2. Two required spec documents were never provided
`CLAUDE.md` and the build prompt both reference these as read-before-you-build:
- `docs/Forrest_RSOS_Implementation_Plan.md`  — **MISSING**
- `docs/Forrest_RSOS_Project_Documentation.md` — **MISSING** (table dictionary +
  RBAC matrix + SOPs)

Without the **table dictionary** the remaining ~22 tables cannot be generated
faithfully; without the **RBAC matrix** the ten-role RLS policies cannot be written.
CLAUDE.md forbids inventing this context. **Need:** upload both docs into `docs/`.

## Repo/target notes / assumptions
- Working in the existing repo **`RichKingsASU/RiskSafety`** on branch
  `claude/forrest-rsos-build-36v1i7`. The prompt mentioned a GitHub *org* and a
  repo named `forrest-rsos`; I did **not** create a new repo (out of branch scope).
  Confirm whether the real target is an org repo named `forrest-rsos`.
- Auth account is a **personal** account (`RichKingsASU`), not an org.

## Open questions (from CLAUDE.md — using config placeholders, not invented)
- **Q1** R/Y/G thresholds + band→eligibility mapping (`packages/shared` defaults).
- **Q2** Blue Wire weights + two source docs.
- **Q5** TMS name/API/auth (connector interface-first).
- **Q7** Final platform mandate (Supabase-first vs Azure/Entra).
- **Q15** Dispatch-block activation (ratify before flipping the flag).
