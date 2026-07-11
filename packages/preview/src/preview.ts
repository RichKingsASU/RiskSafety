// packages/preview/src/preview.ts
// What-if band-volume preview. PURE + READ-ONLY: it reads the canonical numeric
// score from the engine and applies candidate green/yellow cutoffs in ITS OWN
// code (see ./band.ts), then counts the resulting bands. It writes NOTHING to
// config — the canonical live lines are DISPATCH_DEFAULTS and are never touched
// here (CLAUDE.md #4 / Open Question Q1). This is exactly the "name a pair of
// cutoffs, see the queues" capability the Phase 1 memo promises Matt, so the
// bands can be chosen by looking at real volumes.

import { computeScore } from '@forrest/scoring';
import type { DispatchBand, QualityBand, DispatchCutoffs } from '@forrest/shared/constants';
import type { FixtureCarrier } from './fixture-population.ts';
import { bandFor } from './band.ts';

const DISPATCH_BANDS: DispatchBand[] = ['green', 'yellow', 'orange', 'red'];
const QUALITY_BANDS: QualityBand[] = ['excellent', 'good', 'fair', 'poor'];

export interface BandVolumes {
  /** Population size scored. */
  total: number;
  /** The candidate cutoffs this preview was computed at. */
  cutoffs: DispatchCutoffs;
  /** Count of carriers in each dispatch band at these cutoffs. */
  dispatch: Record<DispatchBand, number>;
  /** Count of carriers in each quality band (independent of the cutoffs). */
  quality: Record<QualityBand, number>;
  /** Carriers forced red by a hard gate (authority/safety/insurance/DNU/fraud). */
  hard_gated: number;
  /**
   * The triage reviewer's (Danica's) manual workload at these lines: carriers
   * that are neither "clear to work" (green) nor "blocked" (red) — i.e. the
   * yellow "look before you lean on them" plus orange "restricted" queues.
   * Tightening green grows this; loosening green shrinks it.
   */
  review_queue: number;
  /** Carriers routed to review by a thin file or an open material flag. */
  routed_to_review: number;
  /** review_queue as a share of the population, rounded to 0.1%. */
  review_queue_pct: number;
}

const zero = <K extends string>(keys: K[]): Record<K, number> =>
  keys.reduce((acc, k) => ((acc[k] = 0), acc), {} as Record<K, number>);

/**
 * Score the whole population and tally the bands AT a candidate pair of cutoffs.
 * Pure: no I/O, no mutation of inputs or config. The numeric score and its
 * cutoff-independent facts (hard gate, flags) come from the SINGLE canonical
 * engine (`computeScore`, one behavior); the candidate green/yellow lines are
 * applied here via `bandFor`, never by reshaping the engine call. So previewed
 * volumes match what production would show if these lines were ratified — but the
 * engine is never asked to band on anything but its live DISPATCH_DEFAULTS.
 */
export function previewBands(
  population: FixtureCarrier[],
  cutoffs: DispatchCutoffs,
): BandVolumes {
  const dispatch = zero(DISPATCH_BANDS);
  const quality = zero(QUALITY_BANDS);
  let hard_gated = 0;
  let routed_to_review = 0;

  for (const c of population) {
    const r = computeScore(c.inputs, c.gates); // canonical engine, one behavior
    const dispatch_band = bandFor(r.overall_score, cutoffs, {
      hard_gate_triggered: r.hard_gate_triggered,
      has_open_material_flag: c.gates.has_open_material_flag,
      is_thin_file: c.gates.is_thin_file,
    });
    dispatch[dispatch_band]++;
    quality[r.quality_band]++;
    if (r.hard_gate_triggered) hard_gated++;
    if (r.routed_to_review) routed_to_review++;
  }

  const review_queue = dispatch.yellow + dispatch.orange;
  const total = population.length;

  return {
    total,
    cutoffs,
    dispatch,
    quality,
    hard_gated,
    review_queue,
    routed_to_review,
    review_queue_pct: total === 0 ? 0 : Math.round((review_queue / total) * 1000) / 10,
  };
}

/** Preview several candidate cutoff pairs against one population, for comparison. */
export function previewScenarios(
  population: FixtureCarrier[],
  scenarios: DispatchCutoffs[],
): BandVolumes[] {
  return scenarios.map((s) => previewBands(population, s));
}
