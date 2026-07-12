// tests/unit/governance-config.test.ts
// The effective-dated governance config layer (0006) that supersedes the code
// constants for the two pending decisions (Q1 dispatch thresholds, Q2 Blue Wire
// weights). Proves: empty config == today's behavior; active-row resolution is
// greatest-effective_from <= ts; and a decision reads config AS OF its own time
// (the contemporaneous due-diligence property), never a later change.

import { describe, it, expect } from 'vitest';
import {
  configActiveAsOf,
  dispatchBandsProvisional,
  dispatchThresholds,
  blueWireEnabled,
  blueWireWeights,
  DISPATCH_BANDS_PROVISIONAL,
  BLUE_WIRE_ENABLED,
  BLUE_WIRE_WEIGHTS,
  type GovernanceConfigRow,
} from '@forrest/shared';

const AT = '2026-07-12T00:00:00.000Z';

describe('empty config == today (no regression)', () => {
  const empty: GovernanceConfigRow[] = [];

  it('dispatch bands are provisional when no dispatch_thresholds row exists', () => {
    expect(dispatchBandsProvisional(empty, AT)).toBe(true);
    expect(dispatchThresholds(empty, AT)).toBeNull();
  });

  it('Blue Wire is disabled with null weights on empty config', () => {
    expect(blueWireEnabled(empty, AT)).toBe(false);
    expect(blueWireWeights(empty, AT)).toBeNull();
  });

  it('the thin-wrapper constants match the empty-config derivation exactly', () => {
    // These are what existing importers (and the decision-gate test) rely on.
    expect(DISPATCH_BANDS_PROVISIONAL).toBe(true);
    expect(BLUE_WIRE_ENABLED).toBe(false);
    expect(BLUE_WIRE_WEIGHTS).toBeNull();
  });
});

describe('configActiveAsOf — greatest effective_from <= asOf', () => {
  const rows: GovernanceConfigRow[] = [
    { config_key: 'dispatch_thresholds', value: { green_min: 60, yellow_min: 40 }, enabled: false, effective_from: '2026-01-01T00:00:00.000Z' },
    { config_key: 'dispatch_thresholds', value: { green_min: 65, yellow_min: 45 }, enabled: false, effective_from: '2026-06-01T00:00:00.000Z' },
    { config_key: 'dispatch_thresholds', value: { green_min: 70, yellow_min: 50 }, enabled: false, effective_from: '2026-12-01T00:00:00.000Z' },
  ];

  it('picks the latest row not after asOf among several', () => {
    const r = configActiveAsOf(rows, 'dispatch_thresholds', '2026-07-01T00:00:00.000Z');
    expect(r?.effective_from).toBe('2026-06-01T00:00:00.000Z');
    expect((r?.value as { green_min: number }).green_min).toBe(65);
  });

  it('returns null before the earliest effective_from', () => {
    expect(configActiveAsOf(rows, 'dispatch_thresholds', '2025-12-31T00:00:00.000Z')).toBeNull();
  });

  it('ignores future-dated rows (all after asOf)', () => {
    // Only the future row exists for this key; as-of an earlier time -> null.
    const future: GovernanceConfigRow[] = [
      { config_key: 'blue_wire_weights', value: { safety: 0.1 }, enabled: true, effective_from: '2027-01-01T00:00:00.000Z' },
    ];
    expect(blueWireEnabled(future, AT)).toBe(false);
    expect(blueWireWeights(future, AT)).toBeNull();
  });

  it('resolution is unambiguous: no two rows share (config_key, effective_from)', () => {
    // The greatest-effective_from-<=-ts rule needs no secondary tiebreak because the DB
    // enforces UNIQUE (config_key, effective_from) (migration 0006). Same-timestamp ties
    // therefore cannot reach the accessor; a correction is a NEW row at a fresh
    // effective_from. The actual duplicate-INSERT rejection is a Postgres constraint,
    // proven in tests/rls/assert.sql (a unit test has no DB). Here we just assert the
    // invariant the accessor relies on: distinct (key, effective_from) in a valid set.
    const seen = new Set(rows.map((r) => `${r.config_key}@${r.effective_from}`));
    expect(seen.size).toBe(rows.length);
  });
});

describe('effective-dating — a decision reads config AS OF its own time', () => {
  // Ratified on 2026-08-01; a decision made BEFORE that must still read provisional.
  const rows: GovernanceConfigRow[] = [
    { config_key: 'dispatch_thresholds', value: { green_min: 62, yellow_min: 42 }, enabled: true, effective_from: '2026-08-01T00:00:00.000Z' },
  ];

  it('a decision at T reads the config effective at T, not a later change', () => {
    const beforeRatify = '2026-07-15T00:00:00.000Z';
    const afterRatify = '2026-08-15T00:00:00.000Z';

    // Before the config took effect: still provisional, no thresholds.
    expect(dispatchBandsProvisional(rows, beforeRatify)).toBe(true);
    expect(dispatchThresholds(rows, beforeRatify)).toBeNull();

    // After it took effect: no longer provisional, thresholds resolve.
    expect(dispatchBandsProvisional(rows, afterRatify)).toBe(false);
    expect(dispatchThresholds(rows, afterRatify)).toEqual({ green_min: 62, yellow_min: 42 });
  });
});

describe('Blue Wire guardrail — enabled requires an active AND enabled row', () => {
  it('an active but DISABLED weights row yields no weights (null-equivalent)', () => {
    const rows: GovernanceConfigRow[] = [
      { config_key: 'blue_wire_weights', value: { safety: 0.2 }, enabled: false, effective_from: '2026-01-01T00:00:00.000Z' },
    ];
    expect(blueWireEnabled(rows, AT)).toBe(false);
    expect(blueWireWeights(rows, AT)).toBeNull();
  });

  it('an active AND enabled weights row yields those weights', () => {
    const rows: GovernanceConfigRow[] = [
      { config_key: 'blue_wire_weights', value: { safety: 0.2 }, enabled: true, effective_from: '2026-01-01T00:00:00.000Z' },
    ];
    expect(blueWireEnabled(rows, AT)).toBe(true);
    expect(blueWireWeights(rows, AT)).toEqual({ safety: 0.2 });
  });
});
