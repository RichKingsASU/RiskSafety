-- supabase/migrations/0001_init.sql
-- Golden-pattern migration for the highest-risk tables. Generate the remaining
-- tables (drivers, trucks, trailers, chassis, insurance_policies, certificates,
-- documents, claims, incidents, compliance_tasks, fmcsa_snapshots, loads,
-- load_risk_checks, customers, related_entities, dnu_list, remediation_dossiers,
-- fleet_assets, fleet_safety_events, users, roles, integrations, notifications)
-- from docs/Forrest_RSOS_Project_Documentation.md using THESE patterns:
--   * enums for statuses  * append-only audit_logs + trigger  * RLS on every table
--   * risk_scores modeled on the FMCSA scorecard (below), NOT placeholder weights.

-- ---------- Enums ----------
create type authority_status as enum ('active', 'inactive', 'revoked', 'pending');
create type safety_rating   as enum ('satisfactory', 'conditional', 'unsatisfactory', 'unrated');
create type quality_band    as enum ('excellent', 'good', 'fair', 'poor');   -- HIGH = GOOD
create type dispatch_band   as enum ('green', 'yellow', 'orange', 'red');     -- eligibility
create type carrier_status  as enum ('prospect', 'onboarding', 'approved', 'restricted', 'suspended', 'dnu');
create type severity_level  as enum ('low', 'medium', 'high', 'critical');
create type safety_event_type as enum ('inspection', 'crash', 'oos', 'violation');
create type severity_class  as enum ('administrative', 'minor', 'safety_critical');
create type snapshot_source as enum ('qcmobile', 'datahub', 'sms');

-- ---------- carriers ----------
create table carriers (
  id                   uuid primary key default gen_random_uuid(),
  dot_number           text not null unique,             -- stable primary match key
  mc_number            text,
  legal_name           text not null,
  dba_name             text,
  authority_status     authority_status not null default 'pending',
  authority_grant_date date,
  safety_rating        safety_rating not null default 'unrated',
  power_unit_count     int,                              -- MCS-150; loads-to-units anomaly input
  physical_address     text,
  phone                text,
  ab5_status           text,                             -- compliant/non_compliant/attested/na
  identity_verified    boolean not null default false,   -- from Highway
  dispatch_band        dispatch_band not null default 'yellow',
  status               carrier_status not null default 'prospect',
  primary_reviewer_id  uuid,                             -- FK -> users (added later)
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ---------- safety_events (feeds Vehicle OOS, Driver OOS, Accident Rate) ----------
create table safety_events (
  id               uuid primary key default gen_random_uuid(),
  carrier_id       uuid not null references carriers(id) on delete restrict,
  event_type       safety_event_type not null,
  event_date       date not null,
  oos_flag         boolean not null default false,
  violation_detail text,                                 -- qualitative: "low tire" vs safety-critical
  severity_class   severity_class,
  source           text not null,                        -- fmcsa_inspection / fmcsa_crash
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_safety_events_carrier on safety_events (carrier_id, event_date);

-- ---------- risk_scores (CANONICAL FMCSA scorecard — HIGH = GOOD) ----------
-- overall_score = 0.15*fleet + 0.20*vehicle_oos + 0.25*driver_oos + 0.40*accident_rate
-- Insurance/claims/compliance are HARD GATES + FLAGS, NOT columns weighted here.
create table risk_scores (
  id                   uuid primary key default gen_random_uuid(),
  carrier_id           uuid not null references carriers(id) on delete cascade,
  fleet_size_score     int not null check (fleet_size_score between 0 and 100),      -- weight 15%
  vehicle_oos_score    int not null check (vehicle_oos_score between 0 and 100),     -- weight 20%
  driver_oos_score     int not null check (driver_oos_score between 0 and 100),      -- weight 25%
  accident_rate_score  int not null check (accident_rate_score between 0 and 100),   -- weight 40%
  overall_score        int not null check (overall_score between 0 and 100),         -- HIGH = GOOD
  quality_band         quality_band not null,                                        -- excellent/good/fair/poor
  confidence_modifier  numeric not null default 1.0 check (confidence_modifier between 0 and 1),
  carrierassure_grade  text,                                                         -- benchmark only
  divergence_flag      boolean not null default false,
  dispatch_band        dispatch_band not null,                                       -- hard gates force 'red'
  computed_at          timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_risk_scores_carrier on risk_scores (carrier_id, computed_at desc);

-- ---------- audit_logs (APPEND-ONLY — the legal backbone) ----------
create table audit_logs (
  id           uuid primary key default gen_random_uuid(),
  actor_id     uuid,                                     -- FK -> users (added later)
  action       text not null,                            -- created/updated/approved/overrode/decertified/restricted/added_to_dnu
  entity_type  text not null,
  entity_id    uuid not null,
  before       jsonb,
  after        jsonb,
  rationale    text,                                     -- REQUIRED for overrides/enforcement
  occurred_at  timestamptz not null default now()
);
create index idx_audit_entity on audit_logs (entity_type, entity_id, occurred_at desc);

-- Make audit_logs append-only for application roles (Supabase 'authenticated' / 'anon').
revoke update, delete on audit_logs from authenticated, anon;

-- Trigger: write an audit row on state changes of key tables.
create or replace function write_audit_log()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into audit_logs (actor_id, action, entity_type, entity_id, before, after)
  values (
    nullif(current_setting('request.jwt.claim.sub', true), '')::uuid,
    lower(tg_op),
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );
  return coalesce(new, old);
end;
$$;

create trigger trg_audit_carriers
  after insert or update on carriers
  for each row execute function write_audit_log();

create trigger trg_audit_risk_scores
  after insert or update on risk_scores
  for each row execute function write_audit_log();
-- Repeat for insurance_policies, claims, incidents, load_risk_checks when created.

-- ---------- Row-Level Security ----------
-- Enable on every table; add role policies mapping to the RBAC matrix in the docs.
-- dispatcher: status + pre-screen only; external_carrier: own rows only; delete near-absent.
alter table carriers      enable row level security;
alter table safety_events enable row level security;
alter table risk_scores   enable row level security;
alter table audit_logs    enable row level security;

-- Example policy (replace with full per-role policies in a later migration):
-- authenticated internal roles may read carriers; writes/enforcement are handled in app
-- logic + role-specific policies. Dispatcher visibility is narrowed in the role policies.
create policy carriers_read_authenticated
  on carriers for select
  to authenticated
  using (true);

create policy audit_read_authenticated
  on audit_logs for select
  to authenticated
  using (true);
-- No insert/update/delete policies for audit_logs beyond the trigger's definer insert,
-- and update/delete are revoked above -> append-only.
