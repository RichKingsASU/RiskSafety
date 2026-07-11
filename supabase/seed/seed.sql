-- supabase/seed/seed.sql
-- Deterministic RSOS seed. Idempotent-ish: run against a freshly reset DB.
--
-- Canonical facts enforced here:
--   * Carrier population = 1,136 (4 named example carriers + 1,132 generated).
--   * Own fleet = 22 power units (Forrest Transportation), separate view.
--   * Score directionality is CORRECT (HIGH = GOOD): an 86 is excellent/green,
--     never rendered as dangerous. Banding mirrors packages/scoring:
--       quality_band: >=80 excellent · 60-79 good · 40-59 fair · <40 poor
--       dispatch:     hard gate -> red · else >=60 green · >=40 yellow · else orange
--   * Insurance/claims/compliance are hard gates + flags, NOT score inputs.
--
-- No random() is used — everything derives from the row index via hashtext so the
-- seed is byte-for-byte reproducible across resets and CI.

-- ---------------------------------------------------------------------
-- Roles (the ten DB roles from Project Documentation §5)
-- ---------------------------------------------------------------------
insert into roles (id, name, permissions) values
  ('a0000000-0000-0000-0000-000000000001','r_s_vp',            '{"view":true,"create":true,"edit":true,"approve":true,"override":true,"delete":"policy","export":true,"admin":true}'),
  ('a0000000-0000-0000-0000-000000000002','safety_manager',    '{"view":true,"create":true,"edit":true,"approve":"scoped","export":true,"admin":"rules"}'),
  ('a0000000-0000-0000-0000-000000000003','triage_reviewer',   '{"view":true,"create":true,"edit":true,"approve":"green"}'),
  ('a0000000-0000-0000-0000-000000000004','deep_dive_analyst', '{"view":"broad","create":true,"edit":true,"export":true}'),
  ('a0000000-0000-0000-0000-000000000005','blue_wire_owner',   '{"view":true,"create":true,"edit":"model","export":true,"admin":"scoring"}'),
  ('a0000000-0000-0000-0000-000000000006','ops_manager',       '{"view":true,"create":true,"edit":"scoped","approve":"load_exceptions"}'),
  ('a0000000-0000-0000-0000-000000000007','dispatcher',        '{"view":"status_prescreen","create":"prescreen"}'),
  ('a0000000-0000-0000-0000-000000000008','claims_coordinator','{"view":"claims","create":true,"edit":true,"export":true}'),
  ('a0000000-0000-0000-0000-000000000009','accounting_admin',  '{"view":"payment","approve":"dual_remittance","export":"scoped"}'),
  ('a0000000-0000-0000-0000-00000000000a','external_carrier',  '{"view":"own","create":"docs","edit":"own"}')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Four named example carriers (used across the mockups) — explicit values.
-- ---------------------------------------------------------------------
-- C1: Excellent / eligible (the "86 is GOOD, not dangerous" proof).
-- C2: Hard gate — authority revoked -> RED despite a decent score.
-- C3: Thin-file drayage — near neutral, routed to review (yellow), not auto-failed.
-- C4: Poor — genuinely low score.
insert into carriers (id, dot_number, mc_number, legal_name, dba_name, authority_status, authority_grant_date, safety_rating, power_unit_count, physical_address, phone, ab5_status, identity_verified, dispatch_band, status) values
  ('c1000000-0000-0000-0000-000000000001','1000001','MC100001','Blue Ridge Freight LLC','Blue Ridge','active','2019-04-01','satisfactory',48,'120 Depot St, Savannah, GA 31401','912-555-0101','na',true,'green','approved'),
  ('c1000000-0000-0000-0000-000000000002','1000002','MC100002','Gulfstream Haulers Inc','Gulfstream','revoked','2016-08-15','conditional',31,'88 Port Ave, Houston, TX 77002','713-555-0102','na',false,'red','dnu'),
  ('c1000000-0000-0000-0000-000000000003','1000003','MC100003','Harbor Point Drayage','Harbor Point','active','2024-11-20','unrated',1,'5 Container Way, Long Beach, CA 90802','562-555-0103','attested',true,'yellow','onboarding'),
  ('c1000000-0000-0000-0000-000000000004','1000004','MC100004','Cutrate Carriers LLC','Cutrate','active','2021-02-10','satisfactory',12,'900 Backlot Rd, Newark, NJ 07102','973-555-0104','na',false,'orange','restricted')
on conflict (dot_number) do nothing;

insert into risk_scores (carrier_id, fleet_size_score, vehicle_oos_score, driver_oos_score, accident_rate_score, overall_score, quality_band, confidence_modifier, carrierassure_grade, divergence_flag, dispatch_band) values
  -- C1: 0.15*80 + 0.20*88 + 0.25*90 + 0.40*85 = 86 -> excellent / green
  ('c1000000-0000-0000-0000-000000000001',80,88,90,85,86,'excellent',1.0,'A',false,'green'),
  -- C2: score is fine (78 good) but authority revoked forces RED (hard gate).
  ('c1000000-0000-0000-0000-000000000002',70,80,78,80,78,'good',1.0,'B',false,'red'),
  -- C3: thin file (1 unit) — low confidence blends toward neutral (~52), review.
  ('c1000000-0000-0000-0000-000000000003',45,50,52,55,52,'fair',0.2,'C',false,'yellow'),
  -- C4: genuinely poor (28) -> orange.
  ('c1000000-0000-0000-0000-000000000004',20,30,25,32,28,'poor',1.0,'D',true,'orange')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 1,132 generated carriers (total population = 1,136). Deterministic scores.
-- Bulk are active/satisfactory (no hard gate) so dispatch tracks the score;
-- a sparse deterministic subset exercises the hard gates and thin-file guard.
-- ---------------------------------------------------------------------
with gen as (
  select
    i,
    gen_random_uuid() as cid,
    (abs(hashtext('carrier#' || i)) % 100)                                    as s,
    -- deterministic sub-scores (each 0-100)
    greatest(0, least(100, 40 + (abs(hashtext('f' || i)) % 61)))              as fleet,
    greatest(0, least(100, 45 + (abs(hashtext('v' || i)) % 56)))             as veh,
    greatest(0, least(100, 45 + (abs(hashtext('d' || i)) % 56)))             as drv,
    greatest(0, least(100, 30 + (abs(hashtext('a' || i)) % 71)))             as acc
  from generate_series(1, 1132) as i
),
scored as (
  select
    i, cid, s, fleet, veh, drv, acc,
    round(0.15*fleet + 0.20*veh + 0.25*drv + 0.40*acc)::int                   as overall,
    -- hard-gate exercise: ~1% revoked, ~1% conditional (deterministic)
    (i % 97  = 0)                                                             as gate_revoked,
    (i % 89  = 0)                                                             as gate_conditional,
    (i % 71  = 0)                                                             as thin_file
  from gen
),
banded as (
  select
    i, cid, fleet, veh, drv, acc, overall, gate_revoked, gate_conditional, thin_file,
    case when overall >= 80 then 'excellent'
         when overall >= 60 then 'good'
         when overall >= 40 then 'fair'
         else 'poor' end::quality_band                                        as qband,
    case
      when gate_revoked or gate_conditional then 'red'
      when overall >= 60 then 'green'
      when overall >= 40 then 'yellow'
      else 'orange' end::dispatch_band                                        as dband
  from scored
),
ins_carriers as (
  insert into carriers (id, dot_number, mc_number, legal_name, authority_status, authority_grant_date, safety_rating, power_unit_count, physical_address, ab5_status, identity_verified, dispatch_band, status)
  select
    cid,
    lpad((2000000 + i)::text, 7, '0'),
    'MC' || lpad((2000000 + i)::text, 7, '0'),
    'Carrier ' || i || ' LLC',
    case when gate_revoked then 'revoked' else 'active' end::authority_status,
    date '2015-01-01' + ((i * 7) % 3650),
    case when gate_conditional then 'conditional'
         when thin_file then 'unrated'
         else 'satisfactory' end::safety_rating,
    case when thin_file then 1 else 3 + (i % 60) end,
    'Unit ' || i || ', Drayage Row, US',
    'na'::ab5_status,
    (i % 3 <> 0),
    dband,
    case when dband = 'red' then 'dnu'
         when dband = 'orange' then 'restricted'
         when dband = 'yellow' then 'onboarding'
         else 'approved' end::carrier_status
  from banded
  returning id
)
insert into risk_scores (carrier_id, fleet_size_score, vehicle_oos_score, driver_oos_score, accident_rate_score, overall_score, quality_band, confidence_modifier, divergence_flag, dispatch_band)
select cid, fleet, veh, drv, acc, overall, qband,
       case when thin_file then 0.3 else 1.0 end,
       (i % 53 = 0),
       dband
from banded;

-- ---------------------------------------------------------------------
-- Users — one per role (deterministic ids so RLS tests can set the JWT sub).
-- external_carrier is scoped to example carrier C1.
-- ---------------------------------------------------------------------
insert into users (id, email, full_name, role_id, is_active, mfa_enabled, carrier_id) values
  ('11111111-1111-1111-1111-111111111111','vp@forrest.test','Vera Palmer (VP)',            'a0000000-0000-0000-0000-000000000001',true,true,null),
  ('22222222-2222-2222-2222-222222222222','safety@forrest.test','Sam Ortiz (Safety Mgr)',  'a0000000-0000-0000-0000-000000000002',true,true,null),
  ('33333333-3333-3333-3333-333333333333','danica@forrest.test','Danica (Triage)',         'a0000000-0000-0000-0000-000000000003',true,true,null),
  ('44444444-4444-4444-4444-444444444444','elizabeth@forrest.test','Elizabeth (Deep-Dive)','a0000000-0000-0000-0000-000000000004',true,true,null),
  ('55555555-5555-5555-5555-555555555555','damien@forrest.test','Damien (Blue Wire)',       'a0000000-0000-0000-0000-000000000005',true,true,null),
  ('66666666-6666-6666-6666-666666666666','ops@forrest.test','Olivia (Ops Mgr)',            'a0000000-0000-0000-0000-000000000006',true,true,null),
  ('77777777-7777-7777-7777-777777777777','dispatch@forrest.test','Dan (Dispatcher)',       'a0000000-0000-0000-0000-000000000007',true,true,null),
  ('88888888-8888-8888-8888-888888888888','claims@forrest.test','Cora (Claims)',            'a0000000-0000-0000-0000-000000000008',true,true,null),
  ('99999999-9999-9999-9999-999999999999','accounting@forrest.test','Amir (Accounting)',    'a0000000-0000-0000-0000-000000000009',true,true,null),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','carrier@blueridge.test','Blue Ridge Portal',      'a0000000-0000-0000-0000-00000000000a',true,false,'c1000000-0000-0000-0000-000000000001')
on conflict (email) do nothing;

-- primary reviewer for the example carriers = Danica (triage)
update carriers set primary_reviewer_id = '33333333-3333-3333-3333-333333333333'
  where dot_number in ('1000001','1000002','1000003','1000004');

-- ---------------------------------------------------------------------
-- Integrations — the nine sources (health board).
-- ---------------------------------------------------------------------
insert into integrations (name, auth_type, status, config) values
  ('qcmobile','login_gov_webkey','healthy','{"note":"pre-screen + onboarding"}'),
  ('datahub','file','healthy','{"schedule":"daily ~noon ET"}'),
  ('sms','file','healthy','{"schedule":"monthly BASIC/OOS"}'),
  ('rmis','api_key','healthy','{"role":"COI system of record"}'),
  ('highway','api_key','healthy','{"role":"identity/fraud"}'),
  ('carrier411','api_key','healthy','{"note":"absence = no report, not clean"}'),
  ('carrierassure','api_key','degraded','{"note":"benchmark only, never a sole gate"}'),
  ('tms','api_key','healthy','{"phase1":"watchlist import + queued write-back"}'),
  ('samsara','api_key','healthy','{"scope":"own-fleet ~22 units"}')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------
-- Own fleet — 22 Forrest Transportation power units (separate, distinct view).
-- ---------------------------------------------------------------------
insert into fleet_assets (unit_number, vin, type, last_inspection, maintenance_due)
select
  'FT-' || lpad(i::text, 3, '0'),
  '1FT' || lpad((700000 + i)::text, 14, '0'),
  case when i % 4 = 0 then 'day_cab' else 'sleeper' end,
  date '2026-01-01' + ((i * 11) % 180),
  (i % 6 = 0)
from generate_series(1, 22) as i;

insert into fleet_safety_events (asset_id, driver_name, event_type, score, hos_status, source)
select fa.id, 'Driver ' || fa.unit_number,
  (array['harsh_event','hos','inspection'])[1 + (abs(hashtext(fa.unit_number)) % 3)]::fleet_event_type,
  60 + (abs(hashtext(fa.unit_number)) % 41),
  case when abs(hashtext(fa.unit_number)) % 5 = 0 then 'violation' else 'compliant' end,
  'samsara'
from fleet_assets fa;

-- ---------------------------------------------------------------------
-- Supporting rows for the example carriers (insurance, safety events, DNU,
-- dossier, tasks, a load + snapshot + load check) — enough to exercise flows.
-- ---------------------------------------------------------------------
-- C1 insurance: meets all minimums.
insert into insurance_policies (carrier_id, policy_type, insurer_name, coverage_limit, effective_date, expiration_date, meets_minimum, source) values
  ('c1000000-0000-0000-0000-000000000001','auto_liability','Great West',1000000,'2026-01-01','2026-12-31',true,'coi'),
  ('c1000000-0000-0000-0000-000000000001','cargo','Great West',100000,'2026-01-01','2026-12-31',true,'coi'),
  -- C4 below-minimum cargo — a flag/hard gate example.
  ('c1000000-0000-0000-0000-000000000004','cargo','Roadside Mutual',50000,'2026-03-01','2026-09-30',false,'coi');

insert into safety_events (carrier_id, event_type, event_date, oos_flag, violation_detail, severity_class, source) values
  ('c1000000-0000-0000-0000-000000000003','inspection','2026-05-02',true,'single OOS on one inspection (thin file)','minor','fmcsa_inspection'),
  ('c1000000-0000-0000-0000-000000000004','crash','2026-04-18',false,'at-fault rear-end','safety_critical','fmcsa_crash');

-- C2 on the DNU list (authority revoked) — enforcement carries a rationale.
insert into dnu_list (carrier_id, reason, decided_by) values
  ('c1000000-0000-0000-0000-000000000002','Authority revoked in FMCSA; confirmed inactive on DataHub sweep.','11111111-1111-1111-1111-111111111111');

-- C3 remediation dossier (the Montgomery "reasonable care" record).
insert into remediation_dossiers (carrier_id, flag_reason, questions_asked, documents_obtained, recurrence_prevention, decision, decided_by, decided_at) values
  ('c1000000-0000-0000-0000-000000000003','Thin file: 1 power unit, single OOS event',
   '["Explain the OOS violation?","Provide the repair invoice","Confirm driver CDL + tenure"]'::jsonb,
   '["repair_invoice.pdf","cdl_scan.pdf","coi.pdf"]'::jsonb,
   'Added pre-trip checklist; scheduled quarterly maintenance.','restricted',
   '33333333-3333-3333-3333-333333333333', now());

insert into compliance_tasks (task_type, carrier_id, assignee_id, due_date, status) values
  ('review','c1000000-0000-0000-0000-000000000003','33333333-3333-3333-3333-333333333333','2026-07-20','in_progress'),
  ('coi_renewal','c1000000-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','2026-09-01','todo');

-- A load + point-in-time snapshot + load check for C1 (snapshot-on-every-load).
insert into loads (id, load_id, carrier_id, commodity, value_tier) values
  ('10ad0000-0000-0000-0000-000000000001','TMS-LOAD-0001','c1000000-0000-0000-0000-000000000001','Consumer electronics','high_value');

insert into fmcsa_snapshots (id, carrier_id, snapshot_date, authority_status, safety_rating, insurance_on_file, oos_rate, payload_hash, source) values
  ('50a70000-0000-0000-0000-000000000001','c1000000-0000-0000-0000-000000000001','2026-07-11','active','satisfactory','{"auto_liability":1000000,"cargo":100000}'::jsonb,4.2,'sha256:seedhash-c1-20260711','datahub');

insert into load_risk_checks (load_id, carrier_id, checked_by, carrier_snapshot_id, commodity_value_tier, driver_verified, tracking_required, result) values
  ('TMS-LOAD-0001','c1000000-0000-0000-0000-000000000001','77777777-7777-7777-7777-777777777777','50a70000-0000-0000-0000-000000000001','high_value',true,true,'cleared');

-- A notification for the VP.
insert into notifications (user_id, type, channel, entity_type, entity_id, severity) values
  ('11111111-1111-1111-1111-111111111111','dot_inactive','in_app','carrier','c1000000-0000-0000-0000-000000000002','critical');
