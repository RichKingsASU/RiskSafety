# Forrest RSOS — Development Status Audit

_Read-only audit. No code was built, fixed, or modified. Generated 2026-07-11 by Claude Code._
_Branch: `claude/repo-status-audit-smayks` · HEAD `d0fb399` · 2 commits total (last: 2026-07-09)._

---

## A. Overall status & verdict

**Overall ≈ 14% complete — Phase 0 scaffold only.**

One-line verdict: **The repository is a faithful, high-quality Phase 0 skeleton** — the canonical scoring engine, shared constants, one golden migration, and governance defaults are all correct and the guardrails are intact — **but Phases 1–7 are essentially unbuilt**. There is no application (0 of 14 screens), only 4 of ~28 tables, no real RLS, no FMCSA adapter logic, no workers, and no integration/RLS/E2E tests. Two spec documents required to proceed (Implementation Plan, Project Documentation) are **missing placeholders**, which is the hard blocker on Phase 1.

**How the % is derived** (Complete=1.0 / Partial=0.5 / Missing=0.0, item-weighted):

| Dimension | Complete | Partial | Missing | Items | Score |
|---|---|---|---|---|---|
| Modules / screens (14) | 0 | 0 | 14 | 14 | 0.00 |
| Data model tables (~28) | 4 | 0 | 24 | 28 | 0.14 |
| Business rules (~20, scoring/governance encoded) | 5 | 2 | 13 | 20 | 0.30 |
| RBAC roles (10) | 0 | 1 | 9 | 10 | 0.05 |
| Phases (0–7) | — | — | — | 8 | 0.20 |

Blended across dimensions ≈ **0.14 (14%)**. The number is dominated by the fact that the entire product surface (UI, schema, adapters, workers, tests) is absent; what exists is the correctness-critical *core* (scoring + constants), which is why quality is high even though completeness is low.

---

## B. Per-phase status (Phase 0–7)

Phases are defined by `docs/Forrest_RSOS_Claude_Code_Build_Prompt.md` Part B.

| Phase | Scope | Status | % | What remains |
|---|---|---|---|---|
| **0 — Access & scaffolding** | monorepo, packages, workers/n8n dirs, tests dirs, CI, `.env.example`, README/CODEOWNERS/SECURITY, test scripts | **Mostly complete** | **~85%** | GitHub branch protection (`main`→`staging`→`dev`) not established; Supabase org access blocked by sandbox network policy (per `docs/STATUS.md`). `apps/web` is a README only (no Next.js app scaffolded yet). |
| **1 — Schema + RLS** | ~28 tables, enums, FKs, indexes, `fmcsa_snapshots` partitioning, per-role RLS, audit-trigger extension, `tests/rls` | **Barely started** | **~12%** | 24 tables missing; no `fmcsa_snapshots` partitioning/retention/hash; RLS policies are 2 permissive placeholders (no 10-role matrix); audit trigger covers only 2 tables; 0 RLS tests. **Blocked** on missing table dictionary + RBAC matrix. |
| **2 — Scoring wired in** | scoring engine + service that computes sub-scores → writes `risk_scores` + audit + breakdown | **Engine done, wiring missing** | **~30%** | Engine (`packages/scoring`) is complete with 9 passing golden tests. The service layer (read `safety_events`/insurance/claims/compliance → `computeScore` → persist + audit) does not exist. |
| **3 — FMCSA adapter + pre-screen** | adapter mapping, QCMobile client, `datahub-daily` worker, `pre-screen` edge fn | **Stub only** | **~5%** | `normalizeCarrier` is a deliberate `throw` stub; no QCMobile/Login.gov client; no degraded-mode handling; workers are READMEs; no pre-screen edge function. |
| **4 — Phase-1 UI** | global shell + 8 named screens (of 14 nav items) | **Not started** | **~1%** | `apps/web` contains only a README describing intent. 0 screens, 0 components, no Next.js app, no nav shell. |
| **5 — Insurance / docs / DNU / TMS** | COI tracking, confidence-gated OCR, COI↔FMCSA reconcile, DNU dual-control, TMS connector | **Not started** | **0%** | Nothing present beyond `.env` placeholders and `FEATURE_COI_OCR=true` default. |
| **6 — Seed, audit, E2E** | seed 1,136 carriers + 22 units + example carriers, E2E scenarios | **Not started** | **~3%** | No seed data; no `tests/e2e`. Append-only audit trigger exists in the migration but only for `carriers`/`risk_scores`. |
| **7 — CI + security + report** | full CI matrix, `deploy.yml`, security verification, `IMPLEMENTATION_REPORT.md` | **Minimal CI only** | **~20%** | `ci.yml` runs typecheck + unit only; no integration/rls/e2e/security-scan steps, no `deploy.yml`, no `docs/IMPLEMENTATION_REPORT.md`. |

---

## C. Modules, data model, business rules, RBAC

### C1. Modules — the 14 nav screens (all **Missing**)
CLAUDE.md mandates one shell with 14 items. **None exist** — `apps/web/` is a single README.

| # | Screen | Status | Evidence |
|---|---|---|---|
| 1 | Dashboard | Missing | no route/component |
| 2 | Carriers | Missing | " |
| 3 | Pre-Screen | Missing | " |
| 4 | Drivers | Missing | " |
| 5 | Equipment | Missing | " |
| 6 | Insurance | Missing | " |
| 7 | FMCSA Monitoring | Missing | " |
| 8 | Claims | Missing | " |
| 9 | Compliance Tasks | Missing | " |
| 10 | Risk Review (incl. fraud + capacity) | Missing | " |
| 11 | Documents | Missing | " |
| 12 | Own-Fleet Safety | Missing | " |
| 13 | Reports | Missing | " |
| 14 | Admin / Settings | Missing | " |

Only `apps/web/README.md:1` documents the intended shell.

### C2. Data model — ~28 tables

**Present & correct (4)** — `supabase/migrations/0001_init.sql`:
- `carriers` (L23), `safety_events` (L45), `risk_scores` (L62, canonical FMCSA scorecard, HIGH=GOOD), `audit_logs` (L82, append-only).
- 9 enums (L12–20), correct indexes, append-only revoke (L96), audit trigger + 2 table triggers (L99–124).
- Validated locally against Postgres 16 per `docs/STATUS.md`; **not** pushed to a live project (sandbox network policy blocks Supabase).

**Missing (~24)** — enumerated as TODO in `0001_init.sql:2-9`: drivers, trucks, trailers, chassis, insurance_policies, certificates, documents, claims, incidents, compliance_tasks, `fmcsa_snapshots` (+partitioning/retention/hash), loads, load_risk_checks, customers, related_entities, dnu_list, remediation_dossiers, fleet_assets, fleet_safety_events, users, roles, integrations, notifications. **Blocked** on the missing table dictionary.

### C3. Business rules (scoring & governance encoded; most product rules Missing)

| Rule | Status | Evidence |
|---|---|---|
| FMCSA scorecard weights 0.15/0.20/0.25/0.40 | **Complete** | `packages/shared/src/constants.ts:18-23`; `packages/scoring/src/index.ts:80-90` |
| HIGH = GOOD; quality bands 80/60/40 | **Complete** | `constants.ts:26-31`; `scoring/index.ts:67-72`; test `index.test.ts:44-53` |
| Hard gates force dispatch RED | **Complete** | `scoring/index.ts:101-111,127-129`; test `index.test.ts:75-87` |
| Dispatch band ≠ quality band | **Complete** | `scoring/index.ts:118-147` |
| Thin-file not auto-failed; near-neutral | **Complete** | `scoring/index.ts:91,144`; test `index.test.ts:89-106` |
| Open material flag routes to review | **Complete** | `scoring/index.ts:140`; test `index.test.ts:108-113` |
| Insurance minimums $1M/$100K/$30K/WC | **Complete** | `constants.ts:6-11` |
| Insurance/claims/compliance are gates, not weighted | **Partial** | asserted in comments/constants; no runtime gate-evaluation service yet |
| Snapshot-on-every-load | **Partial** | schema comment only; no `loads`/`load_risk_checks` tables or booking logic |
| COI↔FMCSA daily reconcile & conflict flag | Missing | Phase 5 |
| DNU dual-control reinstatement | Missing | no `dnu_list` |
| Divergence vs CarrierAssure (benchmark only) | Missing | `divergence_flag` column exists, no logic |
| Degraded/stale → never auto-approve | Missing (planned) | documented in `fmcsa-adapter/src/index.ts:11-13`, not implemented |
| Remaining ~7 PRD business rules | Missing | PRD not present in repo |

_Note: the Product Requirements Document (14 modules / 20 business rules) referenced in the task is **not in the repo**; rule coverage above is graded against CLAUDE.md + the build prompt._

### C4. RBAC roles (10) — effectively **Missing**
RLS is *enabled* on all 4 present tables (`0001_init.sql:130-133`), but only two **permissive placeholder** SELECT policies exist (`carriers_read_authenticated` L138, `audit_read_authenticated` L143). None of the ten roles (VP, admin, risk reviewer, compliance, dispatcher status-only, external_carrier own-rows-only, etc.) are modeled. **Blocked** on the missing RBAC matrix. `tests/rls` contains no tests.

---

## D. Invariant & governance compliance check (Step 4)

| # | Invariant | Result | Evidence |
|---|---|---|---|
| 1 | Scoring is HIGH = GOOD | **PASS** | `scoring/index.ts:67-72`; test asserts high→excellent→green (`index.test.ts:26-42`) |
| 2 | Exactly one scoring implementation (no rogue duplicate) | **PASS** | grep for `computeScore`/weighted composite outside `packages/scoring` → 0 hits |
| 3 | Scoring guardrail tests exist and pass | **PASS** | `index.test.ts` — 9/9 passing |
| 4 | Canonical carrier count 1,136 everywhere | **PASS** | only value present is `1136`/`1,136` (`constants.ts:46`, docs); grep found no rogue count |
| 5 | No automated-carrier-outreach code | **PASS** | grep `outreach|sendEmail` → 0 product code; only `.env`/doc references |
| 6 | Enforcement is confirm-with-reason, not one-click | **PASS (by absence)** | no enforcement UI/service exists yet; `audit_logs.rationale` required-field designed in (`0001_init.sql:90`). To re-verify when Phase 4 lands. |
| 7 | `FEATURE_DISPATCH_BLOCK_ENFORCING` defaults false | **PASS** | `.env.example:35`; `constants.ts:51` |
| 8 | COI OCR never auto-approves | **PASS** | `constants.ts:53` (`FEATURE_COI_OCR: true // parse-and-prefill only; NEVER auto-approves`); no OCR code to contradict it |
| 9 | AI assistant off | **PASS** | `constants.ts:52` / `.env.example:37` (`FEATURE_AI_ASSISTANT=false`) |
| 10 | Single global nav, Settings everywhere, fraud/capacity merged into Risk Review | **N/A — not yet built** | intent documented (`apps/web/README.md`); no UI to verify |
| 11 | `audit_logs` append-only | **PASS** | `update,delete` revoked (`0001_init.sql:96`); no U/D policies |
| 12 | RLS enabled on every table | **PASS (for the 4 present)** | `0001_init.sql:130-133` — but policies are placeholders; must hold as new tables are added |
| 13 | No browser storage in client code | **PASS (vacuously)** | grep `localStorage`/`sessionStorage` → 0 hits; no client code yet |
| 14 | FMCSA reads go through the adapter layer | **PASS (structurally)** | single mapping site defined (`fmcsa-adapter/src/index.ts`); currently a stub |
| 15 | Never auto-approve on degraded/stale data | **N/A — not implemented** | documented intent (`fmcsa-adapter/src/index.ts:11-13`); no logic yet |
| 16 | No invented R/Y/G thresholds or Blue Wire weights | **PASS** | thresholds live as clearly-labeled DEFAULTS pending Q1 (`constants.ts:33-43`); weights are the fixed FMCSA scorecard, Blue Wire final weights noted as config pending Q2 |

**No regressions found.** Every guardrail that *can* be checked at this stage passes; the four N/A items simply have no implementation to violate them yet.

---

## E. Test & lint results

Run 2026-07-11 in-sandbox:

| Command | Result |
|---|---|
| `npm run test` (vitest) | **PASS** — 1 file, **9/9 tests** (`packages/scoring/src/index.test.ts`) |
| `npm run typecheck` (`tsc -b`) | **PASS** — clean |
| `npm run test:unit` | PASS — same 9 scoring tests |
| `npm run test:integration` | **No test files** (exit 1) — directory has README only |
| `npm run test:rls` | **No test files** (exit 1) |
| `npm run test:e2e` | **No test files** (exit 1) |
| `npm run lint` | **No-op** — no workspace defines a `lint` script (runs `--if-present` and does nothing; no ESLint configured) |

CI (`.github/workflows/ci.yml`) runs only typecheck + `npm run test`; integration/rls/e2e/security-scan steps are marked as future work (L22).

---

## F. Risks & regressions

- **No regressions detected** — the correctness-critical invariants all hold.
- **Blocker (hard):** `docs/Forrest_RSOS_Implementation_Plan.md` and `docs/Forrest_RSOS_Project_Documentation.md` are **placeholder stubs** (the files literally say "PLACEHOLDER — the real document was not provided"). Phase 1 (schema + RLS) cannot proceed faithfully without the table dictionary and RBAC matrix, and CLAUDE.md forbids inventing them.
- **Blocker (environmental):** Supabase is unreachable from the sandbox (403 on `*.supabase.co`, per `docs/STATUS.md`), so the golden migration was validated locally but never pushed; nothing runs against a live DB.
- **Missing lint tooling:** `npm run lint` is a silent no-op — no ESLint config anywhere. CI's "lint" coverage is effectively absent (only typecheck guards style/correctness).
- **CI gaps:** no integration/rls/e2e/security-scan jobs, no `deploy.yml`, no branch-protection evidence.
- **Test scripts point at empty dirs:** `test:integration|rls|e2e` all exit non-zero ("no test files"). If wired into CI as-is they would fail the pipeline; today CI avoids them by running only `npm run test`.
- **PRD absent:** the "14 modules / 20 business rules" PRD named in the task is not in the repo, so business-rule coverage is graded against CLAUDE.md + build prompt, not the PRD.
- **Repo/target ambiguity (open):** work is in `RichKingsASU/RiskSafety` on a personal account; the build prompt referenced an org repo named `forrest-rsos` (`docs/STATUS.md:42-47`).

---

## G. Prioritized "next up"

1. **Unblock the spec.** Obtain the real `Forrest_RSOS_Implementation_Plan.md` and `Forrest_RSOS_Project_Documentation.md` (table dictionary + RBAC matrix). Everything in Phase 1+ depends on these.
2. **Restore Supabase reachability** (network-policy allowlist for `*.supabase.co`/`.com`, or run the `docs/SUPABASE_SETUP.md` runbook from a networked machine/CI) and rotate the shared DB password.
3. **Phase 1 — schema + RLS:** generate the remaining ~24 tables from the dictionary (esp. `fmcsa_snapshots` with partitioning/retention/`payload_hash`), extend the append-only trigger to `insurance_policies`/`claims`/`incidents`/`load_risk_checks`, write the 10-role RLS policies, and add `tests/rls` asserting the matrix.
4. **Phase 2 — scoring service:** wire the engine to persist `risk_scores` + audit from `safety_events`/insurance/claims/compliance; extend integration tests.
5. **Phase 3 — FMCSA adapter:** implement `normalizeCarrier`, the QCMobile/Login.gov client with degraded-mode (never auto-approve), and the `datahub-daily` worker.
6. **Phase 4 — UI shell + Phase-1 screens** (nav + Dashboard, Carrier Profile, DOT# Pre-Screen, Insurance, Compliance, Risk Review, Admin), with score direction correct and confirm-with-reason enforcement.
7. **Harden CI:** add ESLint, wire integration/rls/e2e + security scan into `ci.yml`, add `deploy.yml`, and seed real `tests/integration|rls|e2e` before those scripts are made blocking.
8. **Phases 5–7** (insurance/DNU/TMS, seed 1,136 + E2E, `IMPLEMENTATION_REPORT.md`) in order.

---

## Assumptions & open decisions blocking go-live

**Assumptions made in this audit:**
- Graded phases against `docs/Forrest_RSOS_Claude_Code_Build_Prompt.md` (Part B) because the Implementation Plan (§5/§19/§20/§21) and Project Documentation (§4/§5) are placeholders, and no PRD is in the repo.
- "~28 tables" taken from the TODO list embedded in `0001_init.sql`; "10 roles" from CLAUDE.md/build-prompt references.
- The 4 present tables are counted as Complete DDL objects even though their RLS policies are placeholders (RLS graded separately under RBAC).
- Percentages use Complete=1.0 / Partial=0.5 / Missing=0.0, item-weighted then blended across dimensions — a defensible estimate, not an exact measure.

**Open decisions still blocking go-live (from CLAUDE.md):**
- **Q1** — R/Y/G thresholds + quality-band→dispatch-eligibility mapping (currently labeled DEFAULTS in `constants.ts:33-43`).
- **Q2** — Blue Wire final weights + the two outstanding source docs.
- **Q5** — TMS name/API/auth (connector is interface-first, Phase 1 = watchlist import + queued write-back).
- **Q7** — Final platform mandate (Supabase-first vs Azure/Entra).
- **Q15** — Dispatch-block activation (must be ratified before flipping `FEATURE_DISPATCH_BLOCK_ENFORCING`).
