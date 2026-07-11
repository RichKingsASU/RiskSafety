// packages/preview/src/band.ts
// Candidate-cutoff banding for the what-if PREVIEW — and ONLY the preview.
//
// This applies a candidate pair of green/yellow lines to a score the canonical
// engine already produced. It does NOT compute the score: the weighted-sum /
// confidence-blend formula lives in exactly one place (`@forrest/scoring`) and is
// never re-expressed here. What lives here is the cutoff *comparison* plus the
// same non-cutoff banding rules the engine applies (hard-gate → red, open-flag
// downgrade, thin-file floor), parameterized on the candidate lines — so preview
// volumes match what the engine would show if those lines were the live config.
//
// The engine itself has ONE behavior (bands on DISPATCH_DEFAULTS only, no cutoff
// parameter). Candidate cutoffs stay entirely in the preview's own state, here.

import type { DispatchBand, DispatchCutoffs } from '@forrest/shared/constants';

/** The engine-derived facts a candidate banding needs, none of them cutoff-dependent. */
export interface BandFacts {
  /** Any hard gate fired (authority/safety/insurance/DNU/fraud) — forces red. */
  hard_gate_triggered: boolean;
  /** Open material flag downgrades an otherwise-green carrier to review. */
  has_open_material_flag: boolean;
  /** Thin file is never auto-failed on sparse data — floored at yellow. */
  is_thin_file: boolean;
}

/**
 * Band a single carrier at CANDIDATE cutoffs, from its canonical numeric score.
 * Pure. Mirrors the engine's dispatch-band rules exactly; only the green/yellow
 * comparison is parameterized. Preview / what-if only — writes nothing, decides
 * nothing operational.
 */
export function bandFor(
  overallScore: number,
  cutoffs: DispatchCutoffs,
  facts: BandFacts,
): DispatchBand {
  // Hard gate overrides everything — a perfect score still reads red.
  if (facts.hard_gate_triggered) return 'red';

  let band: DispatchBand =
    overallScore >= cutoffs.green_min
      ? 'green'
      : overallScore >= cutoffs.yellow_min
        ? 'yellow'
        : 'orange';

  // An open material flag routes an otherwise-green carrier to review, not green.
  if (facts.has_open_material_flag && band === 'green') band = 'yellow';

  // Thin files are never auto-failed on sparse data — floor at yellow (review).
  if (facts.is_thin_file && band === 'orange') band = 'yellow';

  return band;
}
