-- supabase/migrations/0006_governance_config.sql
-- Effective-dated, append-only governance config layer for the two PENDING
-- policy decisions — dispatch R/Y/G thresholds (Q1, Matt) and Blue Wire
-- supplemental weights (Q2, Matt).
--
-- WHY
--   These values were code constants in packages/shared (DISPATCH_BANDS_PROVISIONAL,
--   BLUE_WIRE_WEIGHTS, BLUE_WIRE_ENABLED). Moving them into an effective-dated DB
--   table means Matt's eventual values drop in as DATA (an insert), not a code change
--   — and, critically, the due-diligence record can later show WHICH thresholds were
--   in force at each dispatch decision (Montgomery contemporaneous-record property).
--
--   SHIPS EMPTY. Zero value rows. No default, no seed, no invented number. On empty
--   config the system behaves exactly as today: dispatch bands provisional, Blue Wire
--   disabled. The canonical scoring formula in packages/scoring is NOT affected by
--   this table and is out of scope here.
--
-- APPEND-ONLY (by convention + RLS, no destructive trigger)
--   History is immutable: the active config for a key is the row with the greatest
--   effective_from <= a decision timestamp, so superseding a value is an INSERT of a
--   newer row, never an UPDATE/DELETE of an old one. Enforced here by RLS granting
--   only SELECT to app roles (no UPDATE/DELETE policy) — writes are admin/service_role
--   only, deferred to the post-auth settings UI. No trigger is added.

create table governance_config (
  id              uuid primary key default gen_random_uuid(),
  config_key      text not null check (config_key in ('dispatch_thresholds','blue_wire_weights')),
  -- Value shape per key (documented, NOT seeded):
  --   dispatch_thresholds : {"green_min": int 0-100, "yellow_min": int 0-100}  (green_min > yellow_min)
  --   blue_wire_weights   : {"<signal_name>": number >= 0, ...}                 (from the two Q2 source docs)
  value           jsonb not null check (jsonb_typeof(value) = 'object'),
  enabled         boolean not null default false,
  effective_from  timestamptz not null,
  created_by      text not null,
  created_at      timestamptz not null default now()
);

comment on table governance_config is
  'Append-only, effective-dated governance config. Active row for a key = greatest '
  'effective_from <= decision timestamp. Ships EMPTY — Q1 dispatch thresholds and Q2 '
  'Blue Wire weights arrive as data, never as invented defaults. No UPDATE/DELETE of '
  'history (supersede by inserting a newer effective_from). Core model weights '
  '(packages/scoring) are out of scope.';
comment on column governance_config.value is
  'dispatch_thresholds: {"green_min":int,"yellow_min":int}; '
  'blue_wire_weights: {"<signal>":number,...}. Never seeded — Q1/Q2 unratified.';
comment on column governance_config.enabled is
  'Blue Wire weights apply only when the active row is enabled=true. dispatch_thresholds '
  'presence alone flips bands off provisional.';

-- Greatest-effective_from lookup per key.
create index idx_governance_config_key_eff on governance_config (config_key, effective_from desc);

-- Active config for a key as of a timestamp = greatest effective_from <= p_as_of.
-- Returns NULL when none (empty config, or all rows are future-dated).
create or replace function config_active_as_of(p_key text, p_as_of timestamptz)
returns governance_config
language sql
stable
as $$
  select gc.*
  from governance_config gc
  where gc.config_key = p_key
    and gc.effective_from <= p_as_of
  order by gc.effective_from desc
  limit 1;
$$;

comment on function config_active_as_of(text, timestamptz) is
  'Active governance_config row for a key as of a timestamp (greatest effective_from '
  '<= ts). NULL when unset. Read config AS OF the decision time, not now(), so the '
  'audit record reflects the thresholds actually in force at the decision.';

-- RLS: staff may read; no write policy (append-only by convention — writes are
-- admin/service_role only, deferred to the post-auth settings UI). No trigger.
alter table governance_config enable row level security;

grant select on governance_config to authenticated;

create policy governance_config_select_staff
  on governance_config for select
  to authenticated
  using (app.is_staff());
-- Intentionally NO insert/update/delete policy: RLS default-deny keeps the table
-- append-only for app roles. Admin-only writes land with the settings UI (post-auth).
