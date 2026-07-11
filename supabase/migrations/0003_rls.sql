-- supabase/migrations/0003_rls.sql
-- Row-Level Security mapping the RBAC matrix (Project Documentation §5) onto the
-- ten DB roles. RBAC is enforced at the DATABASE, not just the app.
--
-- Design:
--   * Role identity comes from public.users (joined to public.roles) keyed by the
--     JWT subject — app.uid() reads the same claim Supabase's auth.uid() does, so
--     this is portable and testable without the Supabase auth schema.
--   * Multiple PERMISSIVE policies OR together. Each table gets specific
--     SELECT/INSERT/UPDATE policies per role group, plus one "admin_all" FOR ALL
--     policy so the VP (r_s_vp) is the ONLY role that can DELETE (delete is
--     near-absent by governance; records are archived/superseded, not deleted).
--   * Hard rules asserted by tests: dispatcher can't see risk data;
--     external_carrier sees only its own rows; audit_logs stays append-only.
--
-- The ten roles (Project Documentation §5):
--   r_s_vp · safety_manager · triage_reviewer · deep_dive_analyst ·
--   blue_wire_owner · ops_manager · dispatcher · claims_coordinator ·
--   accounting_admin · external_carrier

-- External-carrier scoping needs a user→carrier link (not in the base dictionary;
-- used ONLY to scope external_carrier rows to their own carrier).
alter table users add column if not exists carrier_id uuid references carriers(id) on delete set null;

-- ======================================================================
-- Helper functions (SECURITY DEFINER so they can read users/roles under RLS)
-- ======================================================================
create schema if not exists app;

create or replace function app.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub'
  )::uuid;
$$;

create or replace function app.role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.name
  from users u
  join roles r on r.id = u.role_id
  where u.id = app.uid();
$$;

create or replace function app.self_carrier()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select carrier_id from users where id = app.uid();
$$;

-- Any employee (everyone except the external carrier portal user).
create or replace function app.is_staff()
returns boolean language sql stable as $$
  select app.role() in (
    'r_s_vp','safety_manager','triage_reviewer','deep_dive_analyst',
    'blue_wire_owner','ops_manager','dispatcher','claims_coordinator','accounting_admin'
  );
$$;

-- Risk staff who may see carrier risk detail (NOT dispatcher/claims/accounting/external).
create or replace function app.is_risk_staff()
returns boolean language sql stable as $$
  select app.role() in (
    'r_s_vp','safety_manager','triage_reviewer','deep_dive_analyst','blue_wire_owner','ops_manager'
  );
$$;

-- VP: the only delete-capable / full-admin role.
create or replace function app.is_admin()
returns boolean language sql stable as $$
  select app.role() = 'r_s_vp';
$$;

-- Enforcement writers (restrict/decertify/DNU) — confirm-with-reason at the app layer.
create or replace function app.is_enforcer()
returns boolean language sql stable as $$
  select app.role() in ('r_s_vp','safety_manager');
$$;

-- Claims workers.
create or replace function app.is_claims()
returns boolean language sql stable as $$
  select app.role() in ('r_s_vp','safety_manager','deep_dive_analyst','claims_coordinator');
$$;

-- ======================================================================
-- Re-scope the two permissive 0001 policies (they granted every authenticated
-- user, which would leak to external_carrier).
-- ======================================================================
drop policy if exists carriers_read_authenticated on carriers;
drop policy if exists audit_read_authenticated    on audit_logs;

-- ======================================================================
-- carriers
-- ======================================================================
create policy carriers_admin_all on carriers for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy carriers_select on carriers for select to authenticated
  using (app.is_staff() or (app.role() = 'external_carrier' and id = app.self_carrier()));
create policy carriers_insert on carriers for insert to authenticated
  with check (app.is_risk_staff());
create policy carriers_update on carriers for update to authenticated
  using (app.is_risk_staff() or (app.role() = 'external_carrier' and id = app.self_carrier()))
  with check (app.is_risk_staff() or (app.role() = 'external_carrier' and id = app.self_carrier()));

-- ======================================================================
-- risk_scores / safety_events — RISK DATA. Dispatcher is intentionally excluded.
-- ======================================================================
create policy risk_scores_admin_all on risk_scores for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy risk_scores_select on risk_scores for select to authenticated
  using (app.is_risk_staff());
create policy risk_scores_write on risk_scores for insert to authenticated
  with check (app.role() in ('r_s_vp','blue_wire_owner','safety_manager'));
create policy risk_scores_update on risk_scores for update to authenticated
  using (app.role() in ('r_s_vp','blue_wire_owner','safety_manager'))
  with check (app.role() in ('r_s_vp','blue_wire_owner','safety_manager'));

create policy safety_events_admin_all on safety_events for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy safety_events_select on safety_events for select to authenticated
  using (app.is_risk_staff());
create policy safety_events_write on safety_events for insert to authenticated
  with check (app.is_risk_staff());
create policy safety_events_update on safety_events for update to authenticated
  using (app.is_risk_staff()) with check (app.is_risk_staff());

-- ======================================================================
-- Carrier-core equipment: drivers / trucks / trailers / chassis
--   risk staff full; external_carrier scoped to own carrier.
-- ======================================================================
do $$
declare t text;
begin
  foreach t in array array['drivers','trucks','trailers','chassis'] loop
    execute format('create policy %1$s_admin_all on %1$s for all to authenticated using (app.is_admin()) with check (app.is_admin());', t);
    execute format($p$create policy %1$s_select on %1$s for select to authenticated
      using (app.is_risk_staff() or (app.role() = 'external_carrier' and carrier_id = app.self_carrier()));$p$, t);
    execute format($p$create policy %1$s_insert on %1$s for insert to authenticated
      with check (app.is_risk_staff() or (app.role() = 'external_carrier' and carrier_id = app.self_carrier()));$p$, t);
    execute format($p$create policy %1$s_update on %1$s for update to authenticated
      using (app.is_risk_staff() or (app.role() = 'external_carrier' and carrier_id = app.self_carrier()))
      with check (app.is_risk_staff() or (app.role() = 'external_carrier' and carrier_id = app.self_carrier()));$p$, t);
  end loop;
end $$;

-- ======================================================================
-- Insurance & certificates — internal risk/claims/accounting view; risk staff edit.
-- ======================================================================
create policy insurance_admin_all on insurance_policies for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy insurance_select on insurance_policies for select to authenticated
  using (app.is_risk_staff() or app.role() in ('claims_coordinator','accounting_admin')
         or (app.role() = 'external_carrier' and carrier_id = app.self_carrier()));
create policy insurance_insert on insurance_policies for insert to authenticated
  with check (app.is_risk_staff());
create policy insurance_update on insurance_policies for update to authenticated
  using (app.is_risk_staff()) with check (app.is_risk_staff());

create policy certificates_admin_all on certificates for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy certificates_select on certificates for select to authenticated
  using (app.is_risk_staff() or (app.role() = 'external_carrier' and carrier_id = app.self_carrier()));
create policy certificates_insert on certificates for insert to authenticated
  with check (app.is_risk_staff() or (app.role() = 'external_carrier' and carrier_id = app.self_carrier()));
create policy certificates_update on certificates for update to authenticated
  using (app.is_risk_staff()) with check (app.is_risk_staff());

-- ======================================================================
-- documents — polymorphic; external_carrier scoped to its own carrier rows.
-- ======================================================================
create policy documents_admin_all on documents for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy documents_select on documents for select to authenticated
  using (app.is_risk_staff() or app.is_claims()
         or (app.role() = 'external_carrier' and entity_type = 'carrier' and entity_id = app.self_carrier()));
create policy documents_insert on documents for insert to authenticated
  with check (app.is_risk_staff() or app.is_claims()
              or (app.role() = 'external_carrier' and entity_type = 'carrier' and entity_id = app.self_carrier()));
create policy documents_update on documents for update to authenticated
  using (app.is_risk_staff() or app.is_claims()) with check (app.is_risk_staff() or app.is_claims());

-- ======================================================================
-- customers / loads — staff view; risk staff maintain.
-- ======================================================================
create policy customers_admin_all on customers for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy customers_select on customers for select to authenticated using (app.is_staff());
create policy customers_write  on customers for insert to authenticated with check (app.is_risk_staff() or app.is_claims());
create policy customers_update on customers for update to authenticated using (app.is_risk_staff() or app.is_claims()) with check (app.is_risk_staff() or app.is_claims());

create policy loads_admin_all on loads for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy loads_select on loads for select to authenticated using (app.is_staff());
create policy loads_write  on loads for insert to authenticated with check (app.is_risk_staff());
create policy loads_update on loads for update to authenticated using (app.is_risk_staff()) with check (app.is_risk_staff());

-- ======================================================================
-- claims / incidents — claims workers + risk staff (view). Dispatcher excluded.
-- ======================================================================
create policy claims_admin_all on claims for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy claims_select on claims for select to authenticated using (app.is_claims() or app.is_risk_staff());
create policy claims_insert on claims for insert to authenticated with check (app.is_claims());
create policy claims_update on claims for update to authenticated using (app.is_claims()) with check (app.is_claims());

create policy incidents_admin_all on incidents for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy incidents_select on incidents for select to authenticated using (app.is_claims() or app.is_risk_staff());
create policy incidents_insert on incidents for insert to authenticated with check (app.is_claims());
create policy incidents_update on incidents for update to authenticated using (app.is_claims()) with check (app.is_claims());

-- ======================================================================
-- compliance_tasks — assignee sees own; risk staff/safety manage.
-- ======================================================================
create policy tasks_admin_all on compliance_tasks for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy tasks_select on compliance_tasks for select to authenticated
  using (app.is_risk_staff() or assignee_id = app.uid());
create policy tasks_insert on compliance_tasks for insert to authenticated
  with check (app.is_risk_staff());
create policy tasks_update on compliance_tasks for update to authenticated
  using (app.is_risk_staff() or assignee_id = app.uid())
  with check (app.is_risk_staff() or assignee_id = app.uid());

-- ======================================================================
-- fmcsa_snapshots — RISK DATA. Risk staff only.
-- ======================================================================
create policy snapshots_admin_all on fmcsa_snapshots for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy snapshots_select on fmcsa_snapshots for select to authenticated using (app.is_risk_staff());
create policy snapshots_write  on fmcsa_snapshots for insert to authenticated with check (app.is_risk_staff());
create policy snapshots_update on fmcsa_snapshots for update to authenticated using (app.is_risk_staff()) with check (app.is_risk_staff());

-- ======================================================================
-- load_risk_checks — dispatcher may CREATE and read OWN checks (pre-screen);
--   risk staff + ops read all. This is the dispatcher's only risk-adjacent write.
-- ======================================================================
create policy load_checks_admin_all on load_risk_checks for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy load_checks_select on load_risk_checks for select to authenticated
  using (app.is_risk_staff() or checked_by = app.uid());
create policy load_checks_insert on load_risk_checks for insert to authenticated
  with check (app.is_risk_staff() or app.role() = 'dispatcher');
create policy load_checks_update on load_risk_checks for update to authenticated
  using (app.is_risk_staff()) with check (app.is_risk_staff());

-- ======================================================================
-- related_entities / remediation_dossiers — risk staff only (deep-dive / triage).
-- ======================================================================
create policy related_admin_all on related_entities for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy related_select on related_entities for select to authenticated using (app.is_risk_staff());
create policy related_write  on related_entities for insert to authenticated with check (app.is_risk_staff());
create policy related_update on related_entities for update to authenticated using (app.is_risk_staff()) with check (app.is_risk_staff());

create policy dossiers_admin_all on remediation_dossiers for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy dossiers_select on remediation_dossiers for select to authenticated using (app.is_risk_staff());
create policy dossiers_write  on remediation_dossiers for insert to authenticated with check (app.is_risk_staff());
create policy dossiers_update on remediation_dossiers for update to authenticated using (app.is_risk_staff()) with check (app.is_risk_staff());

-- ======================================================================
-- dnu_list — staff may SEE the block list (dispatcher needs it for pre-screen);
--   only enforcers (VP/safety mgr) may add or reinstate (confirm-with-reason).
-- ======================================================================
create policy dnu_admin_all on dnu_list for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy dnu_select on dnu_list for select to authenticated using (app.is_staff());
create policy dnu_insert on dnu_list for insert to authenticated with check (app.is_enforcer());
create policy dnu_update on dnu_list for update to authenticated using (app.is_enforcer()) with check (app.is_enforcer());

-- ======================================================================
-- Own-fleet (hybrid) — risk/ops/safety view + maintain. Distinct from carrier risk.
-- ======================================================================
create policy fleet_assets_admin_all on fleet_assets for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy fleet_assets_select on fleet_assets for select to authenticated using (app.is_risk_staff());
create policy fleet_assets_write  on fleet_assets for insert to authenticated with check (app.is_risk_staff());
create policy fleet_assets_update on fleet_assets for update to authenticated using (app.is_risk_staff()) with check (app.is_risk_staff());

create policy fleet_events_admin_all on fleet_safety_events for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy fleet_events_select on fleet_safety_events for select to authenticated using (app.is_risk_staff());
create policy fleet_events_write  on fleet_safety_events for insert to authenticated with check (app.is_risk_staff());
create policy fleet_events_update on fleet_safety_events for update to authenticated using (app.is_risk_staff()) with check (app.is_risk_staff());

-- ======================================================================
-- integrations — risk staff view; VP/safety manage; VP delete.
-- ======================================================================
create policy integrations_admin_all on integrations for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy integrations_select on integrations for select to authenticated using (app.is_risk_staff());
create policy integrations_write  on integrations for insert to authenticated with check (app.is_enforcer());
create policy integrations_update on integrations for update to authenticated using (app.is_enforcer()) with check (app.is_enforcer());

-- ======================================================================
-- roles / users — admin manages; users may read self; staff read roles.
-- ======================================================================
create policy roles_admin_all on roles for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy roles_select on roles for select to authenticated using (app.is_staff());

create policy users_admin_all on users for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy users_select_self on users for select to authenticated
  using (app.is_admin() or app.role() = 'safety_manager' or id = app.uid());

-- ======================================================================
-- notifications — a user sees and dismisses only their own.
-- ======================================================================
create policy notifications_admin_all on notifications for all to authenticated
  using (app.is_admin()) with check (app.is_admin());
create policy notifications_select on notifications for select to authenticated using (user_id = app.uid());
create policy notifications_insert on notifications for insert to authenticated with check (app.is_staff());
create policy notifications_update on notifications for update to authenticated
  using (user_id = app.uid()) with check (user_id = app.uid());

-- ======================================================================
-- audit_logs — append-only backbone. Staff may READ; nobody may update/delete
-- (revoked in 0001). No insert policy: rows come only from the SECURITY DEFINER
-- trigger. External carriers cannot read the audit trail.
-- ======================================================================
create policy audit_select_staff on audit_logs for select to authenticated using (app.is_staff());
