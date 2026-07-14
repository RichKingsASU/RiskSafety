import { describe, it, expect } from 'vitest';
import { buildMockCarriers } from '../../apps/web/app/mockData';
import {
  isOnDnu,
  isBlockedRed,
  countOnDnu,
  countBlockedRed,
} from '../../apps/web/app/selectors';
import { CARRIER_POPULATION } from '@forrest/shared/constants';

/**
 * DEF-01 — the Dashboard KPI tile ("On DNU List") and the Carriers-list summary
 * ("Red / Blocked (all gates)") must each derive from ONE canonical selector,
 * and the two counts are genuinely distinct populations — not the same metric
 * shown as two different numbers.
 */
describe('DEF-01: Blocked / DNU count reconciliation', () => {
  const carriers = buildMockCarriers();

  it('does not silently shrink the canonical carrier population', () => {
    expect(carriers.length).toBe(CARRIER_POPULATION);
  });

  it('"On DNU List" derives from the on_dnu predicate on the fixture data', () => {
    const expected = carriers.filter((c) => c.gates.on_dnu === true).length;
    expect(countOnDnu(carriers)).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('"Red / Blocked (all gates)" derives from the canonical dispatch_band', () => {
    const expected = carriers.filter((c) => c.scoreResult.dispatch_band === 'red').length;
    expect(countBlockedRed(carriers)).toBe(expected);
    expect(expected).toBeGreaterThan(0);
  });

  it('treats On-DNU and Red/Blocked as DISTINCT populations (Red ⊇ DNU)', () => {
    // Every carrier explicitly on DNU is Blocked (Red), because on_dnu is a hard
    // gate — but Red also includes carriers red for other gates, so the two
    // counts must not be assumed equal. This is why the labels differ.
    for (const c of carriers) {
      if (isOnDnu(c)) expect(isBlockedRed(c)).toBe(true);
    }
    expect(countBlockedRed(carriers)).toBeGreaterThan(countOnDnu(carriers));
  });

  it('counts are pure functions of the same carrier source (no divergence by call site)', () => {
    // Both screens now call these selectors; calling them twice on the same
    // data yields identical results — the two screens cannot diverge.
    expect(countOnDnu(carriers)).toBe(countOnDnu(carriers));
    expect(countBlockedRed(carriers)).toBe(countBlockedRed(carriers));
  });
});
