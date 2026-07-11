// packages/preview/src/preview.test.ts
// Guardrails for the what-if preview: it must be deterministic, read-only, use
// the canonical population size, honor candidate cutoffs, and — critically —
// never mutate or depend on the live config so Open Question Q1 stays open.

import { describe, it, expect } from 'vitest';
import { CARRIER_POPULATION, DISPATCH_DEFAULTS } from '@forrest/shared/constants';
import { generateFixturePopulation, DEFAULT_SEED } from './fixture-population';
import { previewBands } from './preview';

describe('fixture population', () => {
  it('defaults to the canonical carrier population (1,136)', () => {
    expect(generateFixturePopulation().length).toBe(CARRIER_POPULATION);
    expect(CARRIER_POPULATION).toBe(1136);
  });

  it('is deterministic: same seed -> identical population', () => {
    const a = generateFixturePopulation(200, 42);
    const b = generateFixturePopulation(200, 42);
    expect(a).toEqual(b);
  });

  it('varies with the seed', () => {
    const a = generateFixturePopulation(200, 1);
    const b = generateFixturePopulation(200, 2);
    expect(a).not.toEqual(b);
  });

  it('produces only in-range, valid inputs', () => {
    for (const c of generateFixturePopulation(300, DEFAULT_SEED)) {
      for (const k of ['fleet_size_score', 'vehicle_oos_score', 'driver_oos_score', 'accident_rate_score'] as const) {
        expect(c.inputs[k]).toBeGreaterThanOrEqual(0);
        expect(c.inputs[k]).toBeLessThanOrEqual(100);
      }
      expect(c.inputs.confidence_modifier).toBeGreaterThan(0);
      expect(c.inputs.confidence_modifier).toBeLessThanOrEqual(1);
    }
  });
});

describe('previewBands', () => {
  const pop = generateFixturePopulation();

  it('every carrier lands in exactly one dispatch band (counts sum to total)', () => {
    const v = previewBands(pop, DISPATCH_DEFAULTS);
    const sum = v.dispatch.green + v.dispatch.yellow + v.dispatch.orange + v.dispatch.red;
    expect(sum).toBe(v.total);
    expect(v.total).toBe(CARRIER_POPULATION);
  });

  it('is deterministic for a fixed population + cutoffs', () => {
    expect(previewBands(pop, DISPATCH_DEFAULTS)).toEqual(previewBands(pop, DISPATCH_DEFAULTS));
  });

  it('tighter green -> larger review queue; looser green -> smaller (the memo trade-off)', () => {
    const tight = previewBands(pop, { green_min: 80, yellow_min: 60 });
    const loose = previewBands(pop, { green_min: 55, yellow_min: 35 });
    expect(tight.review_queue).toBeGreaterThan(loose.review_queue);
    expect(tight.dispatch.green).toBeLessThan(loose.dispatch.green);
  });

  it('hard-gated and quality-band counts are invariant to the green/yellow cutoffs', () => {
    const a = previewBands(pop, { green_min: 80, yellow_min: 60 });
    const b = previewBands(pop, { green_min: 55, yellow_min: 35 });
    expect(a.hard_gated).toBe(b.hard_gated);
    expect(a.quality).toEqual(b.quality);
  });

  it('review_queue equals yellow + orange', () => {
    const v = previewBands(pop, { green_min: 72, yellow_min: 52 });
    expect(v.review_queue).toBe(v.dispatch.yellow + v.dispatch.orange);
  });

  it('is read-only: does not mutate the live DISPATCH_DEFAULTS config', () => {
    const before = { ...DISPATCH_DEFAULTS };
    previewBands(pop, { green_min: 90, yellow_min: 70 });
    expect({ ...DISPATCH_DEFAULTS }).toEqual(before);
    // The live defaults are still the untouched placeholders (Q1 still open).
    expect(DISPATCH_DEFAULTS.green_min).toBe(60);
    expect(DISPATCH_DEFAULTS.yellow_min).toBe(40);
  });
});
