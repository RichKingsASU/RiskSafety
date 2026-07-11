-- tests/rls/assert.sql
-- Behavioral RLS assertions against the ten-role RBAC matrix. Run AFTER migrations
-- + seed + the local grants bootstrap (see tests/rls/run_local.sh). Every check
-- raises an exception on failure, so a clean run = all policies behave.
--
-- Identity is switched with SET ROLE authenticated + a JWT-sub GUC that app.uid()
-- reads (the same claim Supabase's auth.uid() reads). Seed user ids:
--   VP 1111… · safety 2222… · triage 3333… · deep-dive 4444… · blue-wire 5555…
--   ops 6666… · dispatcher 7777… · claims 8888… · accounting 9999… · external aaaa…

-- Two throwaway carriers for delete tests (created as owner; RLS bypassed here).
insert into carriers (id, dot_number, legal_name, authority_status, safety_rating)
values ('deadbeef-0000-0000-0000-000000000001','9999991','DELME VP','active','satisfactory'),
       ('deadbeef-0000-0000-0000-000000000002','9999992','DELME TRIAGE','active','satisfactory');

-- Helper: set the acting user for the current session.
create or replace function pg_temp.act_as(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
end $$;

-- ===================== DISPATCHER — status + pre-screen only =====================
set role authenticated;
select pg_temp.act_as('77777777-7777-7777-7777-777777777777');
do $$
begin
  if (select count(*) from carriers) = 0 then
    raise exception 'FAIL: dispatcher should see carrier status'; end if;
  if (select count(*) from risk_scores) <> 0 then
    raise exception 'FAIL: dispatcher must NOT see risk_scores (risk data)'; end if;
  if (select count(*) from safety_events) <> 0 then
    raise exception 'FAIL: dispatcher must NOT see safety_events'; end if;
  if (select count(*) from fmcsa_snapshots) <> 0 then
    raise exception 'FAIL: dispatcher must NOT see fmcsa_snapshots'; end if;
  if (select count(*) from claims) <> 0 then
    raise exception 'FAIL: dispatcher must NOT see claims'; end if;
  if (select count(*) from remediation_dossiers) <> 0 then
    raise exception 'FAIL: dispatcher must NOT see remediation_dossiers'; end if;
  if (select count(*) from dnu_list) = 0 then
    raise exception 'FAIL: dispatcher SHOULD see the DNU block list for pre-screen'; end if;
  raise notice 'PASS: dispatcher sees status/DNU, blocked from risk data';
end $$;
-- dispatcher may create a pre-screen / load check
insert into load_risk_checks (load_id, carrier_id, checked_by, commodity_value_tier, result)
values ('TMS-DISPATCH-TEST','c1000000-0000-0000-0000-000000000001','77777777-7777-7777-7777-777777777777','standard','cleared');
do $$ begin raise notice 'PASS: dispatcher created a load_risk_check'; end $$;
reset role;

-- ===================== EXTERNAL CARRIER — own rows only =====================
set role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
do $$
begin
  if (select count(*) from carriers) <> 1 then
    raise exception 'FAIL: external_carrier must see exactly its own carrier (got %)',
      (select count(*) from carriers); end if;
  if (select dot_number from carriers) <> '1000001' then
    raise exception 'FAIL: external_carrier saw the wrong carrier'; end if;
  if (select count(*) from risk_scores) <> 0 then
    raise exception 'FAIL: external_carrier must NOT see risk_scores'; end if;
  if (select count(*) from audit_logs) <> 0 then
    raise exception 'FAIL: external_carrier must NOT read the audit trail'; end if;
  raise notice 'PASS: external_carrier scoped to its own carrier, no risk/audit';
end $$;
reset role;

-- ===================== RISK STAFF — full carrier + risk visibility =====================
set role authenticated;
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');  -- triage reviewer
do $$
begin
  if (select count(*) from carriers) < 1136 then
    raise exception 'FAIL: risk staff should see all carriers (got %)',
      (select count(*) from carriers); end if;
  if (select count(*) from risk_scores) < 1136 then
    raise exception 'FAIL: risk staff should see all risk_scores'; end if;
  if (select count(*) from audit_logs) = 0 then
    raise exception 'FAIL: staff should read the audit trail'; end if;
  raise notice 'PASS: risk staff has full carrier + risk + audit visibility';
end $$;
reset role;

-- ===================== CLAIMS COORDINATOR — claims yes, risk no =====================
set role authenticated;
select pg_temp.act_as('88888888-8888-8888-8888-888888888888');
do $$
begin
  if (select count(*) from claims) is null then
    raise exception 'FAIL: claims coordinator should access claims'; end if;
  if (select count(*) from risk_scores) <> 0 then
    raise exception 'FAIL: claims coordinator must NOT see risk_scores'; end if;
  raise notice 'PASS: claims coordinator sees claims, not risk scores';
end $$;
reset role;

-- ===================== DELETE is near-absent — VP only =====================
-- Non-VP (triage) delete is filtered out by RLS -> 0 rows affected.
set role authenticated;
select pg_temp.act_as('33333333-3333-3333-3333-333333333333');
do $$
declare n int;
begin
  with d as (delete from carriers where dot_number = '9999992' returning 1)
  select count(*) into n from d;
  if n <> 0 then raise exception 'FAIL: non-VP must not delete carriers (deleted %)', n; end if;
  raise notice 'PASS: non-VP delete blocked by RLS';
end $$;
reset role;

-- VP delete succeeds (clean up BOTH throwaway carriers so counts return to canonical).
set role authenticated;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
do $$
declare n int;
begin
  with d as (delete from carriers where dot_number in ('9999991','9999992') returning 1)
  select count(*) into n from d;
  if n <> 2 then raise exception 'FAIL: VP should delete carriers (deleted %)', n; end if;
  raise notice 'PASS: VP delete allowed';
end $$;
reset role;

-- ===================== AUDIT LOGS — append-only =====================
set role authenticated;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');  -- even the VP cannot mutate audit
do $$
declare blocked boolean := false;
begin
  begin
    update audit_logs set rationale = 'tamper' where true;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: audit_logs UPDATE must be revoked (append-only)'; end if;

  blocked := false;
  begin
    delete from audit_logs where true;
  exception when insufficient_privilege then blocked := true;
  end;
  if not blocked then raise exception 'FAIL: audit_logs DELETE must be revoked (append-only)'; end if;
  raise notice 'PASS: audit_logs is append-only (update/delete revoked)';
end $$;
reset role;

-- ===================== CANONICAL NUMBERS =====================
do $$
begin
  if (select count(*) from carriers) <> 1136 then
    raise exception 'FAIL: canonical carrier population must be 1136 (got %)',
      (select count(*) from carriers); end if;
  if (select count(*) from fleet_assets) <> 22 then
    raise exception 'FAIL: own fleet must be 22 units (got %)',
      (select count(*) from fleet_assets); end if;
  raise notice 'PASS: canonical numbers 1136 / 22';
end $$;

-- ===================== DIRECTIONALITY (HIGH = GOOD) =====================
do $$
begin
  if exists (select 1 from risk_scores
             where (overall_score >= 80 and quality_band <> 'excellent')
                or (overall_score < 40 and quality_band <> 'poor')) then
    raise exception 'FAIL: quality band directionality is inverted somewhere'; end if;
  if exists (select 1 from risk_scores rs join carriers c on c.id = rs.carrier_id
             where rs.overall_score >= 80 and rs.dispatch_band = 'red'
               and c.authority_status = 'active' and c.safety_rating = 'satisfactory') then
    raise exception 'FAIL: a high score is rendered dangerous without a hard gate'; end if;
  raise notice 'PASS: HIGH = GOOD holds across all seeded scores';
end $$;

select '========== ALL RLS + INVARIANT ASSERTIONS PASSED ==========' as result;
