// apps/web/app/mockData.ts
import { computeScore, type ScoreResult, type ScoreInputs, type GateInputs } from '@forrest/scoring';
import { 
  type AuthorityStatus, 
  type SafetyRating, 
  type QualityBand, 
  type DispatchBand 
} from '@forrest/shared/constants';

/** Fixed-seed PRNG (mulberry32) for reproducible mock dataset */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable date generator for mock data */
function dateFromOffset(days: number): string {
  const baseEpochDays = Math.floor(Date.parse('2015-01-01T00:00:00Z') / 86400000);
  const d = new Date((baseEpochDays + days) * 86400000);
  return d.toISOString().slice(0, 10);
}

// Detailed mock interfaces for Batch 2 deep-dives
export interface DriverMock {
  name: string;
  license_number: string;
  status: 'active' | 'oos';
  inspections_count: number;
  oos_events_count: number;
  last_inspection_date: string;
  violations: string[];
}

export interface EquipmentMock {
  unit_number: string;
  vin: string;
  plate_number: string;
  type: 'tractor' | 'trailer';
  status: 'active' | 'oos';
  last_inspection_date: string;
  violations: string[];
}

export interface CoiOcrMock {
  insurer_name: string;
  auto_limit: number;
  cargo_limit: number;
  trailer_interchange_limit: number;
  workers_comp_status: boolean;
  expiration_date: string;
  review_status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  rejection_reason?: string;
}

export interface ClaimMock {
  id: string;
  incident_date: string;
  claim_type: 'cargo_damage' | 'liability_accident' | 'cargo_theft';
  amount: number;
  status: 'open' | 'closed';
  description: string;
}

export interface FmcsaLogMock {
  event_type: 'safety_rating_change' | 'authority_status_change' | 'monitoring_alert';
  old_value: string;
  new_value: string;
  date: string;
  source: string; // "adapter-pending (FMCSA→MOTUS)"
}

export interface DocumentMock {
  name: string;
  type: 'coi' | 'agreement' | 'w9' | 'authority_letter' | 'monitoring_report';
  uploaded_date: string;
  file_size: string;
  status: 'verified' | 'pending' | 'archived';
}

export interface CarrierMockRecord {
  is_named: boolean;
  fixture_key: string | null;
  id: string;
  dot_number: string;
  mc_number: string;
  legal_name: string;
  dba_name: string;
  authority_status: AuthorityStatus;
  authority_grant_date: string;
  safety_rating: SafetyRating;
  power_unit_count: number;
  physical_address: string;
  phone: string;
  ab5_status: 'na' | 'attested' | 'exempt';
  identity_verified: boolean;
  carrierassure_grade: string | null;
  divergence_flag: boolean;
  inputs: ScoreInputs;
  gates: GateInputs;
  scoreResult: ScoreResult;
  insurance: {
    auto_liability: number;
    cargo: number;
    trailer_interchange: number;
    workers_comp: boolean;
  };
  driversRoster: DriverMock[];
  equipmentRoster: EquipmentMock[];
  coiOcr: CoiOcrMock;
  claimsRoster: ClaimMock[];
  fmcsaLogs: FmcsaLogMock[];
  documentsRoster: DocumentMock[];
}

const cleanGates = (): GateInputs => ({
  authority_status: 'active',
  safety_rating: 'satisfactory',
  insurance_lapsed_or_below_min: false,
  on_dnu: false,
  confirmed_fraud: false,
  has_open_material_flag: false,
  is_thin_file: false,
});

/** Build the mock dataset matching the database seed exactly */
export function buildMockCarriers(): CarrierMockRecord[] {
  const records: CarrierMockRecord[] = [];

  // Four Named Carriers
  const namedInputs: Array<{
    fixture_key: string;
    id: string;
    dot_number: string;
    mc_number: string;
    legal_name: string;
    dba_name: string;
    authority_status: AuthorityStatus;
    authority_grant_date: string;
    safety_rating: SafetyRating;
    power_unit_count: number;
    physical_address: string;
    phone: string;
    ab5_status: 'na' | 'attested' | 'exempt';
    identity_verified: boolean;
    carrierassure_grade: string | null;
    divergence_flag: boolean;
    inputs: ScoreInputs;
    gates: GateInputs;
    insurance: {
      auto_liability: number;
      cargo: number;
      trailer_interchange: number;
      workers_comp: boolean;
    };
  }> = [
    {
      fixture_key: 'C1',
      id: 'c1000000-0000-0000-0000-000000000001',
      dot_number: '1000001',
      mc_number: 'MC100001',
      legal_name: 'Blue Ridge Freight LLC',
      dba_name: 'Blue Ridge',
      authority_status: 'active' as AuthorityStatus,
      authority_grant_date: '2019-04-01',
      safety_rating: 'satisfactory' as SafetyRating,
      power_unit_count: 48,
      physical_address: '120 Depot St, Savannah, GA 31401',
      phone: '912-555-0101',
      ab5_status: 'na' as const,
      identity_verified: true,
      carrierassure_grade: 'A',
      divergence_flag: false,
      inputs: { fleet_size_score: 80, vehicle_oos_score: 88, driver_oos_score: 90, accident_rate_score: 85, confidence_modifier: 1.0 },
      gates: cleanGates(),
      insurance: { auto_liability: 1000000, cargo: 100000, trailer_interchange: 30000, workers_comp: true },
    },
    {
      fixture_key: 'C2',
      id: 'c1000000-0000-0000-0000-000000000002',
      dot_number: '1000002',
      mc_number: 'MC100002',
      legal_name: 'Gulfstream Haulers Inc',
      dba_name: 'Gulfstream',
      authority_status: 'revoked' as AuthorityStatus,
      authority_grant_date: '2016-08-15',
      safety_rating: 'conditional' as SafetyRating,
      power_unit_count: 31,
      physical_address: '88 Port Ave, Houston, TX 77002',
      phone: '713-555-0102',
      ab5_status: 'na' as const,
      identity_verified: false,
      carrierassure_grade: 'B',
      divergence_flag: false,
      inputs: { fleet_size_score: 70, vehicle_oos_score: 80, driver_oos_score: 78, accident_rate_score: 80, confidence_modifier: 1.0 },
      gates: { ...cleanGates(), authority_status: 'revoked', on_dnu: true },
      insurance: { auto_liability: 1000000, cargo: 100000, trailer_interchange: 30000, workers_comp: true },
    },
    {
      fixture_key: 'C3',
      id: 'c1000000-0000-0000-0000-000000000003',
      dot_number: '1000003',
      mc_number: 'MC100003',
      legal_name: 'Harbor Point Drayage',
      dba_name: 'Harbor Point',
      authority_status: 'active' as AuthorityStatus,
      authority_grant_date: '2024-11-20',
      safety_rating: 'unrated' as SafetyRating,
      power_unit_count: 1,
      physical_address: '5 Container Way, Long Beach, CA 90802',
      phone: '562-555-0103',
      ab5_status: 'attested' as const,
      identity_verified: true,
      carrierassure_grade: 'C',
      divergence_flag: false,
      inputs: { fleet_size_score: 45, vehicle_oos_score: 50, driver_oos_score: 52, accident_rate_score: 55, confidence_modifier: 0.2 },
      gates: { ...cleanGates(), safety_rating: 'unrated', is_thin_file: true },
      insurance: { auto_liability: 1000000, cargo: 100000, trailer_interchange: 30000, workers_comp: true },
    },
    {
      fixture_key: 'C4',
      id: 'c1000000-0000-0000-0000-000000000004',
      dot_number: '1000004',
      mc_number: 'MC100004',
      legal_name: 'Cutrate Carriers LLC',
      dba_name: 'Cutrate',
      authority_status: 'active' as AuthorityStatus,
      authority_grant_date: '2021-02-10',
      safety_rating: 'satisfactory' as SafetyRating,
      power_unit_count: 12,
      physical_address: '900 Backlot Rd, Newark, NJ 07102',
      phone: '973-555-0104',
      ab5_status: 'na' as const,
      identity_verified: false,
      carrierassure_grade: 'D',
      divergence_flag: true,
      inputs: { fleet_size_score: 20, vehicle_oos_score: 30, driver_oos_score: 25, accident_rate_score: 32, confidence_modifier: 1.0 },
      gates: { ...cleanGates(), insurance_lapsed_or_below_min: true },
      // Under-minimum cargo limit ($50k instead of $100k)
      insurance: { auto_liability: 1000000, cargo: 50000, trailer_interchange: 30000, workers_comp: true },
    },
  ];

  for (const n of namedInputs) {
    const scoreResult = computeScore(n.inputs, n.gates);
    
    // Generate detailed rosters specifically for named carriers
    const driversRoster: DriverMock[] = [];
    const equipmentRoster: EquipmentMock[] = [];
    const claimsRoster: ClaimMock[] = [];
    const fmcsaLogs: FmcsaLogMock[] = [];
    const documentsRoster: DocumentMock[] = [];

    // C1: Excellent, clean history
    if (n.fixture_key === 'C1') {
      driversRoster.push(
        { name: 'John Miller', license_number: 'CDL-GA-98765', status: 'active', inspections_count: 15, oos_events_count: 0, last_inspection_date: '2026-06-12', violations: [] },
        { name: 'David Smith', license_number: 'CDL-SC-12456', status: 'active', inspections_count: 22, oos_events_count: 0, last_inspection_date: '2026-07-02', violations: [] }
      );
      equipmentRoster.push(
        { unit_number: 'TR-101', vin: '1FDX-C1-001', plate_number: 'GA-PL88', type: 'tractor', status: 'active', last_inspection_date: '2026-05-14', violations: [] },
        { unit_number: 'TL-201', vin: '1FDX-C1-002', plate_number: 'GA-TR77', type: 'trailer', status: 'active', last_inspection_date: '2026-06-19', violations: [] }
      );
      fmcsaLogs.push(
        { event_type: 'authority_status_change', old_value: 'pending', new_value: 'active', date: '2019-04-01', source: 'adapter-pending (FMCSA→MOTUS)' },
        { event_type: 'safety_rating_change', old_value: 'unrated', new_value: 'satisfactory', date: '2019-10-15', source: 'adapter-pending (FMCSA→MOTUS)' }
      );
      documentsRoster.push(
        { name: 'coi_insurance_certificate_2026.pdf', type: 'coi', uploaded_date: '2026-01-02', file_size: '240 KB', status: 'verified' },
        { name: 'broker_carrier_agreement.pdf', type: 'agreement', uploaded_date: '2026-01-04', file_size: '1.2 MB', status: 'verified' },
        { name: 'authority_grant_letter.pdf', type: 'authority_letter', uploaded_date: '2019-04-01', file_size: '180 KB', status: 'verified' }
      );
    } 
    // C2: Revoked
    else if (n.fixture_key === 'C2') {
      driversRoster.push(
        { name: 'Carlos Gomez', license_number: 'CDL-TX-54612', status: 'active', inspections_count: 8, oos_events_count: 1, last_inspection_date: '2026-03-24', violations: ['Logbook violation'] }
      );
      equipmentRoster.push(
        { unit_number: 'TR-502', vin: '1FDX-C2-001', plate_number: 'TX-AA09', type: 'tractor', status: 'oos', last_inspection_date: '2026-05-10', violations: ['Brake lines degraded'] }
      );
      fmcsaLogs.push(
        { event_type: 'authority_status_change', old_value: 'active', new_value: 'revoked', date: '2026-07-10', source: 'adapter-pending (FMCSA→MOTUS)' }
      );
      documentsRoster.push(
        { name: 'coi_certificate_expired.pdf', type: 'coi', uploaded_date: '2025-06-15', file_size: '240 KB', status: 'archived' }
      );
    } 
    // C3: Thin File
    else if (n.fixture_key === 'C3') {
      driversRoster.push(
        { name: 'Arthur Pendelton', license_number: 'CDL-CA-33211', status: 'oos', inspections_count: 1, oos_events_count: 1, last_inspection_date: '2026-05-02', violations: ['Driver CDL Expired'] }
      );
      equipmentRoster.push(
        { unit_number: 'TR-909', vin: '1FDX-C3-001', plate_number: 'CA-PU01', type: 'tractor', status: 'active', last_inspection_date: '2026-05-02', violations: [] }
      );
      fmcsaLogs.push(
        { event_type: 'authority_status_change', old_value: 'pending', new_value: 'active', date: '2024-11-20', source: 'adapter-pending (FMCSA→MOTUS)' }
      );
      documentsRoster.push(
        { name: 'thin_file_license_check.pdf', type: 'agreement', uploaded_date: '2026-07-11', file_size: '350 KB', status: 'pending' }
      );
    } 
    // C4: Poor Score, insurance below min
    else if (n.fixture_key === 'C4') {
      driversRoster.push(
        { name: 'Timothy Vance', license_number: 'CDL-NJ-88123', status: 'oos', inspections_count: 4, oos_events_count: 2, last_inspection_date: '2026-04-18', violations: ['OOS: Hours of Service Violation'] },
        { name: 'Mark Gable', license_number: 'CDL-NY-09887', status: 'active', inspections_count: 5, oos_events_count: 1, last_inspection_date: '2026-06-01', violations: ['Speeding'] }
      );
      equipmentRoster.push(
        { unit_number: 'TR-404', vin: '1FDX-C4-001', plate_number: 'NJ-XY99', type: 'tractor', status: 'oos', last_inspection_date: '2026-04-18', violations: ['OOS: Defective Brakes'] },
        { unit_number: 'TR-405', vin: '1FDX-C4-002', plate_number: 'NJ-ZZ88', type: 'tractor', status: 'active', last_inspection_date: '2026-05-12', violations: [] }
      );
      claimsRoster.push(
        { id: 'CLM-9092', incident_date: '2026-04-18', claim_type: 'liability_accident', amount: 45000, status: 'open', description: 'At-fault rear-end collision in NJ. Vehicle towed.' },
        { id: 'CLM-8121', incident_date: '2026-05-04', claim_type: 'cargo_damage', amount: 15000, status: 'closed', description: 'Reefer temp drop. Damaged cargo (frozen foods).' }
      );
      fmcsaLogs.push(
        { event_type: 'monitoring_alert', old_value: 'satisfactory', new_value: 'conditional', date: '2026-04-20', source: 'adapter-pending (FMCSA→MOTUS)' }
      );
      documentsRoster.push(
        { name: 'coi_certificate_50k_cargo.pdf', type: 'coi', uploaded_date: '2026-03-01', file_size: '220 KB', status: 'verified' },
        { name: 'broker_agreement_cutrate.pdf', type: 'agreement', uploaded_date: '2026-03-05', file_size: '1.1 MB', status: 'verified' }
      );
    }

    const coiOcr: CoiOcrMock = {
      insurer_name: n.insurance.auto_liability > 0 ? 'Roadside Mutual' : 'Uninsured',
      auto_limit: n.insurance.auto_liability,
      cargo_limit: n.insurance.cargo,
      trailer_interchange_limit: n.insurance.trailer_interchange,
      workers_comp_status: n.insurance.workers_comp,
      expiration_date: '2026-12-31',
      review_status: n.fixture_key === 'C4' ? 'rejected' : 'approved',
      reviewed_by: n.fixture_key === 'C4' ? 'Sam Ortiz (Safety Mgr)' : 'System pre-fill',
      reviewed_at: '2026-07-11T12:00:00Z',
      rejection_reason: n.fixture_key === 'C4' ? 'Cargo coverage ($50,000) is below the required Forrest minimum of $100,000.' : undefined,
    };

    records.push({
      is_named: true,
      fixture_key: n.fixture_key,
      id: n.id,
      dot_number: n.dot_number,
      mc_number: n.mc_number,
      legal_name: n.legal_name,
      dba_name: n.dba_name,
      authority_status: n.authority_status,
      authority_grant_date: n.authority_grant_date,
      safety_rating: n.safety_rating,
      power_unit_count: n.power_unit_count,
      physical_address: n.physical_address,
      phone: n.phone,
      ab5_status: n.ab5_status,
      identity_verified: n.identity_verified,
      carrierassure_grade: n.carrierassure_grade,
      divergence_flag: n.divergence_flag,
      inputs: n.inputs,
      gates: n.gates,
      scoreResult,
      insurance: n.insurance,
      driversRoster,
      equipmentRoster,
      coiOcr,
      claimsRoster,
      fmcsaLogs,
      documentsRoster,
    });
  }

  // Generate remaining 1,132 carriers
  for (let i = 1; i <= 1132; i++) {
    const rng = mulberry32(0x51ED0000 + i);
    const gateRevoked = i % 97 === 0;
    const gateConditional = i % 89 === 0;
    const thinFile = i % 71 === 0;
    const insuranceLapsed = i % 83 === 0;
    const onDnu = i % 113 === 0;
    const hasFraud = i % 197 === 0;
    const hasFlag = i % 47 === 0;

    const gates = cleanGates();
    if (gateRevoked) gates.authority_status = 'revoked';
    if (gateConditional) gates.safety_rating = 'conditional';
    else if (thinFile) gates.safety_rating = 'unrated';
    
    gates.is_thin_file = thinFile;
    gates.insurance_lapsed_or_below_min = insuranceLapsed;
    gates.on_dnu = onDnu || gateRevoked;
    gates.confirmed_fraud = hasFraud;
    gates.has_open_material_flag = hasFlag;

    const inputs = {
      fleet_size_score: 40 + Math.floor(rng() * 61), // 40..100
      vehicle_oos_score: 45 + Math.floor(rng() * 56), // 45..100
      driver_oos_score: 45 + Math.floor(rng() * 56), // 45..100
      accident_rate_score: 30 + Math.floor(rng() * 71), // 30..100
      confidence_modifier: thinFile ? 0.3 : 1.0,
    };

    const scoreResult = computeScore(inputs, gates);

    const isExempt = i % 25 === 0;
    const ab5Val = isExempt ? 'exempt' : (i % 7 === 0 ? 'attested' : 'na');

    const autoInsurance = insuranceLapsed ? 500000 : 1000000;
    const cargoInsurance = insuranceLapsed ? 50000 : 100000;

    // Generate dynamic sub-lists for background carriers
    const driversRoster: DriverMock[] = [
      { 
        name: `Driver A for Carrier ${i}`, 
        license_number: `CDL-XX-${10000 + i}`, 
        status: inputs.driver_oos_score < 50 ? 'oos' : 'active', 
        inspections_count: 5, 
        oos_events_count: inputs.driver_oos_score < 50 ? 2 : 0, 
        last_inspection_date: dateFromOffset((i * 4) % 180), 
        violations: inputs.driver_oos_score < 50 ? ['OOS driver log violation'] : [] 
      }
    ];

    const equipmentRoster: EquipmentMock[] = [
      { 
        unit_number: `EQ-${100 + i}`, 
        vin: `VIN-${100000 + i}`, 
        plate_number: `PL-${1000 + i}`, 
        type: 'tractor', 
        status: inputs.vehicle_oos_score < 50 ? 'oos' : 'active', 
        last_inspection_date: dateFromOffset((i * 9) % 180), 
        violations: inputs.vehicle_oos_score < 50 ? ['OOS brake adjustment required'] : [] 
      }
    ];

    const claimsRoster: ClaimMock[] = [];
    if (i % 15 === 0) {
      claimsRoster.push({
        id: `CLM-${3000 + i}`,
        incident_date: dateFromOffset((i * 22) % 365),
        claim_type: 'cargo_damage',
        amount: 8000,
        status: 'closed',
        description: 'Minor shifting damage during transit.'
      });
    }

    const fmcsaLogs: FmcsaLogMock[] = [
      {
        event_type: 'authority_status_change',
        old_value: 'pending',
        new_value: gateRevoked ? 'revoked' : 'active',
        date: dateFromOffset((i * 5) % 1500),
        source: 'adapter-pending (FMCSA→MOTUS)'
      }
    ];

    const documentsRoster: DocumentMock[] = [
      {
        name: `coi_policy_${i}.pdf`,
        type: 'coi',
        uploaded_date: dateFromOffset((i * 2) % 180),
        file_size: '210 KB',
        status: insuranceLapsed ? 'pending' : 'verified'
      }
    ];

    const coiOcr: CoiOcrMock = {
      insurer_name: 'Lincoln Transport Underwriters',
      auto_limit: autoInsurance,
      cargo_limit: cargoInsurance,
      trailer_interchange_limit: 30000,
      workers_comp_status: i % 150 !== 0,
      expiration_date: '2026-10-31',
      review_status: insuranceLapsed ? 'pending' : 'approved',
    };

    records.push({
      is_named: false,
      fixture_key: null,
      id: `c2000000-0000-0000-0000-${i.toString(16).padStart(12, '0')}`,
      dot_number: String(2000000 + i).padStart(7, '0'),
      mc_number: `MC${String(2000000 + i).padStart(7, '0')}`,
      legal_name: `Carrier ${i} LLC`,
      dba_name: `Carrier ${i}`,
      authority_status: (gateRevoked ? 'revoked' : 'active') as AuthorityStatus,
      authority_grant_date: dateFromOffset((i * 7) % 3650),
      safety_rating: (gateConditional ? 'conditional' : (thinFile ? 'unrated' : 'satisfactory')) as SafetyRating,
      power_unit_count: thinFile ? 1 : 3 + (i % 60),
      physical_address: `Suite ${i}, Drayage Row, Long Beach, CA 90802`,
      phone: `562-555-${String(1000 + i).slice(-4)}`,
      ab5_status: ab5Val as any,
      identity_verified: i % 3 !== 0,
      carrierassure_grade: i % 20 === 0 ? 'F' : (i % 11 === 0 ? 'D' : null),
      divergence_flag: i % 53 === 0,
      inputs,
      gates,
      scoreResult,
      insurance: {
        auto_liability: autoInsurance,
        cargo: cargoInsurance,
        trailer_interchange: 30000,
        workers_comp: i % 150 !== 0,
      },
      driversRoster,
      equipmentRoster,
      coiOcr,
      claimsRoster,
      fmcsaLogs,
      documentsRoster,
    });
  }

  return records;
}

export interface AuditLog {
  id: string;
  carrier_id: string;
  carrier_name: string;
  action_type: 'onboarding_clearance' | 'remediation_dossier' | 'dnu_update' | 'insurance_override' | 'fraud_confirmed' | 'coi_ocr_review';
  performed_by: string;
  performed_at: string;
  details: string;
  reason: string;
}

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'a1',
    carrier_id: 'c1000000-0000-0000-0000-000000000002',
    carrier_name: 'Gulfstream Haulers Inc',
    action_type: 'dnu_update',
    performed_by: 'Vera Palmer (VP)',
    performed_at: '2026-07-11T14:32:00Z',
    details: 'Placed on DNU (Blocked). Dispatch eligibility set to RED.',
    reason: 'Authority revoked in FMCSA; confirmed inactive on DataHub sweep.',
  },
  {
    id: 'a2',
    carrier_id: 'c1000000-0000-0000-0000-000000000003',
    carrier_name: 'Harbor Point Drayage',
    action_type: 'remediation_dossier',
    performed_by: 'Danica (Triage)',
    performed_at: '2026-07-11T18:15:00Z',
    details: 'Dossier created. Checked repair invoice and driver CDL scan. Status set to restricted (Yellow).',
    reason: 'Thin file review: 1 power unit, single OOS event on first inspection.',
  }
];

export interface TMSLoad {
  id: string;
  load_id: string;
  carrier_id: string | null;
  carrier_name: string | null;
  commodity: string;
  value_tier: 'high_value' | 'standard';
  status: 'pending_clearance' | 'cleared' | 'blocked';
  checked_by?: string;
  checked_at?: string;
  notes?: string;
}

export const INITIAL_LOADS: TMSLoad[] = [
  {
    id: 'l1',
    load_id: 'TMS-LOAD-0001',
    carrier_id: 'c1000000-0000-0000-0000-000000000001',
    carrier_name: 'Blue Ridge Freight LLC',
    commodity: 'Consumer electronics',
    value_tier: 'high_value',
    status: 'cleared',
    checked_by: 'Dan (Dispatcher)',
    checked_at: '2026-07-11T21:00:00Z',
    notes: 'Carrier evaluated with excellent score (86). Insurance is current and valid. Cleared load.'
  },
  {
    id: 'l2',
    load_id: 'TMS-LOAD-0002',
    carrier_id: 'c1000000-0000-0000-0000-000000000002',
    carrier_name: 'Gulfstream Haulers Inc',
    commodity: 'Industrial tooling',
    value_tier: 'standard',
    status: 'blocked',
    checked_by: 'Dan (Dispatcher)',
    checked_at: '2026-07-11T21:10:00Z',
    notes: 'Blocked. Carrier is on the DNU list due to revoked operating authority.'
  },
  {
    id: 'l3',
    load_id: 'TMS-LOAD-0003',
    carrier_id: 'c1000000-0000-0000-0000-000000000003',
    carrier_name: 'Harbor Point Drayage',
    commodity: 'Frozen seafood',
    value_tier: 'standard',
    status: 'pending_clearance'
  },
  {
    id: 'l4',
    load_id: 'TMS-LOAD-0004',
    carrier_id: null,
    carrier_name: null,
    commodity: 'Pharma supplies',
    value_tier: 'high_value',
    status: 'pending_clearance'
  }
];

export interface FleetAsset {
  id: string;
  unit_number: string;
  vin: string;
  type: 'day_cab' | 'sleeper';
  last_inspection: string;
  maintenance_due: boolean;
  hos_status: 'compliant' | 'violation';
  safety_score: number;
}

export function buildOwnFleet(): FleetAsset[] {
  const assets: FleetAsset[] = [];
  for (let i = 1; i <= 22; i++) {
    const seedValue = 1000 + i;
    const type = i % 4 === 0 ? 'day_cab' : 'sleeper';
    const maintenance_due = i % 6 === 0;
    const hos_status = i % 5 === 0 ? 'violation' : 'compliant';
    
    // Deterministic hash based safety score
    const safety_score = 65 + ((i * 13) % 31);
    
    assets.push({
      id: `f-${i}`,
      unit_number: `FT-${String(i).padStart(3, '0')}`,
      vin: `1FT${String(700000 + i).padStart(14, '0')}`,
      type,
      last_inspection: dateFromOffset((i * 11) % 180),
      maintenance_due,
      hos_status,
      safety_score,
    });
  }
  return assets;
}
