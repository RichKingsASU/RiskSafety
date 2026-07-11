// supabase/seed/dataset.mjs
// DETERMINISTIC seed dataset — INPUTS ONLY. Contains NO scoring math.
//
// Emits the raw sub-scores, confidence, and gate inputs for the canonical 1,136
// carrier population (4 named example carriers + 1,132 generated). Scores are
// computed exclusively by the canonical engine in packages/scoring at build time
// (see build.mjs) — never here, never re-expressed in SQL.
//
// Determinism: a fixed-seed PRNG (mulberry32) + stable index ordering, so the same
// inputs always yield the same outputs. No random()/Date-dependent values.

/** mulberry32 — tiny deterministic PRNG. Fixed seed => reproducible dataset. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic date N days after 2015-01-01 as YYYY-MM-DD (no live clock). */
const BASE_EPOCH_DAYS = Math.floor(Date.parse('2015-01-01T00:00:00Z') / 86400000);
function dateFromOffset(days) {
  const d = new Date((BASE_EPOCH_DAYS + days) * 86400000);
  return d.toISOString().slice(0, 10);
}

const cleanGates = () => ({
  authority_status: 'active',
  safety_rating: 'satisfactory',
  insurance_lapsed_or_below_min: false,
  on_dnu: false,
  confirmed_fraud: false,
  has_open_material_flag: false,
  is_thin_file: false,
});

// ---------------------------------------------------------------------------
// Four named example carriers (used across the mockups). Their rich carrier rows
// live literally in seed.sql; here we hold only the scoring inputs + gates so the
// engine can emit their risk_scores and the anti-drift test can prove parity.
//   C1 = 86 excellent/green (the "86 is GOOD, not dangerous" proof).
//   C2 = decent score, authority revoked -> RED (hard gate).
//   C3 = thin-file drayage -> near neutral, review (yellow), not auto-failed.
//   C4 = genuinely poor -> orange.
// ---------------------------------------------------------------------------
const NAMED = [
  {
    fixture_key: 'C1',
    id: 'c1000000-0000-0000-0000-000000000001',
    inputs: { fleet_size_score: 80, vehicle_oos_score: 88, driver_oos_score: 90, accident_rate_score: 85, confidence_modifier: 1.0 },
    gates: cleanGates(),
    carrierassure_grade: 'A',
    divergence_flag: false,
  },
  {
    fixture_key: 'C2',
    id: 'c1000000-0000-0000-0000-000000000002',
    inputs: { fleet_size_score: 70, vehicle_oos_score: 80, driver_oos_score: 78, accident_rate_score: 80, confidence_modifier: 1.0 },
    gates: { ...cleanGates(), authority_status: 'revoked' },
    carrierassure_grade: 'B',
    divergence_flag: false,
  },
  {
    fixture_key: 'C3',
    id: 'c1000000-0000-0000-0000-000000000003',
    // Thin file: 1 power unit, low confidence. safety_rating 'unrated' is NOT a hard
    // gate, so dispatch tracks the (confidence-blended) score -> review, not red.
    inputs: { fleet_size_score: 45, vehicle_oos_score: 50, driver_oos_score: 52, accident_rate_score: 55, confidence_modifier: 0.2 },
    gates: { ...cleanGates(), safety_rating: 'unrated', is_thin_file: true },
    carrierassure_grade: 'C',
    divergence_flag: false,
  },
  {
    fixture_key: 'C4',
    id: 'c1000000-0000-0000-0000-000000000004',
    inputs: { fleet_size_score: 20, vehicle_oos_score: 30, driver_oos_score: 25, accident_rate_score: 32, confidence_modifier: 1.0 },
    gates: cleanGates(),
    carrierassure_grade: 'D',
    divergence_flag: true,
  },
];

/**
 * Full deterministic input set: the 4 named carriers, then 1,132 generated
 * drayage carriers up to the canonical population of 1,136. INPUTS ONLY.
 */
export function buildDataset() {
  const records = [];

  for (const n of NAMED) {
    records.push({
      is_named: true,
      fixture_key: n.fixture_key,
      id: n.id,
      inputs: { ...n.inputs },
      gates: { ...n.gates },
      carrierassure_grade: n.carrierassure_grade,
      divergence_flag: n.divergence_flag,
    });
  }

  for (let i = 1; i <= 1132; i++) {
    const rng = mulberry32(0x51ED0000 + i); // fixed base seed, per-row stream
    const gateRevoked = i % 97 === 0;
    const gateConditional = i % 89 === 0;
    const thinFile = i % 71 === 0;

    const gates = cleanGates();
    if (gateRevoked) gates.authority_status = 'revoked';
    if (gateConditional) gates.safety_rating = 'conditional';
    else if (thinFile) gates.safety_rating = 'unrated';
    gates.is_thin_file = thinFile;

    const inputs = {
      fleet_size_score: 40 + Math.floor(rng() * 61), // 40..100
      vehicle_oos_score: 45 + Math.floor(rng() * 56), // 45..100
      driver_oos_score: 45 + Math.floor(rng() * 56), // 45..100
      accident_rate_score: 30 + Math.floor(rng() * 71), // 30..100
      confidence_modifier: thinFile ? 0.3 : 1.0,
    };

    records.push({
      is_named: false,
      fixture_key: null,
      id: `c2000000-0000-0000-0000-${i.toString(16).padStart(12, '0')}`,
      dot_number: String(2000000 + i).padStart(7, '0'),
      mc_number: `MC${String(2000000 + i).padStart(7, '0')}`,
      legal_name: `Carrier ${i} LLC`,
      authority_grant_date: dateFromOffset((i * 7) % 3650),
      power_unit_count: thinFile ? 1 : 3 + (i % 60),
      physical_address: `Unit ${i}, Drayage Row, US`,
      ab5_status: 'na',
      identity_verified: i % 3 !== 0,
      carrierassure_grade: null,
      divergence_flag: i % 53 === 0,
      inputs,
      gates,
    });
  }

  return records;
}

export const NAMED_COUNT = NAMED.length;
export const CARRIER_POPULATION = 1136;
