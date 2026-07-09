// packages/shared/src/constants.ts
// Single source of truth for canonical RSOS constants.
// Change these here only — never inline magic numbers elsewhere.

/** Forrest insurance minimums (USD). Insurance is a HARD GATE, not a score input. */
export const INSURANCE_MINIMUMS = {
  auto_liability: 1_000_000,
  cargo: 100_000,
  trailer_interchange: 30_000,
  // workers_comp: per requirement (no fixed dollar minimum) — presence/validity gate
} as const;

/**
 * Canonical FMCSA scorecard weights. HIGH SCORE = GOOD (safer) carrier.
 * Weights sum to 1.0. Do not add insurance/claims/compliance as weighted inputs —
 * those are hard gates and flags.
 */
export const SCORE_WEIGHTS = {
  fleet_size: 0.15,
  vehicle_oos: 0.20,
  driver_oos: 0.25,
  accident_rate: 0.40,
} as const;

/** Quality bands from the composite score (pure FMCSA banding). Higher is better. */
export const QUALITY_BAND_CUTOFFS = {
  excellent: 80, // >= 80
  good: 60, // 60–79
  fair: 40, // 40–59
  // poor: < 40
} as const;

/**
 * Dispatch-eligibility cutoffs (DEFAULTS — pending Open Question Q1 sign-off).
 * Eligibility is distinct from the quality band and is additionally gated by
 * hard gates and open flags. Keep these here so Q1 is a one-line change.
 */
export const DISPATCH_DEFAULTS = {
  green_min: 60, // Good and above eligible by default
  yellow_min: 40, // 40–59 -> needs review; below -> restricted
  divergence_tolerance: 1, // band-steps of disagreement vs CarrierAssure before flagging
  thin_file_inspection_threshold: 3, // below this, no auto-fail on % metrics (Q1/Q3)
} as const;

/** Canonical population figures (memory of record). Used for seed sizing and displays. */
export const CARRIER_POPULATION = 1136;
export const OWN_FLEET_POWER_UNITS = 22; // Forrest Transportation — separate, distinct view

/** Governance feature flags. Defaults reflect team votes (Discuss/Skip = off/dormant). */
export const FEATURE_FLAGS_DEFAULT = {
  FEATURE_DISPATCH_BLOCK_ENFORCING: false, // dormant/advisory until team ratifies (Q15)
  FEATURE_AI_ASSISTANT: false, // off by default (team: Discuss)
  FEATURE_COI_OCR: true, // parse-and-prefill only; NEVER auto-approves
} as const;

/** Status color language — used consistently in every surface. */
export const STATUS_COLORS = {
  green: 'Approved',
  yellow: 'Needs Review',
  orange: 'Restricted',
  red: 'Blocked / Do-Not-Use',
} as const;

export type QualityBand = 'excellent' | 'good' | 'fair' | 'poor';
export type DispatchBand = 'green' | 'yellow' | 'orange' | 'red';
export type AuthorityStatus = 'active' | 'inactive' | 'revoked' | 'pending';
export type SafetyRating = 'satisfactory' | 'conditional' | 'unsatisfactory' | 'unrated';
