// tests/unit/directionality.golden.test.ts
// STANDALONE DIRECTIONALITY GOLDEN (CLAUDE.md rules #1–#2).
//
// This is an ANCHOR test, not a parity test. It feeds hand-authored inputs
// straight into the canonical engine (packages/scoring) and asserts the
// resulting composite / quality band / dispatch band against expected values
// that were computed BY HAND (arithmetic shown inline) and independently
// verified. It reads NOTHING from the seed (no dataset.generated.json, no
// *.generated.sql) and does NOT depend on the RLS run harness.
//
// Why this exists in addition to the seed anti-drift test:
//   The anti-drift test (tests/unit/seed-scoring.test.ts) proves seed == engine.
//   It CANNOT catch a wrong-but-consistent engine: if the engine started scoring
//   a great carrier as "poor" and the seed were regenerated from that same broken
//   engine, seed and engine would still agree and anti-drift would stay green.
//   This golden test pins the expected NUMBERS, so it fails the moment the engine
//   inverts or mis-bands the composite — even if every seeded literal agrees.
//
// HIGH = GOOD. A high composite is an EXCELLENT carrier (green). It must never be
// rendered as dangerous. C1 = 86 is the canonical "86 is GOOD, not dangerous" proof.

import { describe, it, expect } from 'vitest';
import { computeScore } from '@forrest/scoring';
import type { GateInputs } from '@forrest/scoring';

// A carrier with no hard gates and no open flags — dispatch tracks the score.
const cleanGates: GateInputs = {
  authority_status: 'active',
  safety_rating: 'satisfactory',
  insurance_lapsed_or_below_min: false,
  on_dnu: false,
  confirmed_fraud: false,
  has_open_material_flag: false,
  is_thin_file: false,
};

// weights: 0.15·fleet + 0.20·vehicle_oos + 0.25·driver_oos + 0.40·accident_rate
// bands:   excellent ≥80 · good 60–79 · fair 40–59 · poor <40
// dispatch (no hard gate): green ≥60 · yellow 40–59 · orange <40 · red = hard gate only
type Golden = {
  name: string;
  inputs: Parameters<typeof computeScore>[0];
  gates: GateInputs;
  expected: { overall_score: number; quality_band: string; dispatch_band: string; hard_gate_triggered: boolean };
};

const GOLDEN: Golden[] = [
  {
    // C1 — the canonical proof. HIGH composite -> EXCELLENT / GREEN.
    // 0.15·80 + 0.20·88 + 0.25·90 + 0.40·85 = 12 + 17.6 + 22.5 + 34 = 86.1 -> round 86
    name: 'C1 high composite -> excellent / green',
    inputs: { fleet_size_score: 80, vehicle_oos_score: 88, driver_oos_score: 90, accident_rate_score: 85, confidence_modifier: 1.0 },
    gates: cleanGates,
    expected: { overall_score: 86, quality_band: 'excellent', dispatch_band: 'green', hard_gate_triggered: false },
  },
  {
    // GOOD band, still dispatch-eligible.
    // 0.15·70 + 0.20·70 + 0.25·70 + 0.40·70 = 70 (weights sum to 1) -> 70
    name: 'mid-high composite -> good / green',
    inputs: { fleet_size_score: 70, vehicle_oos_score: 70, driver_oos_score: 70, accident_rate_score: 70, confidence_modifier: 1.0 },
    gates: cleanGates,
    expected: { overall_score: 70, quality_band: 'good', dispatch_band: 'green', hard_gate_triggered: false },
  },
  {
    // FAIR band -> needs review (yellow), not eligible-by-default, not blocked.
    // 0.15·50 + 0.20·50 + 0.25·50 + 0.40·50 = 50 -> 50
    name: 'middling composite -> fair / yellow',
    inputs: { fleet_size_score: 50, vehicle_oos_score: 50, driver_oos_score: 50, accident_rate_score: 50, confidence_modifier: 1.0 },
    gates: cleanGates,
    expected: { overall_score: 50, quality_band: 'fair', dispatch_band: 'yellow', hard_gate_triggered: false },
  },
  {
    // LOW composite, clean gates -> POOR / ORANGE (restricted by score alone).
    // 0.15·10 + 0.20·10 + 0.25·10 + 0.40·10 = 10 -> 10
    name: 'low composite (clean) -> poor / orange',
    inputs: { fleet_size_score: 10, vehicle_oos_score: 10, driver_oos_score: 10, accident_rate_score: 10, confidence_modifier: 1.0 },
    gates: cleanGates,
    expected: { overall_score: 10, quality_band: 'poor', dispatch_band: 'orange', hard_gate_triggered: false },
  },
  {
    // LOW composite AND a hard gate (authority revoked) -> POOR / RED.
    // Same 10 composite; the revoked-authority hard gate forces dispatch RED.
    name: 'low composite + hard gate -> poor / red',
    inputs: { fleet_size_score: 10, vehicle_oos_score: 10, driver_oos_score: 10, accident_rate_score: 10, confidence_modifier: 1.0 },
    gates: { ...cleanGates, authority_status: 'revoked' },
    expected: { overall_score: 10, quality_band: 'poor', dispatch_band: 'red', hard_gate_triggered: true },
  },
];

describe('directionality golden (hand-verified, seed-independent)', () => {
  for (const g of GOLDEN) {
    it(g.name, () => {
      const r = computeScore(g.inputs, g.gates);
      expect({
        overall_score: r.overall_score,
        quality_band: r.quality_band,
        dispatch_band: r.dispatch_band,
        hard_gate_triggered: r.hard_gate_triggered,
      }).toEqual(g.expected);
    });
  }

  it('HIGH is strictly better than LOW (no inversion): 86 > 10, excellent > poor, green != red', () => {
    const high = computeScore(GOLDEN[0].inputs, GOLDEN[0].gates);
    const low = computeScore(GOLDEN[4].inputs, GOLDEN[4].gates);
    expect(high.overall_score).toBeGreaterThan(low.overall_score);
    expect(high.quality_band).toBe('excellent');
    expect(low.quality_band).toBe('poor');
    // A high score must NEVER be rendered as dangerous.
    expect(high.dispatch_band).toBe('green');
    expect(high.dispatch_band).not.toBe('red');
  });

  it('C1 = 86 is explicitly excellent / green (the "86 is GOOD, not dangerous" anchor)', () => {
    const r = computeScore(GOLDEN[0].inputs, GOLDEN[0].gates);
    expect([r.overall_score, r.quality_band, r.dispatch_band]).toEqual([86, 'excellent', 'green']);
  });
});
