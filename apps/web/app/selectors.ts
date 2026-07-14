/**
 * Canonical carrier-population selectors (DEF-01).
 *
 * UAT found the Dashboard KPI tile ("Blocked (DNU List)") and the Carriers-list
 * summary ("DNU list / Blocked") showing two different numbers under near-
 * identical labels, each computed by its own inline code path. They are in fact
 * TWO distinct populations:
 *
 *   - "On DNU List"          — carriers explicitly flagged Do-Not-Use.
 *   - "Red / Blocked"        — carriers forced to RED dispatch eligibility by
 *                              ANY hard gate (authority revoked/inactive,
 *                              conditional/unsatisfactory rating, insurance
 *                              lapsed/below minimum, on DNU, or confirmed fraud).
 *
 * Every screen now derives each count from exactly one predicate here, so the
 * two numbers can never silently diverge again. `dispatch_band` is the canonical
 * eligibility from packages/scoring — this module reads it, it does not re-derive
 * the hard-gate set.
 */
import type { CarrierMockRecord } from './mockData';

/** The minimal carrier slice these population selectors depend on. */
export type CarrierPopulationSlice = Pick<CarrierMockRecord, 'gates' | 'scoreResult'>;

/** Carrier is explicitly on the internal Do-Not-Use list. */
export const isOnDnu = (c: CarrierPopulationSlice): boolean => c.gates.on_dnu === true;

/**
 * Carrier is Blocked — forced to RED dispatch eligibility by any hard gate.
 * Reads the canonical `dispatch_band` produced by packages/scoring.
 */
export const isBlockedRed = (c: CarrierPopulationSlice): boolean =>
  c.scoreResult.dispatch_band === 'red';

/** Count of carriers explicitly on the DNU list. */
export const countOnDnu = (carriers: readonly CarrierPopulationSlice[]): number =>
  carriers.reduce((n, c) => (isOnDnu(c) ? n + 1 : n), 0);

/** Count of carriers Blocked (Red) by any hard gate. */
export const countBlockedRed = (carriers: readonly CarrierPopulationSlice[]): number =>
  carriers.reduce((n, c) => (isBlockedRed(c) ? n + 1 : n), 0);
