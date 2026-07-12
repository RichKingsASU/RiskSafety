// packages/shared/src/constants.ts
// Single source of truth for canonical RSOS constants.
// Change these here only — never inline magic numbers elsewhere.

import {
  dispatchBandsProvisional,
  blueWireEnabled,
  blueWireWeights,
  type BlueWireWeights,
  type GovernanceConfigRow,
} from './governance-config.ts';

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
 *
 * These are the provisional lines the triage (Danica) and dispatch views react
 * to. They are NOT ratified — Matt owns the green/yellow cutoffs (Q1). When he
 * signs off, update these values and set DISPATCH_BANDS_PROVISIONAL to false.
 */
export const DISPATCH_DEFAULTS = {
  green_min: 60, // Good and above eligible by default
  yellow_min: 40, // 40–59 -> needs review; below -> restricted
  divergence_tolerance: 1, // band-steps of disagreement vs CarrierAssure before flagging
  thin_file_inspection_threshold: 3, // below this, no auto-fail on % metrics (Q1/Q3)
} as const;

// ---------------------------------------------------------------------------
// Q1/Q2 governance flags — now DERIVED from the effective-dated governance_config
// layer (supabase/migrations/0006_governance_config.sql), not hand-set here.
//
// The config ships EMPTY, so each constant below resolves to exactly its previous
// value (provisional / null / disabled) — behavior is byte-for-byte unchanged.
// These module-load constants represent the empty-config baseline and keep the
// historical names working for existing importers. RUNTIME surfaces that make a
// dated decision should instead call the accessors in ./governance-config with the
// fetched rows and the DECISION timestamp (read config as-of the decision, not now),
// which is the contemporaneous due-diligence property. Matt's eventual Q1/Q2 values
// arrive as governance_config rows (data), never as invented numbers here
// (check-guardrails rule #7).
// ---------------------------------------------------------------------------
const EMPTY_GOVERNANCE_CONFIG: readonly GovernanceConfigRow[] = [];
const GOVERNANCE_EPOCH = new Date(0); // config is empty -> the as-of instant is irrelevant

/** True while no active dispatch_thresholds config exists (Q1 unratified). Empty -> true. */
export const DISPATCH_BANDS_PROVISIONAL: boolean = dispatchBandsProvisional(
  EMPTY_GOVERNANCE_CONFIG,
  GOVERNANCE_EPOCH,
);

/** Active Blue Wire weights, else null. Empty/disabled config -> null (never invented). */
export const BLUE_WIRE_WEIGHTS: BlueWireWeights | null = blueWireWeights(
  EMPTY_GOVERNANCE_CONFIG,
  GOVERNANCE_EPOCH,
);

/** True only when an active, explicitly-enabled weights row exists. Empty -> false. */
export const BLUE_WIRE_ENABLED: boolean = blueWireEnabled(EMPTY_GOVERNANCE_CONFIG, GOVERNANCE_EPOCH);

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

/**
 * Candidate green/yellow dispatch cutoffs. The canonical live values are
 * `DISPATCH_DEFAULTS` (pending Q1 sign-off); this type exists so a what-if
 * PREVIEW can try other lines without ever mutating the config. Preview only —
 * nothing here is written to the live configuration.
 */
export interface DispatchCutoffs {
  /** Score at/above which a carrier is dispatch-eligible (green). */
  green_min: number;
  /** Score at/above which a carrier needs review (yellow); below -> restricted. */
  yellow_min: number;
}

export type QualityBand = 'excellent' | 'good' | 'fair' | 'poor';
export type DispatchBand = 'green' | 'yellow' | 'orange' | 'red';
export type AuthorityStatus = 'active' | 'inactive' | 'revoked' | 'pending';
export type SafetyRating = 'satisfactory' | 'conditional' | 'unsatisfactory' | 'unrated';
