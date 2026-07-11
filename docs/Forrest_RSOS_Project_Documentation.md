# Forrest RSOS — Project Documentation

**Product:** Risk & Safety Operating System (RSOS)
**Org:** Forrest Logistics / Forrest Transportation — Risk & Safety department
**Stack:** Next.js + Tailwind · Supabase (Postgres, Auth, Storage, Edge Functions) under **Work4Vince Org** · n8n orchestration
**Audience:** developers, admins, stakeholders, and end users (the Stakeholder Summary and User Guide are written in plain language for non‑technical domain experts).

> **Canonical facts used throughout this document**
> - **Scoring model (canonical, FMCSA‑based, HIGH = GOOD):** Overall Score = Fleet Size 15% + Vehicle OOS 20% + Driver OOS 25% + Accident Rate 40%; quality bands **Excellent 80+ / Good 60–79 / Fair 40–59 / Poor <40**. Insurance, claims, and compliance are hard gates and flags, not weighted score inputs.
> - **Carrier population:** 1,136 (canonical count used in all displays and seed data).
> - **Own fleet:** ~22 power units (Forrest Transportation), hybrid scope, a separate and visually distinct view fed by Samsara.
> - **Insurance minimums:** auto $1,000,000 / cargo $100,000 / trailer interchange $30,000 / workers comp per requirement.
> - **Governance:** team votes are the source of truth; Discuss/Skip features are never active defaults; enforcement is confirm‑with‑reason; bulk actions are staged; the gray middle stays human‑in‑the‑loop.
> - **Status color language everywhere:** Green = Approved · Yellow = Needs Review · Orange = Restricted · Red = Blocked / Do‑Not‑Use.

---

## 1. Product Overview

RSOS is one auditable system of record that replaces the department's tool‑toggling (SAFER, dotmc, RMIS, Carrier411, CarrierAssure, Highway, Samsara, and the in‑development Blue Wire) with a single workspace. It pulls FMCSA data directly, tracks insurance and documents, scores carrier quality on the team's own FMCSA scorecard, manages claims/incidents, runs compliance tasks, and produces a contemporaneous per‑carrier / per‑load due‑diligence record.

**Why now.** *Montgomery v. Caribe Transport II* (Supreme Court, 9‑0, May 14 2026) ended federal preemption for negligent‑selection claims against brokers; the durable defense is a documented record of ordinary care on every carrier and every load. The same day, FMCSA began the **MOTUS** registration transition, changing the open‑data schemas Forrest reads — so all FMCSA reads sit behind an adapter layer (a schema change is a one‑file edit).

**What it is not.** It is not a database that proves a carrier looked clean at signup. It re‑checks at booking, captures the human judgment in the gray middle, and writes an immutable audit trail at every step.

---

## 2. System Architecture

**Shape (text):**

```
[TMS] --watchlist--> [FMCSA Adapter Layer] <-- [FMCSA: QCMobile / DataHub / SMS]
                            |
                    [ETL + Snapshot Store (Postgres)] --diff--> [Rules Engine] --> [Actions]
                            |                                        |     |- alerts (in-app / email / Teams)
        [RMIS COI] [Highway ID] [Carrier411] [CarrierAssure]        |     |- restrict / suspend / decertify + DNU
                            |                                        |     |     (confirm-with-reason; audited)
                    [Scoring Engine: FMCSA scorecard + Blue Wire]    |     |- TMS write-back (dispatch-block: config-gated)
                            |  <-- claims / incidents / compliance   |     |- audit log (append-only)
                    [Next.js + Tailwind UI]  ---  [Supabase Auth + RLS + Storage]
                            |
        [Own-fleet: Samsara --> fleet_safety_events]  (separate, visually distinct view)
```

**Layers**
- **Frontend:** Next.js (App Router) + Tailwind; single global shell (14‑item nav + top bar); status‑driven components; responsive for Dashboard/approvals/pre‑screen, desktop‑first for analyst tables.
- **Backend/API:** Next.js route handlers + Supabase Edge Functions; a dedicated **FMCSA adapter layer** isolating MOTUS schema change.
- **Database:** Supabase managed Postgres; RLS enforces RBAC at the DB; append‑only audit; date‑partitioned `fmcsa_snapshots`.
- **Background jobs:** daily DataHub ETL + monthly SMS workers; n8n for email ingestion, webhooks, and retries.
- **Storage:** Supabase Storage (private buckets; signed URLs; RLS‑scoped).
- **Connectors (M365 org):** Entra/Azure AD SSO, Teams alert channel, SharePoint document mirror, Tableau BI export.

**Architecture Decision Records (ADRs)** live in `docs/adr/`. Key ADRs to record: ADR‑001 Supabase‑first vs Azure/M365 (see Open Question Q7); ADR‑002 FMCSA scorecard as canonical scoring model; ADR‑003 dispatch‑block dormant‑by‑default per team governance; ADR‑004 adapter‑layer pattern for MOTUS.

---

## 3. Data Model

Postgres‑oriented. `id` is `uuid` PK (`default gen_random_uuid()`); every table carries `created_at timestamptz` and `updated_at timestamptz`. FK columns end in `_id`. Statuses use Postgres enums.

**Entity groups**
- **Carrier core:** `carriers`, `drivers`, `trucks`, `trailers`, `chassis`, `related_entities`.
- **Insurance & docs:** `insurance_policies`, `certificates`, `documents`, `dnu_list`.
- **Risk & monitoring:** `fmcsa_snapshots`, `safety_events`, `risk_scores`, `remediation_dossiers`.
- **Claims & work:** `claims`, `incidents`, `compliance_tasks`.
- **Transactions:** `loads`, `load_risk_checks`, `customers`.
- **Own‑fleet (hybrid):** `fleet_assets`, `fleet_safety_events`.
- **Platform:** `users`, `roles`, `audit_logs`, `integrations`, `notifications`.

**Enums**
- `authority_status`: active / inactive / revoked / pending
- `safety_rating`: satisfactory / conditional / unsatisfactory / unrated
- `quality_band`: excellent / good / fair / poor  *(from the FMCSA composite; high = good)*
- `dispatch_band`: green / yellow / orange / red  *(eligibility, derived from quality band + hard gates + open flags)*
- `carrier_status`: prospect / onboarding / approved / restricted / suspended / dnu
- `policy_type`: auto_liability / cargo / trailer_interchange / workers_comp
- `claim_type`: cargo / accident / liability / shortage
- `claim_status`: open / investigating / pending / resolved / denied
- `severity`: low / medium / high / critical
- `task_status`: todo / in_progress / blocked / done
- `integration_name`: qcmobile / datahub / sms / rmis / highway / carrier411 / carrierassure / tms / samsara
- `integration_status`: healthy / degraded / failed / disabled

---

## 4. Table Dictionary

Only representative/important columns shown per table; every table also has `id`, `created_at`, `updated_at`.

### 4.1 carriers
| Field | Type | Notes |
| :-- | :-- | :-- |
| dot_number | text | USDOT #, primary match key (stable) |
| mc_number | text | MC/docket # |
| legal_name | text | Legal entity name |
| dba_name | text | Doing‑business‑as |
| authority_status | enum | active / inactive / revoked / pending |
| authority_grant_date | date | From MCS‑150 (365+ days favorable) |
| safety_rating | enum | satisfactory / conditional / unsatisfactory / unrated |
| power_unit_count | int | Trucks on MCS‑150 (loads‑to‑units anomaly input) |
| physical_address | text | Street/city/state/zip (chameleon matching) |
| phone | text | Contact (verify vs SAFER; call listed number) |
| ab5_status | enum | compliant / non_compliant / attested / na |
| identity_verified | bool | From Highway |
| dispatch_band | enum | green / yellow / orange / red (current eligibility) |
| status | enum | prospect / onboarding / approved / restricted / suspended / dnu |
| primary_reviewer_id | uuid | FK → users |

### 4.2 drivers
| Field | Type | Notes |
| :-- | :-- | :-- |
| carrier_id | uuid | FK → carriers |
| full_name | text | Driver name |
| cdl_number / cdl_state | text | License |
| employment_start | date | Tenure (≥6mo flag for high‑value) |
| tenure_ok_high_value | bool | Computed vs tier rule |
| qualification_status | enum | qualified / pending / disqualified |

### 4.3 trucks / 4.4 trailers / 4.5 chassis
Per carrier (`carrier_id` FK; chassis nullable for pool). Trucks: `vin`, `plate`, `unit_number`, `status`. Trailers: `trailer_type`, `plate`, `status`. Chassis: `chassis_id`, `provider`, `status`. Drayage‑specific chassis tracking is intentional.

### 4.6 insurance_policies
| Field | Type | Notes |
| :-- | :-- | :-- |
| carrier_id | uuid | FK → carriers |
| policy_type | enum | auto_liability / cargo / trailer_interchange / workers_comp |
| insurer_name | text | Insurer |
| coverage_limit | numeric | Validated vs minimums ($1M / $100K / $30K / WC) |
| effective_date / expiration_date / cancellation_date | date | Countdown + lapse detection |
| meets_minimum | bool | vs Forrest minimums |
| source | enum | coi / fmcsa_filing (FMCSA is a *filing*, not the certificate) |
| coi_document_id | uuid | FK → documents |

### 4.7 certificates
`carrier_id` FK; `certificate_type` (COI, W‑9, authority letter, AB5 attestation); `document_id` FK; `issued_date`, `expiration_date`; `status` (valid / expiring / expired / invalid).

### 4.8 documents
Polymorphic store. `entity_type` (carrier / driver / claim / incident / load), `entity_id`, `doc_type` (coi / police_report / attestation / inspection), `file_path` (private bucket), `version`, `parsed_fields jsonb` (confidence‑gated OCR), `uploaded_by` FK.

### 4.9 claims
| Field | Type | Notes |
| :-- | :-- | :-- |
| carrier_id | uuid | FK → carriers |
| load_id | uuid | FK → loads (optional) |
| customer_id | uuid | FK → customers (optional) |
| claim_type | enum | cargo / accident / liability / shortage |
| severity | enum | low / medium / high / critical |
| amount | numeric | Claim value |
| status | enum | open / investigating / pending / resolved / denied |
| at_fault | enum | carrier / not_carrier / undetermined |
| opened_date / resolved_date | date | Lifecycle |
| sla_due | timestamptz | SLA clock |

### 4.10 incidents
`carrier_id`, `load_id` (optional); `incident_type` (accident / cargo_theft / double_brokering / cyber / other); `severity`; `ir_playbook_triggered bool`; `reported_date`; `status` (open / contained / resolved).

### 4.11 safety_events
`carrier_id` FK; `event_type` (inspection / crash / oos / violation); `event_date`; `oos_flag`; `violation_detail` (qualitative — "low tire" vs safety‑critical); `severity_class` (administrative / minor / safety_critical); `source` (fmcsa_inspection / fmcsa_crash). Feeds the **Vehicle OOS**, **Driver OOS**, and **Accident Rate** components of the score.

### 4.12 compliance_tasks
`task_type` (coi_renewal / review / audit / remediation); `carrier_id` / `claim_id` (optional); `assignee_id` FK; `due_date`; `status` (todo / in_progress / blocked / done); `sla_breached bool`.

### 4.13 fmcsa_snapshots
Point‑in‑time record; **indexed/partitioned by `(carrier_id, snapshot_date)`, 24‑month retention.** `snapshot_date`; `authority_status`; `safety_rating`; `insurance_on_file jsonb`; `oos_rate numeric`; `basic_scores jsonb` (monthly SMS); `raw_payload jsonb` (normalized via adapter); `payload_hash text` (integrity/audit); `source` (qcmobile / datahub / sms).

### 4.14 risk_scores  *(modeled on the canonical FMCSA scorecard — corrected)*
| Field | Type | Notes |
| :-- | :-- | :-- |
| carrier_id | uuid | FK → carriers |
| fleet_size_score | int | 0–100 · weight **15%** |
| vehicle_oos_score | int | 0–100 · weight **20%** |
| driver_oos_score | int | 0–100 · weight **25%** |
| accident_rate_score | int | 0–100 · weight **40%** |
| overall_score | int | 0–100 composite · **HIGH = GOOD** |
| quality_band | enum | excellent (80+) / good (60–79) / fair (40–59) / poor (<40) |
| confidence_modifier | numeric | Small‑sample factor 0–1 (thin‑file carriers stay near neutral) |
| carrierassure_grade | text | External benchmark (divergence check only) |
| divergence_flag | bool | Blue Wire/composite vs CarrierAssure beyond tolerance → route to review |
| dispatch_band | enum | green / yellow / orange / red (eligibility; hard gates force red) |
| computed_at | timestamptz | When scored |

> **Correction note.** This replaces the PRD's placeholder sub‑scores (`carrier_score` / `insurance_score` / `claims_score` / `compliance_score` weighting). Insurance, claims, and compliance are **hard gates and flags**, not weighted composite inputs. Blue Wire is the internal engine that computes this composite; its final weights reconcile against the two outstanding Blue Wire source documents (Open Question Q2).

### 4.15 remediation_dossiers
1:1 with a carrier review cycle. `carrier_id` FK; `flag_reason`; `questions_asked jsonb`; `documents_obtained jsonb`; `recurrence_prevention text`; `decision` (advanced_green / restricted / recommend_dnu / escalated); `decided_by` FK; `decided_at`. **This is the contemporaneous "reasonable care" record the Montgomery standard demands.**

### 4.16 loads / 4.17 load_risk_checks
`loads` cached from TMS (`load_id`, `carrier_id`, `commodity`, `value_tier`). `load_risk_checks`: `load_id` (TMS ref), `carrier_id` FK, `checked_by` FK, `carrier_snapshot_id` FK → fmcsa_snapshots (**snapshot at assignment**), `commodity_value_tier` (standard / elevated / high_value), `driver_verified bool`, `tracking_required bool`, `result` (cleared / blocked / exception_approved), `block_reason`, `checked_at`.

### 4.18 customers
`legal_name`, `dba_name`, TMS ref. Supports "claims by customer" and any future shipper‑level risk (Open Question Q9).

### 4.19 related_entities
Self‑referencing carrier↔carrier links for chameleon detection. `carrier_id`, `related_carrier_id`, `link_type` (shared_phone / shared_address / shared_officer), `to_revoked_or_dnu bool`.

### 4.20 dnu_list
`carrier_id` FK; `reason`; `decided_by` FK; `decided_at`; `reinstated bool`; `reinstated_by`; `reinstatement_rationale`. Dual‑control reinstatement.

### 4.21 fleet_assets / 4.22 fleet_safety_events  *(own‑fleet, hybrid)*
`fleet_assets`: Forrest Transportation units (~22) — `unit_number`, `vin`, `type`, `last_inspection`, `maintenance_due bool`. `fleet_safety_events`: `asset_id` FK, `driver_name`, `event_type` (harsh_event / hos / inspection), `score`, `hos_status`, `source` (samsara). Kept visually distinct from third‑party carrier risk.

### 4.23 users / 4.24 roles
`users`: `email`, `full_name`, `role_id` FK, `is_active`, `mfa_enabled` (phishing‑resistant MFA). `roles`: `name`, `permissions jsonb` (capability map — see Section 5).

### 4.25 audit_logs  *(append‑only)*
`actor_id` FK, `action` (created / updated / approved / overrode / decertified / restricted / added_to_dnu), `entity_type`, `entity_id`, `before jsonb`, `after jsonb`, `rationale text` (required for overrides/enforcement), `occurred_at`. **Update/delete revoked for app roles.**

### 4.26 integrations
`name` enum, `auth_type` (api_key / oauth / login_gov_webkey / file), `status` (healthy / degraded / failed / disabled), `last_sync_at`, `config jsonb`.

### 4.27 notifications
`user_id`, `type` (coi_expiring / dot_inactive / claim_opened / load_blocked / task_overdue / divergence / anomaly), `channel` (in_app / email / teams / dashboard), `entity_type`, `entity_id`, `severity` (info / warning / critical), `read bool`, `escalation_level int` (0 initial / 1 manager / 2 VP).

---

## 5. User Roles & Permissions (RBAC)

Enforced at the database with Supabase RLS. Capabilities: View · Create · Edit · Approve · Override · Delete · Export · Admin (✓ allowed; — none; △ scoped/within policy).

| Role (DB name) | View | Create | Edit | Approve | Override | Delete | Export | Admin |
| :-- | :--: | :--: | :--: | :--: | :--: | :--: | :--: | :--: |
| R&S VP / Director (`r_s_vp`) | ✓ | ✓ | ✓ | ✓ | ✓ | △ | ✓ | ✓ (policy) |
| Safety / Compliance Mgr (`safety_manager`) | ✓ | ✓ | ✓ | △ | — | — | ✓ | △ (rules/thresholds) |
| Triage Reviewer — Danica (`triage_reviewer`) | ✓ | ✓ | ✓ | △ (GREEN) | — | — | △ | — |
| Deep‑Dive Analyst — Elizabeth (`deep_dive_analyst`) | ✓ (broad) | ✓ | ✓ | — | — | — | ✓ | — |
| Blue Wire Owner — Damien/Dave (`blue_wire_owner`) | ✓ | ✓ | △ (model) | — | — | — | ✓ | △ (scoring) |
| Operations Manager (`ops_manager`) | ✓ | ✓ | △ | △ (load exceptions) | — | — | △ | — |
| Dispatcher / Ops (`dispatcher`) | △ (status + pre‑screen) | △ (pre‑screen) | — | — | — | — | — | — |
| Claims Coordinator (`claims_coordinator`) | ✓ (claims) | ✓ | ✓ | — | — | — | ✓ | — |
| Accounting / Admin (`accounting_admin`) | △ (payment status) | — | — | △ (dual remittance) | — | — | △ | — |
| External Carrier (`external_carrier`, P3) | △ (own only) | △ (docs) | △ (own) | — | — | — | — | — |

**Delete is intentionally near‑absent.** Records are archived/superseded, not deleted; only the VP may delete and only with an audit entry. Every override requires a rationale and writes an immutable audit row.

---

## 6. Supabase Configuration

- **Project:** `forrest-rsos` under **Work4Vince Org**; separate projects/branches for `dev` / `staging` / `prod`.
- **Auth:** email + SSO; **MFA required** for internal roles (Entra SSO if the org mandates M365 governance — Q7).
- **RLS:** enabled on all tables; policies map to the ten roles; `dispatcher` limited to status + pre‑screen; `external_carrier` limited to own rows.
- **Storage buckets (private, signed URLs, RLS‑scoped):** `coi-documents`, `police-reports`, `attestations`, `evidence-packets`, `carrier-uploads`.
- **Edge Functions:** `pre-screen`, `load-check`, `compute-score`, `datahub-diff`, `coi-parse`, `tms-writeback`, `notify`.
- **DB rules:** `audit_logs` append‑only (revoke update/delete for app roles); triggers write audit rows on insert/update of carriers, insurance_policies, claims, incidents, load_risk_checks, risk_scores; `fmcsa_snapshots` partitioned/indexed by `(carrier_id, snapshot_date)`, 24‑month retention.
- **Backups:** PITR + periodic logical dumps to cold storage; document versioning.

---

## 7. GitHub Configuration

- **Repo:** `forrest-rsos` (private).
- **Branches:** `main` (protected) → `staging` → `dev`; `feat/*`, `fix/*`. PRs require green CI + review; no direct pushes to `main`.
- **Actions:** `ci.yml` (lint, typecheck, unit/integration/RLS/E2E, security scan) on PRs; `deploy.yml` (migrations → staging → prod on tagged release) with a manual prod approval gate.
- **Secrets:** GitHub Actions secrets per environment; `.env.example` committed; real env files ignored.
- **Governance files:** `CODEOWNERS`, `SECURITY.md`, issue/PR templates, ADRs in `docs/adr/`.

---

## 8. Environment Variables

Committed as `.env.example`; real values in Vault / GitHub secrets — **never in code.**

```bash
# --- Supabase (per environment) ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=        # server-side only; never exposed to the client
SUPABASE_PROJECT_REF=

# --- FMCSA ---
FMCSA_QCMOBILE_WEBKEY=            # via Login.gov
FMCSA_DATAHUB_BASE_URL=
FMCSA_SMS_DOWNLOAD_URL=

# --- TMS (confirm name/auth — Open Question Q5) ---
TMS_API_BASE_URL=
TMS_API_KEY=
TMS_WEBHOOK_SECRET=

# --- Vendors (confirm API vs portal — Q11) ---
RMIS_API_KEY=
HIGHWAY_API_KEY=
CARRIER411_API_KEY=
CARRIERASSURE_API_KEY=

# --- Own-fleet (hybrid) ---
SAMSARA_API_TOKEN=

# --- M365 connectors ---
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
TEAMS_WEBHOOK_URL=
SHAREPOINT_SITE_URL=
TABLEAU_SERVER_URL=

# --- AI / OCR (confidence-gated; never auto-approves) ---
LLM_API_KEY=
LLM_PROVIDER=                     # anthropic | openai | gemini

# --- Mail / orchestration / observability ---
SMTP_HOST=
SMTP_USER=
SMTP_PASS=
N8N_BASE_URL=
N8N_API_KEY=
SENTRY_DSN=

# --- Feature flags (governance) ---
FEATURE_DISPATCH_BLOCK_ENFORCING=false   # dormant/advisory until team ratifies (Q15)
FEATURE_AI_ASSISTANT=false               # off by default (team: Discuss)
FEATURE_COI_OCR=true                     # confidence-gated; never auto-approves
```

---

## 9. Local Development Setup

```bash
# Prereqs: Node LTS, npm, Supabase CLI, GitHub CLI, Docker (for local Supabase)
git clone git@github.com:<org>/forrest-rsos.git
cd forrest-rsos
cp .env.example .env.local          # fill in dev values
npm install

# Local Supabase (Docker)
supabase start
supabase db reset                   # applies migrations + seed (1,136 carriers, ~22 units)

# Run the app
npm run dev                         # http://localhost:3000

# Tests
npm run test:unit
npm run test:rls
npm run test:e2e
```

Seed fixtures include thin‑file drayage carriers and the four example carriers used across the mockups, all with **correct score directionality** (e.g., an 86 is excellent/eligible, not dangerous).

---

## 10. Deployment Instructions

Environments: `dev` → `staging` → `prod` (separate Supabase projects + hosting envs). Secrets in env / Vault only.

1. **Database:** run migrations **in order**; **enable RLS before any prod data**; verify `audit_logs` is append‑only.
2. **Workers:** schedule the daily DataHub ETL (after ~noon ET) and the monthly SMS job; deploy n8n flows for email ingestion + webhooks + retries, with failure alerting.
3. **Go‑live:** import the active‑carrier watchlist from the TMS; backfill an initial `fmcsa_snapshot`; load SOP thresholds/minimums and scoring weights into config; create users + roles + enforce MFA.
4. **Observability:** integration health board; job success/failure alerts; Sentry; uptime checks.
5. **Security sign‑off:** MFA enforced; RLS verified by role; DMARC/DKIM on mail; least‑privilege service keys.
6. **Rollback:** migration‑down scripts + restore‑from‑PITR.
7. **Phase rollout:** pre‑screen + monitoring first, then Phases 2–3.
8. **Retire dotmc** once the Phase‑1 monitor is validated.

---

## 11. Admin Guide (for the Safety Manager / VP)

Written for a domain admin, not an engineer.

- **Set the rules and thresholds.** In *Admin → Thresholds/Rules*, change insurance minimums, OOS sample thresholds, band cutoffs, and SLA windows without touching code. Every change is saved with your name and time.
- **Manage the scorecard weights.** In *Admin → Scoring weights* (Blue Wire owners), adjust the Fleet/Vehicle‑OOS/Driver‑OOS/Accident weights and confidence settings. Changes are versioned; nothing is silent.
- **Approvals, restrictions, and DNU.** Enforcement always asks you to **type a reason** before it takes effect. There is no one‑click enforcement. Bulk changes go through a staged review list you confirm.
- **Dispatch blocking.** By default RSOS **recommends** a block on RED carriers but does **not** hard‑block dispatch until the team turns it on (a switch in *Admin → Feature settings*). This reflects the team's "Discuss" decision.
- **Users and roles.** Add people and assign a role; MFA is required. Dispatchers see only status + pre‑screen; carriers (later) see only their own record.
- **Integration health.** *Admin → Integrations* shows each connection as healthy/degraded/failed. If FMCSA is delayed, RSOS shows the last good data and never auto‑approves on stale data.
- **Evidence export.** From any carrier's Audit tab, export a one‑click evidence packet for legal.

---

## 12. User Guide (plain language)

**Dispatcher — before you call a carrier**
1. Open **Pre‑Screen**, type the DOT# or MC#, press **Run pre‑screen**.
2. Read the big result card: **Green** = OK to book · **Yellow** = sent to review · **Red** = do not book, with the reasons listed.
3. Every check is logged automatically — you don't have to save anything.

**Triage Reviewer (Danica) — the yellow middle**
1. Open the **Risk Review** queue; click a carrier to open the **remediation dossier** on the right.
2. Record what flag fired, the questions you asked, the documents you got (e.g., a police report showing no‑fault), and what the carrier changed to prevent recurrence.
3. Choose **Advance to Green**, **Restrict**, or **Recommend DNU** — and type your reason. That record is the company's proof of care.

**Deep‑Dive Analyst (Elizabeth) — investigations**
- Fraud, double‑brokering, chameleon, and capacity‑anomaly work all live in **Risk Review's** deep‑dive workspace (the old separate Fraud Detection and Capacity Analytics screens are merged here). Use related‑entity links to spot shared phones/addresses/officers with revoked carriers.

**Everyone — reading a score**
- **Higher is better.** Excellent (80+) and Good (60–79) are healthy; Fair (40–59) and Poor (<40) need attention. A high number is a *good* carrier, not a dangerous one.

**Own‑fleet (Forrest Transportation)**
- The **Own‑Fleet Safety** view is separate from carrier risk and shows your ~22 trucks and drivers (from Samsara) — safety scores, harsh‑event counts, HOS status.

---

## 13. Standard Operating Procedures (SOPs)

1. **Pre‑screen before outreach.** No carrier is contacted before a logged DOT# pre‑screen. RED is a hard stop (advisory or enforcing per the current setting).
2. **Yellow‑path remediation.** Every flagged‑but‑not‑disqualified carrier gets a dossier (flag → questions → documents → decision → timestamp) before activation.
3. **Snapshot on every load.** Booking a load writes a point‑in‑time carrier snapshot tied to that load.
4. **Daily monitoring.** The system sweeps FMCSA daily (authority/rating/insurance) and monthly (BASIC/OOS); alerts are labeled by freshness.
5. **Decertification & DNU.** Authority revoked / rating downgrade / insurance lapse triggers restrict/decertify with confirm‑with‑reason; reinstatement is dual‑control.
6. **Incident response (Phase 2).** Qualifying incidents trigger the IR playbook: detect → contain (freeze payment/bank change) → switch to out‑of‑band contacts → preserve evidence → notify (insurer, legitimate carrier, load boards/factoring/customer, law enforcement/IC3/CargoNet) → post‑incident review feeds the rules and DNU list.
7. **Remittance/bank changes.** Any bank‑detail change requires dual approval and a call‑back verification.
8. **Thin‑file rule.** Carriers below the inspection‑count threshold are never auto‑failed on percentage metrics; they route to qualitative review.

---

## 14. Testing Checklist

- **Unit:** scoring math (composite, band boundaries, **high = good**, small‑sample modifier, hard‑gate overrides); insurance‑minimum validation; OOS‑rate computation; firing of all 20 business rules.
- **Integration:** QCMobile auth + parse; DataHub ETL + diff (seed yesterday/today, assert change events); SMS monthly ingest; TMS watchlist‑in + status write‑back; vendor adapters (Carrier411 absence = "no report").
- **RLS/authorization:** each role can/can't view/create/edit/approve/override/delete/export per the matrix; dispatcher can't see risk data; external_carrier sees only own rows.
- **Workflow E2E:** pre‑screen RED hard‑stop; onboarding conditional‑rating block; yellow remediation → GREEN with dossier; auto‑decertification on authority revoke → TMS write‑back + DNU; load block on lapsed insurance; remittance dual‑approval.
- **Governance:** enforcement requires a typed rationale; no automated‑outreach path exists; dispatch‑block dormant unless the flag is on; bulk actions are staged.
- **Audit:** every state change writes an immutable row; audit table rejects update/delete.
- **Resilience:** stale/late FMCSA file → reuse last snapshot, **no auto‑approve**; integration auth error → degraded status + alert.
- **Data:** canonical population reads **1,136** everywhere; own‑fleet reads ~22 units.

---

## 15. Security Checklist

- [ ] MFA enforced for all internal roles (phishing‑resistant)
- [ ] RLS enabled and verified per role; delete near‑absent
- [ ] Service keys least‑privilege; secrets in Vault/env only
- [ ] Storage private; signed URLs; RLS‑scoped
- [ ] `audit_logs` append‑only; triggers verified
- [ ] DMARC/SPF/DKIM on mail; domain‑spoof monitoring
- [ ] Bank/remittance change requires dual approval + call‑back
- [ ] Degraded/stale FMCSA data never auto‑approves
- [ ] Evidence‑packet export available for litigation
- [ ] Sentry + integration health board + uptime checks live

---

## 16. Troubleshooting Guide

| Symptom | Likely cause | Action |
| :-- | :-- | :-- |
| Dashboard shows "FMCSA sweep delayed" | DataHub file late/missing (posts ~noon ET) | System reuses last good snapshot; no auto‑approve. Check *Admin → Integrations*; the daily worker retries. |
| A carrier looks "insured" in FMCSA but RMIS/COI disagrees | FMCSA shows the *filing* with lag, not the certificate | Trust the COI; the insurance module flags the conflict; escalate if the filing shows a lapse. |
| Single‑truck carrier flagged 100% OOS | One OOS on one inspection | Small‑sample guard should prevent auto‑fail; if it fired, check the inspection‑count threshold in *Admin → Thresholds*. |
| A clean‑looking carrier is later confirmed fraudulent | Identity theft is invisible in FMCSA data | Rely on Highway/Carrier411 + related‑entity screening + Know‑Your‑Driver at pickup. |
| Score "looks backwards" to a user | Misreading the band | Higher = better; Excellent/Good are healthy. Confirm the view is the corrected build. |
| Enforcement button did nothing | Confirm‑with‑reason dialog not completed | Enforcement requires a typed rationale; re‑open the dialog and enter a reason. |
| Dispatch not actually blocked on RED | `FEATURE_DISPATCH_BLOCK_ENFORCING=false` | Expected until the team ratifies; flip the flag in *Admin → Feature settings* after sign‑off (Q15). |
| Integration shows "degraded" | Vendor/TMS auth error or backoff | Re‑authenticate in *Admin → Integrations*; check the key in Vault. |

---

## 17. Change Management Process

- **Config changes** (thresholds, minimums, weights, SLA) are made in Admin, are **versioned**, and write an audit entry — no code deploy needed.
- **Code changes** flow `dev → staging → prod` via PR with green CI and review; migrations only for DB changes; ADRs record significant decisions.
- **Governance changes** (turning on dispatch blocking, enabling an AI assistant, adding automated outreach) require **explicit team ratification** recorded against the feature‑vote list before the flag is enabled.
- **Rollback:** migration‑down + PITR restore; feature flags allow instant disable without a deploy.
- **Scoring‑model changes** reconcile against the canonical FMCSA scorecard and the two Blue Wire source docs; any change is versioned and audited.

---

## 18. Stakeholder Summary (plain language)

RSOS gives the Risk & Safety team one place to do the whole job — instead of jumping between six or seven tools and keeping decisions in screenshots and spreadsheets. It checks a carrier against FMCSA data automatically, tracks insurance and documents, scores each carrier on **your** scorecard (where a higher number means a better carrier), manages claims, and — most importantly — keeps a complete, time‑stamped record of every decision.

That record matters because of a May 2026 Supreme Court ruling: brokers can now be held to a standard of *ordinary care* in choosing carriers, and the best defense is being able to show exactly what you checked and why you cleared each carrier, on every load. RSOS builds that proof as a by‑product of everyday work.

The system respects the team's decisions. Anything the team hasn't approved — like automatic outreach to carriers, one‑click enforcement, or hard dispatch blocking — is either not built or stays turned off until you say otherwise. Enforcement always asks for a reason first, and the tricky judgment calls stay with your reviewers, not the software.

It starts with the essentials (the pre‑screen, carrier profiles, insurance tracking, the remediation record, and the audit trail), then grows into claims, full monitoring, load‑level checks, and eventually a carrier portal — one phase at a time.
