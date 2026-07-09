# CLAUDE.md — Forrest RSOS

Persistent project memory. Claude Code reads this at the start of every session. Keep it accurate; update it after any architectural decision.

## What this is (WHY)
RSOS (Risk & Safety Operating System) for Forrest Logistics / Forrest Transportation. It consolidates a fragmented carrier‑vetting stack into one auditable system of record and — the whole point — **manufactures a contemporaneous, per‑carrier / per‑load due‑diligence record** (the defense under *Montgomery v. Caribe Transport II*, SCOTUS 9‑0, May 14 2026). Users are **operational domain experts, not engineers.**

## Tech stack (WHAT)
- **Frontend:** Next.js (App Router) + Tailwind, in `apps/web`.
- **Backend/DB:** Supabase (Postgres, Auth, Storage, Edge Functions) under the **Work4Vince Org**. RLS enforces RBAC at the database.
- **Packages:** `packages/fmcsa-adapter` (MOTUS isolation), `packages/scoring` (canonical scorecard), `packages/shared` (constants/enums/types).
- **Workers:** `workers/datahub-daily`, `workers/sms-monthly`. **Orchestration:** n8n.
- **Connectors (org is M365‑standardized):** Entra SSO, Teams alerts, SharePoint doc mirror, Tableau export.

## Commands (HOW)
- `npm run dev` — Next.js dev server
- `npm run build` / `npm run lint` / `npm run typecheck`
- `npm run test:unit` · `npm run test:integration` · `npm run test:rls` · `npm run test:e2e`
- `supabase db reset` — apply migrations + seed locally · `supabase db push` — push to linked project

---

## NON‑NEGOTIABLE RULES — never regress on these

### 1. Scoring model is the FMCSA scorecard, and HIGH = GOOD
`overall_score = 0.15·fleet_size + 0.20·vehicle_oos + 0.25·driver_oos + 0.40·accident_rate` (each input 0–100, higher = safer).
Quality bands: **Excellent ≥80 · Good 60–79 · Fair 40–59 · Poor <40.**
- Insurance, claims, and compliance are **hard gates and flags**, NOT weighted score inputs.
- A high score is an **excellent** carrier. Never render a high score as dangerous. (This has been broken before — do not reintroduce it.)
- The reference implementation is `packages/scoring`. Any scoring logic must match it; do not hand‑roll a second version.
- Blue Wire is the *internal engine that computes this composite*; its final weights are config, pending the two outstanding Blue Wire source docs (see Open Questions).

### 2. Dispatch eligibility ≠ quality band
`dispatch_band (green|yellow|orange|red)` is derived from quality band **+ hard gates + open flags**. **Hard gates force RED regardless of score:** authority revoked/inactive · safety rating conditional/unsatisfactory · insurance lapsed or below minimum · on DNU · confirmed double‑brokering/identity fraud.

### 3. Canonical numbers
- Carrier population = **1,136** wherever a carrier count appears (seed + displays).
- Own fleet ≈ **22** power units (Forrest Transportation) — a **separate, visually distinct** view fed by Samsara.
- Insurance minimums: **auto $1,000,000 · cargo $100,000 · trailer interchange $30,000 · workers comp** per requirement.

### 4. Governance — team votes are the source of truth
Features the team marked *Discuss/Skip* are **never active defaults**:
- Enforcement (restrict/suspend/decertify/add‑to‑DNU) is **confirm‑with‑reason**, never one‑click; each writes rationale + an immutable audit row.
- Bulk actions are **staged review**, never one‑click.
- **No automated carrier outreach** exists in the product.
- **Dispatch blocking ships dormant/advisory** behind `FEATURE_DISPATCH_BLOCK_ENFORCING=false`; RED is a strong recommendation until the team ratifies enforcing mode.
- COI OCR is **confidence‑gated and never auto‑approves** (`FEATURE_COI_OCR=true` = parse‑and‑prefill only).
- No always‑on AI assistant (`FEATURE_AI_ASSISTANT=false`).
- The gray middle stays **human‑in‑the‑loop**; RSOS automates detection/scoring/audit, reviewers make and record the judgment.

### 5. Status color language (everywhere)
Green = Approved · Yellow = Needs Review · Orange = Restricted · Red = Blocked/DNU. Primary brand accent = **deep navy/indigo**. Do **not** use green as the brand color.

---

## Architecture conventions
- **FMCSA adapter layer** is the *only* place raw FMCSA fields map to the internal schema. A MOTUS schema change must be a one‑file edit. Never hard‑wire legacy SAFER screens.
- **Never auto‑approve on degraded/stale data.** On FMCSA failure, reuse the last snapshot and set `integrations.status='degraded'`.
- `audit_logs` is **append‑only** (UPDATE/DELETE revoked for app roles); DB triggers write on state changes. Records are archived/superseded, not deleted (VP‑only delete, always audited).
- **Snapshot on every load:** booking writes a point‑in‑time carrier snapshot tied to the load.
- `fmcsa_snapshots` indexed/partitioned by `(carrier_id, snapshot_date)`, 24‑month retention, `payload_hash` for integrity.
- Insurance is a **filing** in FMCSA (with lag), a **certificate** only in RMIS/COI — reconcile daily and flag conflicts.
- Carrier411 absence = **"no report," not "clean."** CarrierAssure is a **benchmark only**, never a sole gate.
- Thin‑file guard: below the inspection‑count threshold, **do not auto‑fail** on percentage metrics; route to qualitative review; the confidence modifier keeps thin files near neutral.
- **No browser storage** in client components (React state only).
- **UI copy is plain‑language**, grounded in carrier/claims/dispatch workflow. No system/jargon copy in user‑facing surfaces.

## Navigation — one shell, not fifteen
Single collapsible left nav on **every** screen (14 items): Dashboard · Carriers · Pre‑Screen · Drivers · Equipment · Insurance · FMCSA Monitoring · Claims · Compliance Tasks · Risk Review · Documents · Own‑Fleet Safety · Reports · Admin. **Admin/Settings reachable from every screen.** Fraud‑detection and capacity‑anomaly functions live **inside Risk Review** (the old separate Fraud Detection and Capacity Analytics screens are merged). Reconcile the exact set against the *Part A v2 global design header* if it differs.

## Open Questions — use config placeholders; do NOT invent values
- **Q1** R/Y/G thresholds + how quality bands map to dispatch eligibility → in `packages/shared` config; assert in tests. (Matt)
- **Q2** Blue Wire weights + two source docs. (Matt)
- **Q5** TMS name/API/auth → connector is interface‑first; Phase 1 = watchlist import + queued write‑back. (Richard)
- **Q7** Final platform mandate (Supabase‑first vs Azure/Entra). Build Supabase‑first; keep it portable.
- **Q15** Dispatch‑block activation — ratified by the team before flipping the flag.

## Where things live
- Full spec: `docs/Forrest_RSOS_Implementation_Plan.md`, `docs/Forrest_RSOS_Project_Documentation.md` (table dictionary + RBAC matrix + SOPs).
- Golden patterns already in the repo: `packages/scoring`, `packages/shared`, `supabase/migrations/0001_init.sql`. Generate remaining tables from the table dictionary using these as the pattern.
- Decisions: `docs/adr/`.

## Definition of done (every change)
Correct score direction preserved · governance guardrails intact (confirm‑with‑reason, no automated outreach, dispatch‑block dormant) · RLS correct for touched tables · audit row written on state change · tests green (incl. RLS + the scoring boundary tests) · plain‑language UI copy · no invented thresholds.
