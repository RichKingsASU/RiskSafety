// packages/scoring/src/index.ts
// CANONICAL scoring engine (Blue Wire composite). HIGH SCORE = GOOD (safer).
// This is THE reference implementation — do not hand-roll a second version.
// All weights/bands/cutoffs come from packages/shared/src/constants.ts; never
// inline magic numbers here. See packages/scoring/src/index.test.ts (golden tests).

import {
  SCORE_WEIGHTS,
  QUALITY_BAND_CUTOFFS,
  DISPATCH_DEFAULTS,
  type QualityBand,
  type DispatchBand,
  type AuthorityStatus,
  type SafetyRating,
} from '@forrest/shared/constants';

/** Score neutral point. Thin-file / low-confidence carriers are pulled toward
 *  this instead of being crushed to 0 by a single bad inspection. */
const NEUTRAL_SCORE = 50;

/** The four FMCSA sub-scores (each 0–100, higher = safer) plus data confidence. */
export interface ScoreInputs {
  fleet_size_score: number;
  vehicle_oos_score: number;
  driver_oos_score: number;
  accident_rate_score: number;
  /** 0–1. Low = sparse data; blends the composite toward NEUTRAL_SCORE. */
  confidence_modifier: number;
}

/** Hard gates + open flags. These are NOT weighted score inputs — they gate
 *  dispatch eligibility on top of the composite (CLAUDE.md rule #1 and #2). */
export interface GateInputs {
  authority_status: AuthorityStatus;
  safety_rating: SafetyRating;
  insurance_lapsed_or_below_min: boolean;
  on_dnu: boolean;
  confirmed_fraud: boolean;
  has_open_material_flag: boolean;
  is_thin_file: boolean;
}

export interface OverallScore {
  /** Confidence-blended, rounded composite, clamped to 0–100. */
  overall: number;
  /** Pure weighted composite before the confidence blend. */
  raw: number;
  /** Per-input weighted contributions (for the UI breakdown, Phase 2). */
  contributions: Record<keyof typeof SCORE_WEIGHTS, number>;
  confidence_modifier: number;
}

export interface ScoreResult extends OverallScore {
  overall_score: number;
  quality_band: QualityBand;
  dispatch_band: DispatchBand;
  /** True when any hard gate fired — dispatch is forced red regardless of score. */
  hard_gate_triggered: boolean;
  /** True when the carrier needs human review (thin file or open material flag). */
  routed_to_review: boolean;
}

const clamp = (n: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, n));

/** Pure FMCSA banding from the composite. Higher is better. */
export function toQualityBand(score: number): QualityBand {
  if (score >= QUALITY_BAND_CUTOFFS.excellent) return 'excellent';
  if (score >= QUALITY_BAND_CUTOFFS.good) return 'good';
  if (score >= QUALITY_BAND_CUTOFFS.fair) return 'fair';
  return 'poor';
}

/**
 * Weighted composite: 0.15·fleet + 0.20·vehicle_oos + 0.25·driver_oos + 0.40·accident_rate.
 * Then blend toward NEUTRAL_SCORE by the confidence modifier so thin files aren't crushed.
 */
export function computeOverallScore(inputs: ScoreInputs): OverallScore {
  const cm = clamp(inputs.confidence_modifier ?? 1, 0, 1);
  const contributions = {
    fleet_size: SCORE_WEIGHTS.fleet_size * inputs.fleet_size_score,
    vehicle_oos: SCORE_WEIGHTS.vehicle_oos * inputs.vehicle_oos_score,
    driver_oos: SCORE_WEIGHTS.driver_oos * inputs.driver_oos_score,
    accident_rate: SCORE_WEIGHTS.accident_rate * inputs.accident_rate_score,
  };
  const raw =
    contributions.fleet_size +
    contributions.vehicle_oos +
    contributions.driver_oos +
    contributions.accident_rate;
  const blended = raw * cm + NEUTRAL_SCORE * (1 - cm);
  return {
    overall: clamp(Math.round(blended), 0, 100),
    raw,
    contributions,
    confidence_modifier: cm,
  };
}

/** True if any hard gate fires. Hard gates force dispatch RED regardless of score. */
function hardGateTriggered(gates: GateInputs): boolean {
  return (
    gates.authority_status === 'revoked' ||
    gates.authority_status === 'inactive' ||
    gates.safety_rating === 'conditional' ||
    gates.safety_rating === 'unsatisfactory' ||
    gates.insurance_lapsed_or_below_min ||
    gates.on_dnu ||
    gates.confirmed_fraud
  );
}

/**
 * Full evaluation: composite + quality band + dispatch eligibility.
 * Dispatch eligibility (green|yellow|orange|red) is derived from the quality band
 * PLUS hard gates and open flags — it is NOT the quality band itself (CLAUDE.md #2).
 *
 * ONE behavior: banding is against the live `DISPATCH_DEFAULTS` only. There is no
 * cutoff parameter — no caller can make the engine band on other lines. What-if
 * previews live in `@forrest/preview`, which reads THIS numeric score and applies
 * candidate cutoffs in its own code (see ADR-0001). This single-code-path contract
 * is what the directionality / anti-drift guardrails depend on.
 */
export function computeScore(inputs: ScoreInputs, gates: GateInputs): ScoreResult {
  const base = computeOverallScore(inputs);
  const overall_score = base.overall;
  const quality_band = toQualityBand(overall_score);

  const hard_gate_triggered = hardGateTriggered(gates);
  const routed_to_review = gates.is_thin_file || gates.has_open_material_flag;

  let dispatch_band: DispatchBand;
  if (hard_gate_triggered) {
    // Hard gate overrides everything — a perfect score still reads red.
    dispatch_band = 'red';
  } else {
    // Base eligibility from the score (defaults pending Q1 sign-off).
    let band: DispatchBand =
      overall_score >= DISPATCH_DEFAULTS.green_min
        ? 'green'
        : overall_score >= DISPATCH_DEFAULTS.yellow_min
          ? 'yellow'
          : 'orange';

    // An open material flag routes an otherwise-green carrier to review, not green.
    if (gates.has_open_material_flag && band === 'green') band = 'yellow';

    // Thin files are never auto-failed on sparse data — floor at yellow (review),
    // never orange/red purely because data is thin.
    if (gates.is_thin_file && band === 'orange') band = 'yellow';

    dispatch_band = band;
  }

  return {
    ...base,
    overall_score,
    quality_band,
    dispatch_band,
    hard_gate_triggered,
    routed_to_review,
  };
}
