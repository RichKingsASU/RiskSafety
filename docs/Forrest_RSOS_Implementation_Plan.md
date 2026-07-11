# Forrest RSOS — Implementation Plan

**Product:** Risk & Safety Operating System (RSOS) — Forrest Logistics / Forrest Transportation
**Prepared for:** Risk & Safety leadership; the build team
**Build target:** Supabase (managed Postgres) + Next.js, provisioned under the **Work4Vince Org**, with a connected GitHub repository, built via the Google Antigravity IDE prompt (Deliverable 3).
**Status:** Ready to build. Two scoring/threshold decisions remain open (Section 18); the build proceeds around them with config placeholders.
**Companion documents:** RSOS Product Requirements Document v1.0; Strategy & Modernization Review v3; FMCSA in‑house monitoring audit; Stitch prompt pack; and *Part A v2 global design header* (the living design‑system reference).

> **Source note.** This plan synthesizes the four in‑session source documents plus the established project canon. The *Risk & Safety Operational Blueprint v1.0* was referenced as a source but was **not available in this working session** (the upload did not mount); the PRD — which the PRD itself describes as the downstream synthesis of that Blueprint — was used as the authoritative discovery record in its place. See Assumptions (Section 7) and Open Questions (Section 18).

---

## 1. Executive Summary

RSOS consolidates Forrest's fragmented carrier‑vetting stack (SAFER, dotmc, RMIS, Carrier411, CarrierAssure, Highway, Samsara, and the in‑development Blue Wire score) into **one auditable system of record**. Reps toggle between platforms today, and decisions live in screenshots, spreadsheets, and email. RSOS replaces that with a single workspace that pulls FMCSA data directly, tracks insurance and documents, scores carrier risk on the team's own model, manages claims and incidents, runs compliance tasks, and — the point of the whole system — **produces a contemporaneous, per‑carrier / per‑load due‑diligence record**.

Two events on **May 14, 2026** set the stakes: *Montgomery v. Caribe Transport II, LLC* (Supreme Court, 9‑0) ended federal preemption for negligent‑selection claims against brokers, so the durable legal defense is now a documented record of ordinary care on every carrier and every load; and the **FMCSA registration transition to MOTUS** is changing the open‑data schemas Forrest reads, which is why the design isolates all FMCSA reads behind an adapter layer.

This build delivers the **Phase 1 MVP** — the front‑line DOT# pre‑screen, carrier profile as system of record, insurance/COI tracking against minimums, the remediation dossier, snapshot‑on‑every‑load, the audit trail, RBAC, and the DNU list — as the immediate Montgomery defense, then sequences Phases 2–3 (claims/incidents, full FMCSA monitoring, load‑level enforcement, Blue Wire integration, then predictive analytics and the external carrier portal).

**Two things govern every decision in this plan:**

1. **The scoring model is the team's FMCSA scorecard, and high means good.** Overall Score = Fleet Size (15%) + Vehicle OOS (20%) + Driver OOS (25%) + Accident Rate (40%), banded **Excellent 80+ / Good 60–79 / Fair 40–59 / Poor <40**. Earlier built screens used placeholder insurance‑based logic and rendered high scores as dangerous; that inversion is corrected here at the schema, rules, UI, and seed‑data level. Insurance, claims, and compliance are **hard gates and flags**, not weighted inputs to the quality score.
2. **Team votes are the governance source of truth.** Features the team marked *Discuss* or *Skip* are not shipped as active defaults. Enforcement actions are confirm‑with‑reason, bulk actions are staged review, and the gray middle stays human‑in‑the‑loop.

---

## 2. Product Purpose

- Give the Risk & Safety department **one pane of glass** for carrier risk, replacing tool‑toggling and scattered evidence.
- **Manufacture the Montgomery record automatically** — every screen, decision, and enforcement action writes an immutable audit entry, and every load assignment snapshots the carrier as known at that moment.
- **Bring the commoditized FMCSA‑data layer in‑house** (retire dotmc; shrink the FMCSA half of Carrier411/CarrierAssure) while preserving the genuine moats: RMIS (real COIs + onboarding), Highway (identity/fraud), Carrier411 (peer reports).
- **Score carrier quality on the team's own model** and drive dispatch eligibility from it, consistently, everywhere.
- Extend a **hybrid** view: third‑party carrier risk (Forrest Logistics) alongside a visually distinct own‑fleet safety view for Forrest Transportation's ~22 power units (Samsara feed).

---

## 3. Target Users

Roles are grounded in discovery. Claims Coordinator, Accounting/Admin, and the External Carrier user are proposed standard drayage‑brokerage roles pending org confirmation.

| Priority | Persona | Primary job in RSOS |
| :-- | :-- | :-- |
| 1 | **R&S VP / Director** | Owns the program as the Montgomery defense; approves overrides and DNU; reviews exceptions; reports KPIs; owns vendor‑stack and policy/threshold config. |
| 1 | **Safety / Compliance Manager** | Maintains SOP thresholds and rules; owns FMCSA monitoring exceptions; runs audits, incident reviews, tabletop exercises. |
| 1 | **Triage Reviewer (Danica)** | Handles GREEN onboarding and YELLOW documented review/remediation; owns the remediation dossier. |
| 1 | **Deep‑Dive Analyst (Elizabeth)** | Investigates fraud/double‑brokering/chameleon/AB5 escalations; related‑entity link analysis; capacity‑anomaly review. |
| 1 | **Blue Wire Owner (Damien/Dave)** | Builds and tunes the internal score and its inputs; reviews score‑vs‑outcome; owns scoring config. |
| 2 | **Dispatcher / Ops (front‑line)** | Runs the DOT# pre‑screen before outreach; books only against approved carriers. Status + pre‑screen access only. |
| 2 | **Operations Manager** | Owns dispatch throughput; enforces separation of duties; approves logged load‑level exceptions. |
| 2 | **Claims Coordinator** *(confirm role)* | Opens/manages claims and incidents; links them to carriers/loads for scoring. |
| 2 | **Accounting / Admin** *(confirm role)* | Payment‑hold visibility; dual‑approval on remittance/bank changes. |
| 3 | **External Carrier** *(Phase 3)* | Onboarding, document upload, remediation Q&A, AB5 attestation; own rows only. |

The R&S team are **operational domain experts, not technical staff.** All UI copy, end‑user docs, admin guides, and stakeholder summaries stay in carrier/claims/dispatch language and avoid jargon. Developer‑facing docs may be technical.

---

## 4. Business Problems Solved

| Problem today | RSOS resolution |
| :-- | :-- |
| No defensible audit trail across tools | Append‑only audit log + immutable per‑load snapshots — the contemporaneous Montgomery record. |
| Reps waste cycles onboarding carriers that should be a "hard no from the get‑go" | Front‑line DOT# pre‑screen returns instant Red/Yellow/Green before outreach. |
| Redundant spend across FMCSA‑data and monitoring layers (Zones 1–2) | In‑house snapshot‑diff monitoring on primary FMCSA sources; retire dotmc, shrink Carrier411/CarrierAssure to their non‑FMCSA value. |
| Carrier quality judged inconsistently; scores rendered backwards | One canonical FMCSA scorecard (high = good) drives bands and eligibility everywhere. |
| Remediation reasoning lives in email/screenshots | Structured remediation dossier per review cycle: flag, questions asked, documents obtained, decision, timestamp. |
| Insurance shown as an FMCSA *filing* but a *certificate* only in RMIS; lag between them | Insurance module reconciles COI vs FMCSA filing daily and flags conflicts. |
| Claims/incidents never feed carrier risk | Claims and incidents link to carriers/loads and feed the risk picture and review triggers. |
| DNU list maintained by hand, separate from the TMS and tools | DNU module with controlled reinstatement and TMS write‑back. |
| Own‑fleet telematics siloed | Hybrid scope: a separate, visually distinct own‑fleet safety view fed by Samsara. |
| Five different carrier counts across screens eroded trust | One canonical population figure — **1,136 carriers** — used consistently. |

---

## 5. MVP Scope (Phase 1 — Now, 0–3 months)

**Ship (Montgomery defense first):**
- Carrier Profile (system of record) with the tabbed dossier.
- **Front‑line DOT# pre‑screen (R/Y/G)** — mobile‑usable.
- Insurance & COI tracking vs minimums ($1M auto / $100K cargo / $30K trailer interchange / WC).
- Compliance task tracking (kanban + list).
- Basic role‑aware dashboard.
- Remediation dossier + **snapshot‑on‑every‑load** practice.
- Immutable audit trail; RBAC enforced at the database.
- DNU list.

**Integrations (Phase 1):** QCMobile (pre‑screen); DataHub daily sweep (authority, rating, insurance‑on‑file diff); TMS watchlist‑in + status write‑back *(pending TMS confirmation — Section 18 Q5)*; manual COI upload with optional confidence‑gated OCR.

**Rules live in Phase 1:** #1 approval, #2 conditional‑rating block, #3 insurance expiration, #4 below‑minimum insurance, #5 missing documents, #6 authority revoked/decertify, #9 thin‑file small‑sample guard, #16 load block, #19 override logging.

**Scoring in Phase 1:** the canonical FMCSA composite (Fleet 15 / Vehicle OOS 20 / Driver OOS 25 / Accident 40; Excellent/Good/Fair/Poor) with hard‑gate overrides driving dispatch eligibility. Blue Wire calibration and CarrierAssure divergence land in Phase 2.

**Retire:** dotmc; consolidate FMCSA lookups onto SAFER/QCMobile once the Phase‑1 monitor is validated.

**Governance guardrails applied from day one:**
- Enforcement (suspend / restrict / decertify / add‑to‑DNU) is **confirm‑with‑reason**, never one‑click; each writes rationale + audit.
- **No automated carrier outreach** is built (team: Discuss/Skip).
- **Dispatch blocking** mechanism ships **dormant/advisory** behind a config flag until the team ratifies it (team: Discuss). RED still surfaces as a hard recommendation; hard TMS blocking activates on sign‑off.
- COI OCR is confidence‑gated and **never auto‑approves**.
- No always‑on AI assistant in the MVP (team: Discuss).

---

## 6. Future‑State Scope

**Phase 2 (Next, 3–9 months):** Claims & Incidents module + SLA + IR‑playbook trigger; full FMCSA monitoring (Crash + Inspection ingestion, computed OOS vs national average, monthly SMS/BASIC, 24‑month history, formalized rules engine + auto‑decertification); TMS load‑level checks + tiering + Know‑Your‑Driver for high‑value; **Blue Wire integration** (reconciled against the two outstanding source docs) + small‑sample confidence + loads‑to‑units anomaly + CarrierAssure divergence routing. Rules added: #7, #8, #10–#15, #17, #18, #20.

**Phase 3 (Later, 9+ months):** predictive analytics on monitoring history; AI document review at scale (confidence‑tuned); automated approval for clean‑green carriers (rules‑only, audited — gray middle stays human); executive reporting suite + maturity scoreboard; **external carrier portal**; complete MOTUS migration via the adapter; re‑baseline the vendor stack.

Items still gated on a team decision before their phase (per governance votes): dispatch blocking activation, own‑fleet depth, an in‑app AI assistant, document‑storage/retention approach, COI auto‑reading thresholds, and any automated outreach.

---

## 7. Assumptions

Each carries forward from discovery or established canon. Anything Forrest hasn't ratified is flagged.

- **[A1] FMCSA scorecard is canonical and high = good.** Fleet 15 / Vehicle OOS 20 / Driver OOS 25 / Accident 40; Excellent 80+ / Good 60–79 / Fair 40–59 / Poor <40. Blue Wire is the internal engine that computes it; the PRD's earlier weightings (0.35 carrier / 0.20 insurance / …) are treated as superseded starter values pending the two Blue Wire source docs.
- **[A2] Canonical carrier population is 1,136.** Used for all counts, dashboards, and seed sizing. Illustrative totals in the Stitch pack (e.g., 412/38/11/6) are demo content, not the real distribution.
- **[A3] Own fleet ≈ 22 power units** (Forrest Transportation); hybrid scope; separate asset view fed by Samsara, visually distinct from carrier risk.
- **[A4] Insurance minimums:** auto $1,000,000 / cargo $100,000 / trailer interchange $30,000 / workers comp per requirement.
- **[A5] Platform.** The org is standardized on **Microsoft 365**, and BI is **Tableau** (not Power BI). Per the explicit build instruction, the app is **Supabase‑first under Work4Vince Org**; M365 shows up as connectors (Entra/Azure AD SSO, Teams alert channel, SharePoint document mirror) and Tableau as a read‑only export. The Supabase‑vs‑Azure platform mandate is a live decision (Section 8 risks; Section 18 Q7).
- **[A6] The rules engine is the SOP (page 2).** Thresholds are config‑driven so they change without code.
- **[A7] Team‑vote governance.** Discuss/Skip features are not active defaults; confirm‑with‑reason and staged bulk review are required patterns.
- **[A8] Blueprint content is represented by the PRD.** The Operational Blueprint v1.0 was unavailable this session; the PRD (its synthesis) stands in.
- **[A9] Roles.** Claims Coordinator, Accounting/Admin, and External Carrier are proposed standard roles pending org confirmation.

---

## 8. Risks

| # | Risk | Impact | Mitigation |
| :-- | :-- | :-- | :-- |
| R1 | **Platform‑mandate conflict** — build instruction says Supabase/Work4Vince Org, but the org is M365‑standardized and may mandate Azure/Entra governance. | Rework of hosting/auth if reversed. | Build on portable Postgres + a thin adapter; keep the Azure fallback (Functions + Postgres Flexible Server + Entra ID) designed with the same schema. Resolve Q7 before go‑live. |
| R2 | **MOTUS schema flux** — FMCSA open‑data schemas are changing. | Broken ingestion. | All FMCSA reads go through the adapter layer; a schema change is a one‑file edit. Never hard‑wire legacy SAFER screens. |
| R3 | **Re‑baking the wrong scoring model** — the inversion/insurance‑placeholder bug recurring. | Loss of stakeholder trust; unsafe eligibility calls. | Canonical FMCSA scorecard encoded in `packages/scoring` and the `risk_scores` schema; UI bands and seed data asserted against it in tests. |
| R4 | **TMS unknown** — name, API capabilities, and auth unconfirmed. | Blocks monitoring write‑back and load‑level enforcement. | Build the TMS connector behind an interface; ship Phase 1 with watchlist import + manual/queued write‑back; wire real‑time hook when Q5 closes. |
| R5 | **Governance drift** — an enforcement/outreach feature ships as an active default. | Violates team votes; erodes trust. | Confirm‑with‑reason dialogs; dispatch‑block dormant behind config; no automated outreach; code review checks against the vote list. |
| R6 | **Insurance filing ≠ certificate** — FMCSA shows the filing with lag. | False "insured" reads. | Reconcile COI (RMIS/manual) vs FMCSA filing daily; flag conflicts; RMIS stays. |
| R7 | **Thin‑file drayage noise** — one OOS on one inspection reads as 100%. | False fails on single‑truck carriers. | Small‑sample guard (#9): below the inspection threshold, no auto‑fail; route to qualitative review; confidence modifier keeps thin files near neutral. |
| R8 | **Identity theft invisible in FMCSA** — a fraudster using real clean credentials looks perfect. | Missed fraud. | Keep Highway/Carrier411 in the loop; related‑entity/chameleon screening; Know‑Your‑Driver at pickup for high‑value. |
| R9 | **OCR over‑trust** — auto‑approving parsed COIs. | Bad insurance data. | Confidence threshold → human verify; never auto‑approve below confidence. |
| R10 | **Secrets sprawl** across FMCSA WebKey, vendor keys, TMS creds, LLM key. | Breach exposure. | Env vars / Supabase Vault only; least‑privilege service keys; nothing in code. |
| R11 | **Blueprint not reviewed this session.** | Possible missed discovery detail. | PRD used as synthesis; re‑reconcile against the Blueprint when available (Q13). |

---

## 9. Dependencies

- **FMCSA access:** Login.gov account + QCMobile **WebKey**; DataHub bulk file access (data.transportation.gov); SMS download files.
- **Vendor access decisions:** which of RMIS / Highway / Carrier411 / CarrierAssure expose APIs vs portal‑only (Q11) — determines auto‑pull vs manual entry per vendor.
- **TMS contract:** name, API docs, read‑watchlist / write‑status / real‑time load hook, auth (Q5).
- **Samsara:** own‑fleet telematics access for the hybrid asset view.
- **M365:** Entra/Azure AD tenant for SSO; Teams incoming‑webhook URL; SharePoint site for the optional document mirror; Tableau workspace for BI export.
- **LLM API** (Claude/OpenAI/Gemini) for confidence‑gated COI OCR and qualitative‑review assistance.
- **Accounts/access provisioning:** Work4Vince Supabase org; GitHub org/owner rights; Vercel (or Azure) hosting; Sentry.

---

## 10. Required Accounts & Access

| Account | Purpose | Owner to provision |
| :-- | :-- | :-- |
| **Supabase — Work4Vince Org** | DB, Auth, Storage, Edge Functions | Build lead |
| **GitHub org** | Source repo + Actions CI/CD | Build lead |
| **Vercel** *(or Azure if Q7 → Azure)* | Next.js hosting | Build lead |
| **Login.gov + FMCSA WebKey** | QCMobile API | Safety Manager / build lead |
| **FMCSA DataHub / SMS** | Bulk + monthly files | Build lead |
| **TMS API** | Watchlist + write‑back + load hook | Richard (Q5) |
| **RMIS / Highway / Carrier411 / CarrierAssure** | COI / identity / peer / grade | Richard (Q11) |
| **Samsara** | Own‑fleet telematics | Ops / build lead |
| **Entra (Azure AD)** | SSO / MFA | IT / M365 admin |
| **Teams webhook + SharePoint site** | Alerts + doc mirror | IT / M365 admin |
| **Tableau** | BI export | Analytics owner |
| **LLM API key** | COI OCR / review assist | Build lead |
| **Sentry** | Error tracking | Build lead |

---

## 11. Supabase Setup Plan (Work4Vince Org)

1. **Create/verify project** `forrest-rsos` under the **Work4Vince Org** (the Antigravity prompt verifies access before creating; if a matching project exists, it inspects and reuses).
2. **Environments:** separate Supabase projects for `dev`, `staging`, `prod` (or branch databases where used) so RLS and data are isolated.
3. **Auth:** Supabase Auth with email + SSO; **phishing‑resistant MFA required** for all internal roles (the cyber‑hygiene pillar). If Q7 → Azure/Entra, front SSO with Entra.
4. **Storage buckets:** `coi-documents`, `police-reports`, `attestations`, `evidence-packets`, `carrier-uploads` — all **private**, signed‑URL access, scoped by RLS.
5. **Database:** run migrations in order; **enable RLS before any prod data**; create Postgres enums; make `audit_logs` append‑only (revoke update/delete for app roles); index/partition `fmcsa_snapshots` by `(carrier_id, snapshot_date)` and keep 24 months.
6. **Edge Functions:** `pre-screen`, `load-check`, `compute-score`, `datahub-diff` trigger, `coi-parse` (confidence‑gated), `tms-writeback`, `notify`.
7. **Roles (DB):** `r_s_vp`, `safety_manager`, `triage_reviewer`, `deep_dive_analyst`, `blue_wire_owner`, `ops_manager`, `dispatcher`, `claims_coordinator`, `accounting_admin`, `external_carrier`.
8. **Secrets:** Supabase Vault / env for WebKey, vendor keys, TMS creds, LLM key, Teams webhook — never in code.
9. **Backups:** PITR enabled; periodic logical dumps to cold storage; document versioning on.

---

## 12. GitHub Repo Creation Plan

- **Repo:** `forrest-rsos` (private) in the target GitHub org. The Antigravity prompt verifies access, creates or reuses appropriately, and never overwrites an existing repo without explicit approval.
- **Branches:** `main` (protected, prod) → `staging` → `dev`; feature branches `feat/*`, fixes `fix/*`. PRs require green CI + one review; direct pushes to `main` blocked.
- **CI/CD (Actions):** `ci.yml` (lint, typecheck, unit + integration + RLS tests, build, security scan) on every PR; `deploy.yml` (migrations → staging → prod on tagged release) with manual approval gate to prod.
- **Secrets:** stored as GitHub Actions secrets (Supabase keys per env, hosting token, WebKey, vendor keys). `.env.example` committed; real `.env*` git‑ignored.
- **Repo hygiene:** `README.md`, `docs/` (this plan + the documentation file + ADRs), `CODEOWNERS`, issue/PR templates, `SECURITY.md`.

---

## 13. Repo Structure

```
forrest-rsos/
├─ .github/
│  ├─ workflows/            # ci.yml, deploy.yml
│  ├─ CODEOWNERS
│  └─ ISSUE_TEMPLATE/
├─ apps/
│  └─ web/                  # Next.js (App Router) + Tailwind
│     ├─ app/               # routes: dashboard, carriers, pre-screen, drivers,
│     │                     #   equipment, insurance, fmcsa-monitoring, claims,
│     │                     #   compliance-tasks, risk-review, documents,
│     │                     #   own-fleet-safety, reports, admin
│     ├─ components/        # KPI cards, dense tables, status chips, drawers, kanban
│     ├─ lib/               # supabase client, auth guards, formatters, band logic
│     └─ styles/            # tokens from Part A v2 (navy primary; G/Y/O/R status)
├─ supabase/
│  ├─ migrations/           # timestamped SQL (schema, enums, RLS, triggers, indexes)
│  ├─ functions/            # edge functions (pre-screen, load-check, compute-score, ...)
│  ├─ seed/                 # seed.sql / seed scripts (1,136 carriers; ~22 own units)
│  └─ config.toml
├─ packages/
│  ├─ fmcsa-adapter/        # raw FMCSA fields -> internal schema (MOTUS-isolating)
│  ├─ scoring/              # canonical FMCSA scorecard + Blue Wire engine
│  └─ shared/               # types, enums, constants (minimums, weights, bands)
├─ workers/
│  ├─ datahub-daily/        # daily ETL + snapshot + diff
│  └─ sms-monthly/          # monthly BASIC / OOS-vs-national-average
├─ n8n/                     # orchestration flows: email ingestion, webhooks, retries
├─ docs/
│  ├─ Forrest_RSOS_Implementation_Plan.md
│  ├─ Forrest_RSOS_Project_Documentation.md
│  └─ adr/                  # architecture decision records
├─ tests/
│  ├─ unit/                 # scoring math, minimum validation, OOS calc, rule firing
│  ├─ integration/          # QCMobile, DataHub diff, SMS, TMS, vendor adapters
│  ├─ rls/                  # per-role can/can't matrix
│  └─ e2e/                  # pre-screen RED stop; onboarding block; remediation→GREEN; etc.
├─ .env.example
├─ package.json
└─ README.md
```

---

## 14. Database Build Plan

1. **Enums first** (authority_status, safety_rating, quality_band, dispatch_band, carrier status, policy_type, claim_type, claim status, severity, task status, integration name/status).
2. **Core tables** per the Data Model (full table dictionary in the Documentation file): `carriers`, `drivers`, `trucks`, `trailers`, `chassis`, `insurance_policies`, `certificates`, `documents`, `claims`, `incidents`, `safety_events`, `compliance_tasks`, `fmcsa_snapshots`, `risk_scores`, `users`, `roles`, `audit_logs`, `integrations`, `notifications`, `load_risk_checks`; plus `customers`, `dnu_list`, `remediation_dossiers`, `related_entities`, `loads`, and an own‑fleet set (`fleet_assets`, `fleet_safety_events`) for the hybrid view.
3. **Scoring correction baked in.** `risk_scores` is modeled on the **FMCSA scorecard**, not the placeholder weights:
   - `fleet_size_score`, `vehicle_oos_score`, `driver_oos_score`, `accident_rate_score` (each 0–100),
   - `overall_score` (0–100 composite, **high = good**),
   - `quality_band` enum `excellent | good | fair | poor`,
   - `confidence_modifier` (small‑sample), `carrierassure_grade`, `divergence_flag`,
   - `dispatch_band` enum `green | yellow | orange | red` (derived from quality band + hard gates + open flags).
   Insurance/claims/compliance are recorded as **hard gates and flags**, not composite weights.
4. **Relationships & integrity:** child tables → `carriers` (FK); claims/incidents → carriers (+ optional loads/customers); compliance_tasks → users (+ optional carriers/claims); load_risk_checks → carriers + fmcsa_snapshots; related_entities self‑references carriers.
5. **Audit & history:** `audit_logs` append‑only via revoked update/delete + DB triggers on insert/update of carriers, insurance_policies, claims, incidents, load_risk_checks, risk_scores; `fmcsa_snapshots` indexed/partitioned by `(carrier_id, snapshot_date)`, 24‑month retention with `payload_hash` for integrity.
6. **RLS everywhere**, mapped to the ten roles (dispatcher: status + pre‑screen only; external_carrier: own rows only).
7. **Seed data:** realistic thin‑file drayage fixtures, the **1,136‑carrier** population, ~22 own‑fleet units, and the four example carriers used across the mockups — with **correct** score directionality (an 86 is *excellent/eligible*, not dangerous).

---

## 15. Frontend Build Plan

- **Stack:** Next.js (App Router) + Tailwind. Dense, professional, status‑driven enterprise console per the *Part A v2* design system — navy primary; consistent status language **Green = Approved / Yellow = Needs Review / Orange = Restricted / Red = Blocked/DNU**; Inter type; tabular numerals in tables.
- **Consistent global shell — one navigation, not fifteen.** A single collapsible left sidebar on every screen (canonical **14‑item** set below) plus a top bar with global DOT#/MC# search, notifications bell, and role badge. **Admin/Settings is reachable from every screen** (fixes the prior unreachable‑Settings bug).

  Proposed canonical nav (reconcile to *Part A v2* as the authority): **Dashboard · Carriers · Pre‑Screen · Drivers · Equipment · Insurance · FMCSA Monitoring · Claims · Compliance Tasks · Risk Review · Documents · Own‑Fleet Safety · Reports · Admin.** Fraud‑detection and capacity‑anomaly functions are **consolidated into Risk Review / the deep‑dive investigation workspace** (the previously separate Fraud Detection and Capacity Analytics screens are merged).
- **Screens (Phase 1 in bold):** **Dashboard**, **Carrier Profile** (tabbed: Overview / Insurance / Safety‑FMCSA / Remediation / Documents / Claims / Related Entities / Audit), **DOT# Pre‑Screen** (mobile‑first big R/Y/G result), **Insurance Tracker**, **Compliance Task Board**, **Risk Review Queue** (with remediation drawer), Claims Dashboard, Incident Intake, Document Center, Own‑Fleet Safety, Reports, **Admin Settings**.
- **UI copy is plain‑language and grounded in the workflow** — the audience are domain experts, not engineers. No system/jargon copy in user‑facing surfaces.
- **Governance in the UI:** enforcement buttons open a **confirm‑with‑reason** dialog (rationale required, writes audit); bulk actions run **staged review**, never one‑click; there is **no automated‑outreach** control; the dispatch‑block toggle is present but **dormant/advisory** until config sign‑off.
- **Score presentation is corrected:** higher score = better; Excellent/Good/Fair/Poor bands rendered so green reads as good. No high‑score‑as‑danger anywhere.
- **Responsiveness:** Dashboard, approvals, and Pre‑Screen fully responsive (phone‑usable pre‑screen); analyst‑heavy tables (link analysis, monitoring) desktop‑first.
- **No browser storage** in any client component; React state only.
- **Empty/error states** standardized: e.g., *"No exceptions today — all carriers within policy."* / *"FMCSA sweep delayed; showing last good data from {timestamp}."*

---

## 16. Backend / API Build Plan

- **FMCSA adapter layer** (`packages/fmcsa-adapter`): the only place raw FMCSA fields map to the internal schema — MOTUS isolation, one‑file fix.
- **QCMobile client:** Login.gov WebKey auth; GET by DOT#/MC# → authority, rating, insurance‑on‑file, authorization. Powers pre‑screen + onboarding. Retry with backoff; on failure return last snapshot and set `integrations.status='degraded'` — **never auto‑approve on stale/degraded data.**
- **DataHub daily ETL worker:** download Census/Crash/Inspection (~noon ET) → filter to the TMS watchlist → normalize via adapter → write today's `fmcsa_snapshots` row with `payload_hash` → **diff vs yesterday** on authority_status, safety_rating, insurance_on_file → emit change events. Phase 1 diffs the three daily fields; Phase 2 adds Crash/Inspection and OOS computation.
- **SMS monthly worker:** ingest BASIC/SMS; compute OOS vs national average; **label all BASIC alerts as monthly** (freshness honesty).
- **TMS connector (interface‑first):** pull watchlist + loads; push carrier status (approved/restricted/suspended/dnu); real‑time load‑check endpoint. Ships with queued/retried write‑back; real‑time hook activates on Q5.
- **Vendor adapters (read):** RMIS (COI docs), Highway (identity), Carrier411 (peer reports — **absence = "no report," not "clean"**), CarrierAssure (grade — benchmark only, never a sole gate).
- **Scoring service** (`packages/scoring`): canonical FMCSA composite + hard‑gate overrides → `dispatch_band`; Blue Wire engine folds in the small‑sample confidence modifier and loads‑to‑units anomaly (Phase 2) and reconciles against the two outstanding Blue Wire docs; CarrierAssure divergence sets `divergence_flag` and routes to review. Recompute on any input change; write `risk_scores` + audit; expose the contribution breakdown for the UI. **Weights/thresholds are config, versioned.**
- **Confidence‑gated OCR** (`coi-parse`): parse COI limits/dates into `documents.parsed_fields`; below confidence → human verify; never auto‑approve.
- **Orchestration:** n8n for email ingestion, vendor webhooks, and retries; log every external call.

---

## 17. Authentication & Security Plan

- **Auth:** Supabase Auth (email + SSO); **phishing‑resistant MFA required** for internal roles. Entra/Azure AD SSO if Q7 → M365 governance.
- **Authorization:** RBAC enforced at the **database** via RLS mapped to the ten roles (Documentation file has the full matrix). Dispatcher sees status + pre‑screen only; external_carrier sees only its own carrier rows; delete is near‑absent (records are archived/superseded; only VP may delete, always with an audit entry).
- **Overrides:** every override captures a rationale and writes an **immutable** audit row.
- **Data protection:** least‑privilege service keys; encrypted secrets (Vault/env); signed‑URL private storage scoped by RLS.
- **Cyber‑hygiene pillar:** DMARC/SPF/DKIM on mail; domain‑spoof monitoring; **bank/remittance‑change call‑back verification** baked into the flow; remittance changes require dual approval (rule #18).
- **Audit backbone:** append‑only `audit_logs` + immutable snapshot hashes; DB triggers write on state change; one‑click evidence‑packet export for litigation.
- **Monitoring:** integration health board, job success/failure alerts, Sentry, uptime checks.

---

## 18. Open Questions

Carried forward from the PRD with status updated, plus new items surfaced by the build/infrastructure layer. Numbering keeps PRD references where they apply.

| # | Question | Status | Effect if unresolved |
| :-- | :-- | :-- | :-- |
| Q1 | **R/Y/G thresholds** — exact cutoffs, and how the FMCSA quality bands (Excellent/Good/Fair/Poor) map to dispatch eligibility (esp. where Good and Fair split into eligible vs review vs restricted). | **Open — Matt.** Build uses documented config placeholders and asserts the mapping in tests. | Final eligibility mapping not locked. |
| Q2 | **Blue Wire weighting & the two source docs.** Reconcile the internal engine against the canonical FMCSA scorecard and the outstanding documents; confirm whether credit score is an input and at what weight. | **Open — Matt.** FMCSA scorecard is canonical in the interim. | Blue Wire calibration deferred to Phase 2. |
| Q3 | **Qualitative‑review rubric** — ratify administrative / minor / safety‑critical definitions. | **Open — Matt.** Rubric scaffolded; definitions pending. | Reviewer consistency depends on it. |
| Q4 | **Post‑MOTUS data sourcing** — SAFER‑feed replacement and final QCMobile/DataHub schemas. | **Open — Richard.** Adapter layer absorbs the change. | Ingestion mapping may shift. |
| Q5 | **TMS** — name, API capabilities (read watchlist / write status / real‑time load hook), auth. | **Open — Richard.** Connector is interface‑first; Phase 1 uses watchlist import + queued write‑back. | Real‑time load enforcement + auto write‑back gated. |
| Q6 | **Pure brokerage vs hybrid** — Samsara scope. | **Resolved — hybrid** (Forrest Logistics + Forrest Transportation). Own‑fleet is a separate, visually distinct asset view (~22 units). | — |
| Q7 | **M365 platform mandate** — Supabase‑first vs Azure/Entra‑first. | **Partly resolved — org is M365‑standardized.** Build proceeds Supabase‑first per explicit instruction, with Entra/Teams/SharePoint connectors; **final hosting/auth mandate still to confirm.** | Hosting/auth rework risk (R1). |
| Q8 | **BI & ELD/HOS** — confirmed tools. | **Resolved — Tableau** (not Power BI). ELD/HOS still aspirational; confirm need for own‑fleet high‑value verification. | ELD/HOS scope only. |
| Q9 | **Customers/shippers data** — source for "claims by customer" and whether shipper‑level risk is in scope. | **Open — Matt.** `customers` table scaffolded. | Customer reporting deferred. |
| Q10 | **Scale** — active carriers, loads/day, document volume. | **Partly resolved** — carriers **1,136**; own fleet ~22. Loads/day and doc volume still needed for sweep/storage/OCR sizing. | Capacity/cost sizing approximate. |
| Q11 | **Vendor APIs** — which of RMIS/Highway/Carrier411/CarrierAssure are API vs portal‑only. | **Open — Richard.** Adapters default to manual entry until confirmed. | Auto‑pull vs manual per vendor undecided. |
| Q12 | **Insurance/contractual scope** — track contingent cargo / broker E&O / anti‑double‑brokering & indemnification clauses / underwriter loss‑control attestations as first‑class records? | **Open — Matt.** Not in Phase 1 schema; easy to add. | Coverage‑integrity records deferred. |
| Q13 | **Operational Blueprint reconciliation** — the Blueprint wasn't available this session. | **New — build team.** PRD used as synthesis. | Minor discovery details may need reconciling. |
| Q14 | **Work4Vince Org access** — Supabase org rights, GitHub org owner rights, hosting account. | **New — build lead.** Antigravity prompt verifies before creating. | Provisioning blocks build start. |
| Q15 | **Dispatch‑blocking activation** — team ratification to switch the block from advisory to enforcing. | **New — R&S team (Discuss item).** Ships dormant behind config. | Hard TMS blocking stays off until signed off. |

---

## 19. Step‑by‑Step Milestones

| Milestone | What "done" means |
| :-- | :-- |
| **M0 — Access & scaffolding** | Work4Vince Supabase org verified; GitHub repo created/connected; repo structure + CI skeleton in place; `.env.example` complete; secrets provisioned. |
| **M1 — Schema + RLS** | All tables, enums, FKs, indexes/partitioning, append‑only audit, RLS for ten roles migrated to `dev`; RLS tests green. |
| **M2 — Scoring engine (canonical)** | FMCSA composite + hard gates + dispatch‑band derivation implemented; unit tests assert high = good, band boundaries, and hard‑gate overrides; contribution breakdown exposed. |
| **M3 — FMCSA adapter + pre‑screen** | Adapter maps raw → internal; QCMobile client + DataHub daily diff (three fields) live; pre‑screen returns R/Y/G with reasons and logs every check. |
| **M4 — Phase‑1 UI** | Global shell (single nav, Settings reachable), Dashboard, Carrier Profile, Pre‑Screen, Insurance Tracker, Compliance Board, Risk Review, Admin — with corrected score direction, confirm‑with‑reason enforcement, dormant dispatch‑block. |
| **M5 — Insurance + documents + DNU** | COI tracking vs minimums; confidence‑gated OCR; DNU list with controlled reinstatement; TMS watchlist import + queued write‑back. |
| **M6 — Seed + audit + E2E** | 1,136‑carrier seed with correct directionality; audit triggers verified append‑only; Phase‑1 E2E flows pass (RED hard‑stop, conditional‑rating block, yellow→GREEN with dossier, auto‑decertify → write‑back, load block on lapsed insurance). |
| **M7 — Staging + security sign‑off** | Deploy to staging; MFA enforced; RLS verified by role; DMARC/DKIM; least‑privilege keys; Sentry + health board live. |
| **M8 — Phase‑1 go‑live** | Prod migrations; watchlist imported; initial snapshot backfilled; thresholds/minimums/weights loaded to config; users + roles + MFA; retire dotmc after monitor validation. |
| **M9+ — Phase 2/3** | Claims/incidents + IR playbook; full monitoring (Crash/Inspection, OOS, monthly SMS, 24‑mo history); load‑level enforcement + tiering + Know‑Your‑Driver; Blue Wire integration; then predictive analytics, AI doc review, external portal. |

---

## 20. Acceptance Criteria

**Functional**
- Pre‑screen returns R/Y/G with contributing reasons and logs every check; **RED is a hard stop** (advisory or enforcing per config).
- Carrier Profile shows the canonical score with **high = good** directionality and correct Excellent/Good/Fair/Poor bands.
- Insurance validates against $1M/$100K/$30K/WC; expired/below‑minimum restricts and flags; COI vs FMCSA‑filing conflicts are surfaced.
- Onboarding blocks conditional/unsatisfactory ratings and missing/expired COI.
- Remediation dossier captures flag, questions, documents, decision, timestamp for every yellow‑path carrier.
- Every load assignment writes a point‑in‑time carrier snapshot tied to the load.
- DNU add/reinstate is controlled and audited.

**Data & scoring**
- `risk_scores` reflects the FMCSA scorecard components (fleet/vehicle‑OOS/driver‑OOS/accident) and weights; unit tests assert boundaries and hard‑gate overrides.
- Canonical population reads **1,136** wherever a carrier count appears.
- Thin‑file carriers are not auto‑failed on percentage metrics below the sample threshold.

**Governance**
- No automated‑outreach feature exists; enforcement is confirm‑with‑reason; bulk actions are staged; dispatch‑block defaults to dormant/advisory.
- Every override and enforcement action writes an immutable audit row with rationale.

**Security & audit**
- RLS verified per role (dispatcher can't see risk data; external_carrier sees only own rows); `audit_logs` rejects update/delete; MFA enforced.
- Degraded/stale FMCSA data never yields an auto‑approval.

**Delivery**
- CI green (lint, types, unit, integration, RLS, E2E, security scan); staging deploy verified; final "what was created" report produced by the Antigravity run.

---

## 21. Final Checklist

**Access & provisioning**
- [ ] Work4Vince Supabase org access verified
- [ ] GitHub org owner rights verified; repo created/connected
- [ ] Hosting (Vercel or Azure per Q7) provisioned
- [ ] FMCSA WebKey (Login.gov) obtained; DataHub/SMS access confirmed
- [ ] Vendor + TMS + Samsara + M365 + LLM + Sentry credentials provisioned to Vault/env

**Database**
- [ ] Enums, tables, FKs, indexes/partitioning migrated in order
- [ ] `risk_scores` modeled on the **FMCSA scorecard** (not placeholder weights)
- [ ] `audit_logs` append‑only; triggers on state changes
- [ ] `fmcsa_snapshots` partitioned/indexed by `(carrier_id, snapshot_date)`, 24‑mo retention
- [ ] RLS enabled on all tables for the ten roles; verified by tests
- [ ] Seed loads **1,136 carriers**, ~22 own‑fleet units, correct score directionality

**Scoring & rules**
- [ ] FMCSA composite + hard gates + dispatch‑band derivation implemented and unit‑tested (high = good)
- [ ] Small‑sample guard prevents thin‑file auto‑fail
- [ ] Thresholds/weights in versioned config (placeholders documented pending Q1/Q2)

**Integrations**
- [ ] Adapter layer isolates FMCSA; MOTUS change = one‑file edit
- [ ] QCMobile + DataHub daily diff live; never auto‑approve on degraded/stale data
- [ ] SMS/BASIC alerts labeled monthly
- [ ] TMS connector interface‑first; watchlist import + queued write‑back
- [ ] Carrier411 absence treated as "no report"; CarrierAssure benchmark‑only
- [ ] COI OCR confidence‑gated; never auto‑approves

**Frontend & governance**
- [ ] Single global nav on every screen; Admin/Settings reachable everywhere
- [ ] Fraud/capacity functions consolidated into Risk Review
- [ ] Score direction corrected in every view
- [ ] Enforcement = confirm‑with‑reason; bulk = staged; no automated outreach; dispatch‑block dormant by default
- [ ] Plain‑language UI copy; no browser storage; pre‑screen phone‑usable

**Security, testing, delivery**
- [ ] MFA enforced; least‑privilege keys; signed‑URL private storage
- [ ] Unit + integration + RLS + E2E + security scans green
- [ ] Staging verified; prod migrations run; watchlist imported; initial snapshot backfilled
- [ ] dotmc retired after monitor validation
- [ ] Final "what was created" report produced; docs committed to `docs/`

**Open decisions to close before full go‑live**
- [ ] Q1 R/Y/G thresholds + band→eligibility mapping (Matt)
- [ ] Q2 Blue Wire weights + two source docs (Matt)
- [ ] Q5 TMS name/API/auth (Richard)
- [ ] Q7 final platform/hosting mandate
- [ ] Q15 dispatch‑block activation ratified by the team
