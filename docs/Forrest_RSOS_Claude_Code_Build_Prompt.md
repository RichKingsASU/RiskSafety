# Forrest RSOS — Claude Code Build Guide & Kickoff Prompt

This is the Claude Code counterpart to the Antigravity master prompt. Two parts:
**Part A** sets Claude Code up (install, MCP servers, project files). **Part B** is the prompt you paste into Claude Code to drive the phased build.

The single most important artifact is **`CLAUDE.md`** (already generated). Claude Code reads it at the start of every session, so it — not this prompt — is what keeps the build from regressing on the corrected scoring model and the governance guardrails. Put it at the repo root.

---

## Part A — Setup (run once)

### A1. Install Claude Code
Prefer the native installer (zero dependencies). See https://code.claude.com/docs/en/setup for your OS.
- If you use the **npm** package instead, it needs **Node.js 22+**; on Windows use WSL2.
- **Node 20/22 is also needed to run most MCP servers via `npx`** (below), even with the native binary.
Verify: `claude doctor`.

### A2. Create the repo and drop in the starter files
```bash
mkdir forrest-rsos && cd forrest-rsos
git init                                  # git first — Claude Code reads diffs/branches natively
# copy the generated starters into place:
#   CLAUDE.md                              -> repo root
#   packages/shared/src/constants.ts
#   packages/scoring/src/index.ts
#   packages/scoring/src/index.test.ts
#   supabase/migrations/0001_init.sql
#   docs/Forrest_RSOS_Implementation_Plan.md
#   docs/Forrest_RSOS_Project_Documentation.md
git add -A && git commit -m "chore: scaffold + canonical scoring, schema, and CLAUDE.md"
```

### A3. Connect MCP servers (so Claude Code can act on Supabase + GitHub)
Add them at project scope (`.mcp.json`) — commit the config **without secrets**; pass tokens via env. Exact server names/flags are in each provider's docs; the pattern is:
```bash
# GitHub (repo create/clone/PRs)
claude mcp add github -- npx -y @modelcontextprotocol/server-github
# Supabase (project + migrations + RLS + edge functions under Work4Vince Org)
claude mcp add supabase -- npx -y @supabase/mcp-server-supabase --read-only=false
```
Provide credentials via environment (never in the committed config): a GitHub token with org access, and a Supabase access token scoped to the **Work4Vince Org**. In your first session, confirm Claude Code can see the Work4Vince Org and your GitHub org **before** it creates anything. If it can't, stop and fix access.

> If you'd rather have Claude Code drive the Supabase/GitHub CLIs directly instead of via MCP, that also works — grant shell permission and have it run `supabase` and `gh`. Either way, verify access first.

### A4. First-session hygiene
- Start in **plan mode** and review the plan before any writes.
- Keep permission defaults (approve reads/writes/shell as they come).
- Use `/memory` to confirm `CLAUDE.md` is loaded; use `@docs/Forrest_RSOS_Project_Documentation.md` to pull the table dictionary into context when generating schema.

---

## Part B — Kickoff prompt (paste into Claude Code)

You are building **Forrest RSOS**. Read `CLAUDE.md`, `docs/Forrest_RSOS_Implementation_Plan.md`, and `docs/Forrest_RSOS_Project_Documentation.md` in full before writing code. The starter files in `packages/scoring`, `packages/shared`, and `supabase/migrations/0001_init.sql` are the **golden patterns** — match them; do not create a second scoring implementation or re-model `risk_scores`.

**Hard constraints (from `CLAUDE.md` — do not violate):**
- Scoring is the FMCSA scorecard and **HIGH = GOOD**: `0.15·fleet + 0.20·vehicle_oos + 0.25·driver_oos + 0.40·accident_rate`; bands Excellent ≥80 / Good 60–79 / Fair 40–59 / Poor <40. Insurance/claims/compliance are hard gates and flags, never weighted inputs. Never render a high score as dangerous.
- Hard gates force dispatch `red` regardless of score (authority revoked/inactive, rating conditional/unsatisfactory, insurance lapsed/below‑min, on DNU, confirmed fraud).
- Canonical carrier count **1,136**; own fleet ≈ **22** units (separate, visually distinct view). Insurance minimums $1M/$100K/$30K/WC.
- **Governance:** enforcement is confirm‑with‑reason (never one‑click); bulk is staged review; **no automated carrier outreach**; **dispatch blocking dormant** behind `FEATURE_DISPATCH_BLOCK_ENFORCING=false`; COI OCR confidence‑gated (never auto‑approves); AI assistant off; gray middle stays human‑in‑the‑loop.
- Adapter layer isolates FMCSA (MOTUS = one‑file change); never auto‑approve on degraded/stale data; `audit_logs` append‑only; snapshot on every load; no browser storage; plain‑language UI copy; single global nav with Settings reachable everywhere and fraud/capacity merged into Risk Review.
- **Do not invent thresholds** (Q1) or Blue Wire weights (Q2) — use the config placeholders in `packages/shared`.

**Work in TDD-first, verifiable phases. After each phase: run tests, commit, and summarize what changed. Use plan mode before large edits. Ask for confirmation only before destructive actions (dropping data, overwriting an existing repo/project). Use migrations for all DB changes; keep secrets in env.**

- **Phase 0 — Access & scaffolding.** Verify Work4Vince Supabase org + GitHub org access. Create/verify the private GitHub repo; set up `main`(protected)→`staging`→`dev`. Finish the workspace: `apps/web` (Next.js App Router + Tailwind), `packages/{fmcsa-adapter,shared,scoring}`, `workers/{datahub-daily,sms-monthly}`, `n8n/`, `tests/{unit,integration,rls,e2e}`, `.github/workflows/`, `.env.example` (all keys from the docs; feature flags defaulting to the governance values), `README.md`, `CODEOWNERS`, `SECURITY.md`. Wire the test scripts so `packages/scoring` tests run.

- **Phase 1 — Schema + RLS.** From the table dictionary, generate all remaining tables, enums, FKs, indexes, and the `fmcsa_snapshots` partitioning (24‑month retention, `payload_hash`), following `0001_init.sql`'s patterns. Extend the append‑only audit trigger to `insurance_policies`, `claims`, `incidents`, `load_risk_checks`. Add RLS policies for all ten roles per the RBAC matrix (dispatcher: status + pre‑screen only; external_carrier: own rows only; delete VP‑only + audited). Write `tests/rls` asserting the matrix. Run `supabase db reset`; then `supabase db push` to the linked project when green.

- **Phase 2 — Scoring wired in.** Use `packages/scoring` as‑is; add the service that computes sub‑scores from `safety_events`/insurance/claims/compliance, calls `computeScore`, writes `risk_scores` + audit, and exposes the contribution breakdown. Keep `packages/scoring/src/index.test.ts` green and extend it.

- **Phase 3 — FMCSA adapter + pre‑screen.** Build `packages/fmcsa-adapter` (raw → internal, the only mapping site). QCMobile client (Login.gov WebKey; on failure return last snapshot + `integrations.status='degraded'`, never auto‑approve). `datahub-daily` worker: download → filter to the TMS watchlist → normalize → snapshot(+hash) → diff authority/rating/insurance → events. `pre-screen` edge function returns R/Y/G with reasons and logs every check.

- **Phase 4 — Phase‑1 UI.** Global shell (single 14‑item nav; Settings reachable everywhere; fraud/capacity inside Risk Review), then Dashboard, Carrier Profile (tabbed), DOT# Pre‑Screen (mobile‑first big R/Y/G card), Insurance Tracker, Compliance Task Board, Risk Review Queue (+ remediation drawer), Admin Settings. Score direction corrected in every view. Enforcement buttons open a confirm‑with‑reason dialog (rationale → audit); bulk = staged; no automated‑outreach control; dispatch‑block toggle reads the feature flag (dormant by default). Plain‑language copy; standardized empty/error states; no browser storage.

- **Phase 5 — Insurance, documents, DNU, TMS.** COI tracking vs minimums; confidence‑gated OCR (`coi-parse`, never auto‑approves); reconcile COI vs FMCSA filing daily and flag conflicts; DNU list with dual‑control reinstatement; TMS connector interface‑first (watchlist import + queued write‑back; real‑time hook stubbed pending Q5).

- **Phase 6 — Seed, audit, E2E.** Seed **1,136** carriers (realistic thin‑file drayage), ~22 own‑fleet units, the four mockup example carriers — all with correct directionality (86 = excellent/eligible), plus one carrier per dispatch band and per hard‑gate condition. Verify audit is append‑only. `tests/e2e`: pre‑screen RED hard‑stop; conditional‑rating block; yellow remediation → GREEN with dossier; auto‑decertify → write‑back + DNU; load block on lapsed insurance; remittance dual‑approval.

- **Phase 7 — CI + security + report.** `.github/workflows/ci.yml` (lint, typecheck, unit/integration/rls/e2e, security scan) on PRs; `deploy.yml` (migrations → staging → prod on tagged release, manual prod gate). Verify RLS per role, MFA required, private buckets, no committed secrets, degraded/stale never auto‑approves. Open a PR into `main`; ensure CI is green. Write `docs/IMPLEMENTATION_REPORT.md` (Supabase/GitHub created‑or‑reused, tables/RLS status, confirmation the FMCSA scorecard + governance guardrails are implemented, seeded counts, test summary, rollback notes, and the open items Q1/Q2/Q5/Q7/Q15).

**Then stop and report.** List anything where you made an assumption, and confirm the guardrails (high = good, confirm‑with‑reason enforcement, no automated outreach, dispatch‑block dormant) hold.

---

## Optional accelerators
- **Custom slash commands** (`.claude/commands/`): e.g. `/new-table <name>` (generate a table + RLS + audit trigger from the dictionary), `/check-guardrails` (grep for score‑inversion, one‑click enforcement, automated‑outreach, browser storage).
- **Subagents** for parallel streams (schema vs UI vs adapters) once the schema is stable.
- **Headless/CI:** `claude -p "..." --output-format json` for automated checks in Actions.
- Keep `CLAUDE.md` updated after each architectural decision, and record ADRs in `docs/adr/`.
