// packages/scoring/src/index.test.ts
// Guardrail tests. If these fail, the scoring model has regressed.
// (Vitest-style; adapt to Jest with trivial import changes.)

import { describe, it, expect } from 'vitest';
import { computeScore, computeOverallScore, toQualityBand } from './index';

const safeInputs = {
  fleet_size_score: 90,
  vehicle_oos_score: 90,
  driver_oos_score: 90,
  accident_rate_score: 90,
  confidence_modifier: 1,
};

const cleanGates = {
  authority_status: 'active' as const,
  safety_rating: 'satisfactory' as const,
  insurance_lapsed_or_below_min: false,
  on_dnu: false,
  confirmed_fraud: false,
  has_open_material_flag: false,
  is_thin_file: false,
};

describe('HIGH = GOOD (core invariant)', () => {
  it('a high composite is Excellent and dispatch-eligible (green)', () => {
    const r = computeScore(safeInputs, cleanGates);
    expect(r.overall_score).toBeGreaterThanOrEqual(80);
    expect(r.quality_band).toBe('excellent');
    expect(r.dispatch_band).toBe('green'); // high score must NOT read as dangerous
  });

  it('a low composite is Poor, not Excellent', () => {
    const r = computeScore(
      { ...safeInputs, fleet_size_score: 10, vehicle_oos_score: 10, driver_oos_score: 10, accident_rate_score: 10 },
      cleanGates
    );
    expect(r.overall_score).toBeLessThan(40);
    expect(r.quality_band).toBe('poor');
  });
});

describe('quality band boundaries', () => {
  it('classifies 80 / 79 / 60 / 59 / 40 / 39 correctly', () => {
    expect(toQualityBand(80)).toBe('excellent');
    expect(toQualityBand(79)).toBe('good');
    expect(toQualityBand(60)).toBe('good');
    expect(toQualityBand(59)).toBe('fair');
    expect(toQualityBand(40)).toBe('fair');
    expect(toQualityBand(39)).toBe('poor');
  });
});

describe('weights', () => {
  it('accident_rate (0.40) dominates fleet_size (0.15)', () => {
    const goodAccidentBadFleet = computeOverallScore({
      fleet_size_score: 0,
      vehicle_oos_score: 50,
      driver_oos_score: 50,
      accident_rate_score: 100,
      confidence_modifier: 1,
    }).overall;
    const badAccidentGoodFleet = computeOverallScore({
      fleet_size_score: 100,
      vehicle_oos_score: 50,
      driver_oos_score: 50,
      accident_rate_score: 0,
      confidence_modifier: 1,
    }).overall;
    expect(goodAccidentBadFleet).toBeGreaterThan(badAccidentGoodFleet);
  });
});

describe('hard gates force RED regardless of score', () => {
  it('revoked authority -> red even with a perfect score', () => {
    const r = computeScore(safeInputs, { ...cleanGates, authority_status: 'revoked' });
    expect(r.overall_score).toBeGreaterThanOrEqual(80); // score is still high
    expect(r.hard_gate_triggered).toBe(true);
    expect(r.dispatch_band).toBe('red'); // eligibility is still blocked
  });

  it('below-minimum insurance and DNU each force red', () => {
    expect(computeScore(safeInputs, { ...cleanGates, insurance_lapsed_or_below_min: true }).dispatch_band).toBe('red');
    expect(computeScore(safeInputs, { ...cleanGates, on_dnu: true }).dispatch_band).toBe('red');
  });
});

describe('thin-file small-sample handling', () => {
  it('keeps a thin-file carrier near neutral instead of crushing it', () => {
    const thin = computeOverallScore({
      fleet_size_score: 0,
      vehicle_oos_score: 0,
      driver_oos_score: 0,
      accident_rate_score: 0, // one bad inspection would otherwise = 0
      confidence_modifier: 0.1, // very little data
    }).overall;
    expect(thin).toBeGreaterThan(40); // pulled toward 50, not floored at 0
  });

  it('routes thin-file carriers to review rather than auto-failing', () => {
    const r = computeScore({ ...safeInputs, confidence_modifier: 0.1 }, { ...cleanGates, is_thin_file: true });
    expect(r.routed_to_review).toBe(true);
    expect(r.dispatch_band).not.toBe('red'); // not auto-failed on sparse data
  });
});

describe('open material flag gates green', () => {
  it('a high score with an open flag routes to review, not green', () => {
    const r = computeScore(safeInputs, { ...cleanGates, has_open_material_flag: true });
    expect(r.dispatch_band).toBe('yellow');
  });
});
