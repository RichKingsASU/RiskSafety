-- supabase/migrations/0002_schema.sql
-- Remaining RSOS tables generated from docs/Forrest_RSOS_Project_Documentation.md
-- (Section 4 table dictionary), following the 0001 golden patterns:
--   * Postgres enums for statuses      * FK columns end in _id
--   * every table has id/created_at/updated_at   * RLS enabled on every table
--   * append-only audit_logs + trigger extended to the new state-change tables
--   * risk_scores stays the FMCSA scorecard (0001) — insurance/claims/compliance
--     are HARD GATES + FLAGS here, never weighted score inputs.
-- Per-role RLS policies live in 0003_rls.sql (needs the RBAC matrix, Section 5).

-- ======================================================================
-- 1. Enums (statuses use Postgres enums)
-- ======================================================================
create type ab5_status           as enum ('compliant', 'non_compliant', 'attested', 'na');
create type qualification_status as enum ('qualified', 'pending', 'disqualified');
create type equipment_status     as enum ('active', 'inactive', 'maintenance', 'out_of_service');

create type policy_type          as enum ('auto_liability', 'cargo', 'trailer_interchange', 'workers_comp');
create type policy_source        as enum ('coi', 'fmcsa_filing');   -- FMCSA is a *filing*, not the certificate
create type certificate_type     as enum ('coi', 'w9', 'authority_letter', 'ab5_attestation');
create type certificate_status   as enum ('valid', 'expiring', 'expired', 'invalid');
create type document_entity_type as enum ('carrier', 'driver', 'claim', 'incident', 'load');
create type doc_type             as enum ('coi', 'police_report', 'attestation', 'inspection');

create type claim_type           as enum ('cargo', 'accident', 'liability', 'shortage');
create type claim_status         as enum ('open', 'investigating', 'pending', 'resolved', 'denied');
create type at_fault             as enum ('carrier', 'not_carrier', 'undetermined');
create type incident_type        as enum ('accident', 'cargo_theft', 'double_brokering', 'cyber', 'other');
create type incident_status      as enum ('open', 'contained', 'resolved');

create type task_type            as enum ('coi_renewal', 'review', 'audit', 'remediation');
create type task_status          as enum ('todo', 'in_progress', 'blocked', 'done');

create type value_tier           as enum ('standard', 'elevated', 'high_value');
create type load_check_result    as enum ('cleared', 'blocked', 'exception_approved');
create type link_type            as enum ('shared_phone', 'shared_address', 'shared_officer');
create type remediation_decision as enum ('advanced_green', 'restricted', 'recommend_dnu', 'escalated');

create type fleet_event_type     as enum ('harsh_event', 'hos', 'inspection');
create type fleet_source         as enum ('samsara');

create type integration_name       as enum ('qcmobile', 'datahub', 'sms', 'rmis', 'highway', 'carrier411', 'carrierassure', 'tms', 'samsara');
create type integration_auth_type  as enum ('api_key', 'oauth', 'login_gov_webkey', 'file');
create type integration_status     as enum ('healthy', 'degraded', 'failed', 'disabled');

create type notification_type     as enum ('coi_expiring', 'dot_inactive', 'claim_opened', 'load_blocked', 'task_overdue', 'divergence', 'anomaly');
create type notification_channel  as enum ('in_app', 'email', 'teams', 'dashboard');
create type notification_severity as enum ('info', 'warning', 'critical');

-- ======================================================================
-- 2. updated_at touch trigger (shared) — applied to every table, incl. 0001's
-- ======================================================================
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_touch_carriers      before update on carriers      for each row execute function touch_updated_at();
create trigger trg_touch_safety_events before update on safety_events for each row execute function touch_updated_at();
create trigger trg_touch_risk_scores   before update on risk_scores   for each row execute function touch_updated_at();

-- Bring carriers.ab5_status onto its enum (0001 modeled it as text pending this enum).
alter table carriers alter column ab5_status drop default;
alter table carriers alter column ab5_status type ab5_status using coalesce(ab5_status, 'na')::ab5_status;
alter table carriers alter column ab5_status set default 'na';
alter table carriers alter column ab5_status set not null;

-- ======================================================================
-- 3. Platform: roles, users (created early so FKs resolve)
-- ======================================================================
create table roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,                       -- r_s_vp, safety_manager, ... (Section 5)
  permissions jsonb not null default '{}'::jsonb,         -- capability map
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table users (
  id           uuid primary key default gen_random_uuid(), -- expected to equal auth.uid() in Supabase
  email        text not null unique,
  full_name    text,
  role_id      uuid references roles(id) on delete restrict,
  is_active    boolean not null default true,
  mfa_enabled  boolean not null default false,             -- phishing-resistant MFA required for internal roles
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_users_role on users (role_id);

-- Resolve the FKs 0001 deferred to "added later".
alter table carriers   add constraint carriers_primary_reviewer_fk
  foreign key (primary_reviewer_id) references users(id) on delete set null;
alter table audit_logs add constraint audit_logs_actor_fk
  foreign key (actor_id) references users(id) on delete set null;

create trigger trg_touch_roles before update on roles for each row execute function touch_updated_at();
create trigger trg_touch_users before update on users for each row execute function touch_updated_at();

-- ======================================================================
-- 4. Documents (polymorphic store — created before insurance/certificates)
-- ======================================================================
create table documents (
  id            uuid primary key default gen_random_uuid(),
  entity_type   document_entity_type not null,
  entity_id     uuid not null,                              -- polymorphic; no FK by design
  doc_type      doc_type not null,
  file_path     text not null,                              -- private bucket path
  version       int not null default 1,
  parsed_fields jsonb,                                      -- confidence-gated OCR output; never auto-approves
  uploaded_by   uuid references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_documents_entity on documents (entity_type, entity_id);
create trigger trg_touch_documents before update on documents for each row execute function touch_updated_at();

-- ======================================================================
-- 5. Carrier core: drivers, trucks, trailers, chassis
-- ======================================================================
create table drivers (
  id                    uuid primary key default gen_random_uuid(),
  carrier_id            uuid not null references carriers(id) on delete cascade,
  full_name             text not null,
  cdl_number            text,
  cdl_state             text,
  employment_start      date,
  tenure_ok_high_value  boolean not null default false,     -- computed vs tier rule (>= 6mo)
  qualification_status  qualification_status not null default 'pending',
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_drivers_carrier on drivers (carrier_id);

create table trucks (
  id          uuid primary key default gen_random_uuid(),
  carrier_id  uuid not null references carriers(id) on delete cascade,
  vin         text,
  plate       text,
  unit_number text,
  status      equipment_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_trucks_carrier on trucks (carrier_id);

create table trailers (
  id           uuid primary key default gen_random_uuid(),
  carrier_id   uuid not null references carriers(id) on delete cascade,
  trailer_type text,
  plate        text,
  status       equipment_status not null default 'active',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_trailers_carrier on trailers (carrier_id);

create table chassis (
  id          uuid primary key default gen_random_uuid(),
  carrier_id  uuid references carriers(id) on delete cascade,   -- nullable for pool chassis (drayage)
  chassis_id  text,
  provider    text,
  status      equipment_status not null default 'active',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_chassis_carrier on chassis (carrier_id);

create trigger trg_touch_drivers  before update on drivers  for each row execute function touch_updated_at();
create trigger trg_touch_trucks   before update on trucks   for each row execute function touch_updated_at();
create trigger trg_touch_trailers before update on trailers for each row execute function touch_updated_at();
create trigger trg_touch_chassis  before update on chassis  for each row execute function touch_updated_at();

-- ======================================================================
-- 6. Insurance & certificates
--    Insurance is a FILING in FMCSA (with lag) and a CERTIFICATE only in
--    RMIS/COI — reconcile daily and flag conflicts (source column carries this).
-- ======================================================================
create table insurance_policies (
  id               uuid primary key default gen_random_uuid(),
  carrier_id       uuid not null references carriers(id) on delete cascade,
  policy_type      policy_type not null,
  insurer_name     text,
  coverage_limit   numeric,                                  -- validated vs minimums ($1M/$100K/$30K/WC)
  effective_date   date,
  expiration_date  date,
  cancellation_date date,
  meets_minimum    boolean not null default false,
  source           policy_source not null default 'coi',
  coi_document_id  uuid references documents(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_insurance_carrier on insurance_policies (carrier_id, policy_type);

create table certificates (
  id               uuid primary key default gen_random_uuid(),
  carrier_id       uuid not null references carriers(id) on delete cascade,
  certificate_type certificate_type not null,
  document_id      uuid references documents(id) on delete set null,
  issued_date      date,
  expiration_date  date,
  status           certificate_status not null default 'valid',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_certificates_carrier on certificates (carrier_id);

create trigger trg_touch_insurance    before update on insurance_policies for each row execute function touch_updated_at();
create trigger trg_touch_certificates before update on certificates       for each row execute function touch_updated_at();

-- ======================================================================
-- 7. Customers & transactions (loads before claims/incidents/checks)
-- ======================================================================
create table customers (
  id         uuid primary key default gen_random_uuid(),
  legal_name text not null,
  dba_name   text,
  tms_ref    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table loads (
  id         uuid primary key default gen_random_uuid(),
  load_id    text not null,                                  -- TMS reference
  carrier_id uuid references carriers(id) on delete set null,
  commodity  text,
  value_tier value_tier not null default 'standard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_loads_carrier on loads (carrier_id);

create trigger trg_touch_customers before update on customers for each row execute function touch_updated_at();
create trigger trg_touch_loads     before update on loads     for each row execute function touch_updated_at();

-- ======================================================================
-- 8. Claims & work
-- ======================================================================
create table claims (
  id            uuid primary key default gen_random_uuid(),
  carrier_id    uuid not null references carriers(id) on delete cascade,
  load_id       uuid references loads(id) on delete set null,
  customer_id   uuid references customers(id) on delete set null,
  claim_type    claim_type not null,
  severity      severity_level not null default 'low',
  amount        numeric,
  status        claim_status not null default 'open',
  at_fault      at_fault not null default 'undetermined',
  opened_date   date,
  resolved_date date,
  sla_due       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index idx_claims_carrier  on claims (carrier_id);
create index idx_claims_customer on claims (customer_id);

create table incidents (
  id                     uuid primary key default gen_random_uuid(),
  carrier_id             uuid not null references carriers(id) on delete cascade,
  load_id                uuid references loads(id) on delete set null,
  incident_type          incident_type not null,
  severity               severity_level not null default 'low',
  ir_playbook_triggered  boolean not null default false,
  reported_date          date,
  status                 incident_status not null default 'open',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index idx_incidents_carrier on incidents (carrier_id);

create table compliance_tasks (
  id           uuid primary key default gen_random_uuid(),
  task_type    task_type not null,
  carrier_id   uuid references carriers(id) on delete cascade,
  claim_id     uuid references claims(id) on delete cascade,
  assignee_id  uuid references users(id) on delete set null,
  due_date     date,
  status       task_status not null default 'todo',
  sla_breached boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_tasks_assignee on compliance_tasks (assignee_id, status);
create index idx_tasks_carrier  on compliance_tasks (carrier_id);

create trigger trg_touch_claims    before update on claims           for each row execute function touch_updated_at();
create trigger trg_touch_incidents before update on incidents        for each row execute function touch_updated_at();
create trigger trg_touch_tasks     before update on compliance_tasks for each row execute function touch_updated_at();

-- ======================================================================
-- 9. FMCSA snapshots (point-in-time; the per-load Montgomery evidence anchor)
--    Indexed by (carrier_id, snapshot_date); 24-month retention; payload_hash
--    for integrity. Kept as a single table (not range-partitioned) so that
--    load_risk_checks.carrier_snapshot_id can carry a real FK to a unique id;
--    production may convert to monthly RANGE partitions (retire the FK to id
--    or promote (id, snapshot_date) if so). Retention is enforced by the
--    datahub worker / a scheduled purge, not a hard constraint.
-- ======================================================================
create table fmcsa_snapshots (
  id                uuid primary key default gen_random_uuid(),
  carrier_id        uuid not null references carriers(id) on delete cascade,
  snapshot_date     date not null,
  authority_status  authority_status,
  safety_rating     safety_rating,
  insurance_on_file jsonb,
  oos_rate          numeric,
  basic_scores      jsonb,                                   -- monthly SMS/BASIC
  raw_payload       jsonb,                                   -- normalized via the adapter
  payload_hash      text,                                    -- integrity / audit
  source            snapshot_source not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (carrier_id, snapshot_date)
);
create index idx_snapshots_carrier_date on fmcsa_snapshots (carrier_id, snapshot_date desc);
create trigger trg_touch_snapshots before update on fmcsa_snapshots for each row execute function touch_updated_at();

-- ======================================================================
-- 10. Load-level checks (snapshot-on-every-load)
-- ======================================================================
create table load_risk_checks (
  id                   uuid primary key default gen_random_uuid(),
  load_id              text not null,                        -- TMS reference
  carrier_id           uuid not null references carriers(id) on delete restrict,
  checked_by           uuid references users(id) on delete set null,
  carrier_snapshot_id  uuid references fmcsa_snapshots(id) on delete set null, -- snapshot at assignment
  commodity_value_tier value_tier not null default 'standard',
  driver_verified      boolean not null default false,
  tracking_required    boolean not null default false,
  result               load_check_result,
  block_reason         text,
  checked_at           timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index idx_load_checks_carrier on load_risk_checks (carrier_id, checked_at desc);
create trigger trg_touch_load_checks before update on load_risk_checks for each row execute function touch_updated_at();

-- ======================================================================
-- 11. Risk & monitoring extras: related_entities, dnu_list, remediation_dossiers
-- ======================================================================
create table related_entities (
  id                 uuid primary key default gen_random_uuid(),
  carrier_id         uuid not null references carriers(id) on delete cascade,
  related_carrier_id uuid not null references carriers(id) on delete cascade,
  link_type          link_type not null,
  to_revoked_or_dnu  boolean not null default false,         -- chameleon signal
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (carrier_id <> related_carrier_id)
);
create index idx_related_carrier on related_entities (carrier_id);

create table dnu_list (
  id                      uuid primary key default gen_random_uuid(),
  carrier_id              uuid not null references carriers(id) on delete restrict,
  reason                  text not null,
  decided_by              uuid references users(id) on delete set null,
  decided_at              timestamptz not null default now(),
  reinstated              boolean not null default false,
  reinstated_by           uuid references users(id) on delete set null,
  reinstatement_rationale text,                              -- dual-control reinstatement
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
create index idx_dnu_carrier on dnu_list (carrier_id);

create table remediation_dossiers (
  id                    uuid primary key default gen_random_uuid(),
  carrier_id            uuid not null references carriers(id) on delete cascade,
  flag_reason           text,
  questions_asked       jsonb,
  documents_obtained    jsonb,
  recurrence_prevention text,
  decision              remediation_decision,                -- advanced_green/restricted/recommend_dnu/escalated
  decided_by            uuid references users(id) on delete set null,
  decided_at            timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index idx_dossiers_carrier on remediation_dossiers (carrier_id);

create trigger trg_touch_related   before update on related_entities     for each row execute function touch_updated_at();
create trigger trg_touch_dnu       before update on dnu_list             for each row execute function touch_updated_at();
create trigger trg_touch_dossiers  before update on remediation_dossiers for each row execute function touch_updated_at();

-- ======================================================================
-- 12. Own-fleet (hybrid) — kept visually + structurally distinct from carrier risk
-- ======================================================================
create table fleet_assets (
  id              uuid primary key default gen_random_uuid(),
  unit_number     text not null,
  vin             text,
  type            text,
  last_inspection date,
  maintenance_due boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table fleet_safety_events (
  id          uuid primary key default gen_random_uuid(),
  asset_id    uuid not null references fleet_assets(id) on delete cascade,
  driver_name text,
  event_type  fleet_event_type not null,
  score       numeric,
  hos_status  text,
  source      fleet_source not null default 'samsara',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index idx_fleet_events_asset on fleet_safety_events (asset_id);

create trigger trg_touch_fleet_assets before update on fleet_assets        for each row execute function touch_updated_at();
create trigger trg_touch_fleet_events before update on fleet_safety_events for each row execute function touch_updated_at();

-- ======================================================================
-- 13. Platform: integrations, notifications
-- ======================================================================
create table integrations (
  id           uuid primary key default gen_random_uuid(),
  name         integration_name not null unique,
  auth_type    integration_auth_type not null,
  status       integration_status not null default 'healthy',
  last_sync_at timestamptz,
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table notifications (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references users(id) on delete cascade,
  type             notification_type not null,
  channel          notification_channel not null default 'in_app',
  entity_type      text,
  entity_id        uuid,
  severity         notification_severity not null default 'info',
  read             boolean not null default false,
  escalation_level int not null default 0,                   -- 0 initial / 1 manager / 2 VP
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index idx_notifications_user on notifications (user_id, read);

create trigger trg_touch_integrations  before update on integrations  for each row execute function touch_updated_at();
create trigger trg_touch_notifications before update on notifications for each row execute function touch_updated_at();

-- ======================================================================
-- 14. Extend the append-only audit trigger to the new state-change tables
--     (0001 already covers carriers + risk_scores). audit_logs stays
--     append-only via the update/delete revoke in 0001.
-- ======================================================================
create trigger trg_audit_insurance   after insert or update on insurance_policies   for each row execute function write_audit_log();
create trigger trg_audit_claims       after insert or update on claims               for each row execute function write_audit_log();
create trigger trg_audit_incidents    after insert or update on incidents            for each row execute function write_audit_log();
create trigger trg_audit_load_checks  after insert or update on load_risk_checks     for each row execute function write_audit_log();
create trigger trg_audit_dnu          after insert or update on dnu_list             for each row execute function write_audit_log();
create trigger trg_audit_dossiers     after insert or update on remediation_dossiers for each row execute function write_audit_log();

-- ======================================================================
-- 15. Enable RLS on every new table. Per-role policies are added in 0003_rls.sql.
--     (RLS-on with no policy = deny for app roles until 0003; superuser bypasses.)
-- ======================================================================
alter table roles                enable row level security;
alter table users                enable row level security;
alter table documents            enable row level security;
alter table drivers              enable row level security;
alter table trucks               enable row level security;
alter table trailers             enable row level security;
alter table chassis              enable row level security;
alter table insurance_policies   enable row level security;
alter table certificates         enable row level security;
alter table customers            enable row level security;
alter table loads                enable row level security;
alter table claims               enable row level security;
alter table incidents            enable row level security;
alter table compliance_tasks     enable row level security;
alter table fmcsa_snapshots      enable row level security;
alter table load_risk_checks     enable row level security;
alter table related_entities     enable row level security;
alter table dnu_list             enable row level security;
alter table remediation_dossiers enable row level security;
alter table fleet_assets         enable row level security;
alter table fleet_safety_events  enable row level security;
alter table integrations         enable row level security;
alter table notifications        enable row level security;
