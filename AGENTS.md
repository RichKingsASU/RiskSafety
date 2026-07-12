# AGENTS.md — Forrest RSOS (shared agent contract)

**This file is the model-agnostic rules contract for _every_ coding agent that touches this repo** — Codex, Google Antigravity, Claude Code, and any other. Codex reads `AGENTS.md` natively; for Antigravity (and any IDE agent), load this file as workspace rules/context so it is in scope on every session.

## Precedence — read this first
1. **`CLAUDE.md` is the canonical project memory.** This file mirrors it for agents that don't read `CLAUDE.md`. If the two ever disagree, **`CLAUDE.md` wins** and this file is stale — fix it.
2. **The CI-enforced tests are the real constitution.** A markdown rule is advisory; a failing test blocks the merge and binds every agent regardless of which doc it read. When in doubt, run the tests. The binding invariants are:
   - `tests/unit/directionality.golden.test.ts` — score direction (HIGH = GOOD) cannot invert.
   - `tests/unit/seed-scoring.test.ts` — seed literals must equal `packages/scoring` output (anti-drift).
   - `tests/unit/enums.parity.test.ts` — Postgres enums ↔ TypeScript enums cannot drift.
   - `tests/rls/assert.sql` — RLS behaves per the RBAC matrix.
3. Run `/check-guardrails` (see `.claude/commands/check-guardrails.md`) — or grep for the regressions it lists — before opening any PR.

## What this is (WHY)
RSOS consolidates a fragmented carrier-vetting stack into one auditable system of record whose whole purpose is to **manufacture a contemporaneous, per-carrier / per-load due-diligence record** — the defense under *Montgomery v. Caribe Transport II* (SCOTUS 9-0, May 14 2026). **Users are operational domain experts, not engineers.**

## Tech stack (WHAT)
- Frontend: Next.js (App Router) + Tailwind in `apps/web`.
- Backend/DB: Supabase (Postgres, Auth, Storage, Edge Functions), Work4Vince Org. **RLS enforces RBAC at the database.**
- Packages: `packages/fmcsa-adapter` (MOTUS isolation), `packages/scoring` (canonical scorecard), `packages/shared` (constants/enums/types).
- Workers: `workers/datahub-daily`, `workers/sms-monthly`. Orchestration: n8n.
- Connectors (org is M365-standardized): Entra SSO, Teams, SharePoint, Tableau.

---

## NON-NEGOTIABLE RULES — never regress on these

### 1. Scoring model is the FMCSA scorecard, and HIGH = GOOD
`overall_score = 0.15·fleet_size + 0.20·vehicle_oos + 0.25·driver_oos + 0.40·accident_rate` (each input 0–100, higher = safer). Bands: **Excellent ≥80 · Good 60–79 · Fair 40–59 · Poor <40.**
- Insurance, claims, and compliance are **hard gates/flags, NOT weighted inputs.**
- A high score is an **excellent** carrier. Never render a high score as dangerous. (Broken before — do not reintroduce.)
- `packages/scoring` is the **one** implementation. Do not hand-roll a second scoring path anywhere (seed SQL, UI, workers).

### 2. Dispatch eligibility ≠ quality band
`dispatch_band (green|yellow|orange|red)` = quality band **+ hard gates + open flags**. **Hard gates force RED regardless of score:** authority revoked/inactive · safety rating conditional/unsatisfactory · insurance lapsed or below minimum · on DNU · confirmed double-brokering/identity fraud.

### 3. Canonical numbers (single source of truth)
- Carrier population = **1,136** wherever a count appears. (Do not emit 1,420 / 1,204 / 1,219 — those are stale defects.)
- Own fleet ≈ **22** power units (Forrest Transportation) — a **separate, visually distinct** Samsara-fed view, never merged into carrier risk.
- Insurance minimums: **auto $1,000,000 · cargo $100,000 · trailer interchange $30,000 · workers comp.**
- Pull these from `packages/shared` constants / generated types — never hardcode.

### 4. Governance — team votes are the source of truth
- Enforcement (restrict/suspend/decertify/add-to-DNU) is **confirm-with-reason, never one-click**; each writes rationale + an immutable audit row.
- Bulk actions are **staged review**, never one-click.
- **No automated carrier outreach** exists in the product.
- **Dispatch blocking ships dormant/advisory** behind `FEATURE_DISPATCH_BLOCK_ENFORCING=false`; RED is a strong recommendation until the team ratifies enforcing mode (Q15).
- COI OCR is **confidence-gated and never auto-approves** (`FEATURE_COI_OCR=true` = parse-and-prefill only).
- No always-on AI assistant (`FEATURE_AI_ASSISTANT=false`). **Any LLM (Gemini/OpenAI/Claude) may extract or draft only — never score or decide.**
- The gray middle stays **human-in-the-loop.**

### 5. Status color language
Green = Approved · Yellow = Needs Review · Orange = Restricted · Red = Blocked/DNU. Brand accent = **deep navy/indigo**. Green is a *status* color only — **never the brand color.**

---

## Architecture conventions (do not violate)
- **FMCSA adapter layer** is the *only* place raw FMCSA fields map to the internal schema. A MOTUS change is a one-file edit. Never hard-wire legacy SAFER screens elsewhere.
- **Never auto-approve on degraded/stale data.** On FMCSA failure, reuse the last snapshot and set `integrations.status='degraded'`.
- `audit_logs` is **append-only** (UPDATE/DELETE revoked for app roles); triggers write on state changes. Records are superseded, not deleted (VP-only delete, always audited).
- **Snapshot on every load:** booking writes a point-in-time carrier snapshot tied to the load.
- `fmcsa_snapshots` indexed by `(carrier_id, snapshot_date)`, 24-month retention, `payload_hash` for integrity.
- Insurance is a **filing** in FMCSA (lagged) vs a **certificate** in RMIS/COI — reconcile daily, flag conflicts.
- Carrier411 absence = **"no report," not "clean."** CarrierAssure is a **benchmark only**, never a sole gate.
- Thin-file guard: below the inspection-count threshold, **do not auto-fail** on percentages; route to qualitative review.
- **No browser storage** in client components (React state only).
- **Plain-language UI copy** — no system/jargon in user-facing surfaces.

## Navigation — one shell, not fifteen
Single collapsible left nav on **every** screen (14 items): Dashboard · Carriers · Pre-Screen · Drivers · Equipment · Insurance · FMCSA Monitoring · Claims · Compliance Tasks · Risk Review · Documents · Own-Fleet Safety · Reports · Admin. **Admin/Settings reachable from every screen.** Fraud-detection and capacity-anomaly functions live **inside Risk Review** (the separate Fraud Detection / Capacity Analytics screens are merged). Reconcile against the *Part A v2 global design header* if it differs.

## Open Questions — use config placeholders; do NOT invent values
- **Q1** R/Y/G thresholds + band→eligibility mapping → `packages/shared` config, asserted in tests. (Matt)
- **Q2** Blue Wire weights + two source docs. (Matt) — `BLUE_WIRE_ENABLED=false` until ratified.
- **Q5** TMS name/API/auth → interface-first; Phase 1 = watchlist import + queued write-back. (Richard)
- **Q7** Platform mandate (Supabase-first vs Azure/Entra). Build Supabase-first; **keep it portable.**
- **Q15** Dispatch-block activation — team-ratified before the flag flips.

---

## Multi-agent working agreement (Codex · Antigravity · Claude Code)
Because more than one agent now writes to this repo, coordination is the risk, not the tools.
- **One agent per branch/task.** Never point two agents at the same files simultaneously.
- **Branch → PR → green CI → human merge.** Every change crosses the same gate no matter which model wrote it.
- **No agent merges its own work.** Merge authority is the human maintainer (see `CODEOWNERS`), on green CI, SHA confirmed, working tree clean.
- **Protected surfaces** (require review per `CODEOWNERS`): `packages/scoring/`, `packages/shared/src/constants.ts`, `supabase/`, `packages/fmcsa-adapter/`, `CLAUDE.md`. Changes here get extra scrutiny for score inversion, RLS, and audit integrity.
- **Cross-model review is encouraged.** Have a different agent review scoring/RLS PRs — different models catch different failure modes.
- **Secrets:** never commit keys/tokens; server-side only for `service_role` and any LLM API key; anon key only is client-safe.

## Definition of done (every change)
Score direction preserved · governance guardrails intact (confirm-with-reason, no automated outreach, dispatch-block dormant) · RLS correct for touched tables · audit row on state change · **tests green (incl. RLS + scoring boundary tests)** · plain-language UI copy · no invented thresholds · branch pushed, not self-merged.
