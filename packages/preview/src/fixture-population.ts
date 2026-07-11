// packages/preview/src/fixture-population.ts
// Deterministic fixture carrier population for what-if PREVIEW only.
//
// These are the "1,136 realistic but invented carriers" the Phase 1 memo refers
// to — a stand-in book used to preview band volumes at candidate cutoffs. It is
// NOT real carrier data and NOT config: it invents no thresholds, weights, or
// table-dictionary values (CLAUDE.md forbids that). The generator is fully
// deterministic (seeded PRNG, no Math.random / no Date) so the same seed always
// yields the same population and previews are reproducible and reviewable.

import { CARRIER_POPULATION, DISPATCH_DEFAULTS } from '@forrest/shared/constants';
import type { ScoreInputs, GateInputs } from '@forrest/scoring';

/** One invented carrier: everything the canonical engine needs to score it. */
export interface FixtureCarrier {
  carrier_id: string;
  dot_number: number;
  legal_name: string;
  inputs: ScoreInputs;
  gates: GateInputs;
}

/** Canonical default seed. Change only to explore a different invented book. */
export const DEFAULT_SEED = 0x5f3759df;

/** mulberry32 — small, fast, deterministic PRNG. Same seed -> same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Draw a 0–100 sub-score with a soft bell around `center` (± ~`spread`). */
function scoreDraw(rng: () => number, center: number, spread: number): number {
  const bell = (rng() + rng() + rng()) / 3 - 0.5; // ~[-0.5, 0.5], centered
  return Math.min(100, Math.max(0, Math.round(center + bell * 2 * spread)));
}

/** True with probability `p`. */
const chance = (rng: () => number, p: number): boolean => rng() < p;

/**
 * Build the deterministic fixture population.
 *
 * Distribution is chosen to spread carriers across the whole score range so that
 * moving the green/yellow lines produces meaningfully different queue volumes —
 * the point of the preview. Most carriers cluster in the Good/Excellent range
 * with a genuine tail of weaker ones, plus a small fraction carrying hard gates
 * (authority/safety/insurance/DNU/fraud), open flags, and thin files.
 */
export function generateFixturePopulation(
  count: number = CARRIER_POPULATION,
  seed: number = DEFAULT_SEED,
): FixtureCarrier[] {
  const rng = mulberry32(seed);
  const carriers: FixtureCarrier[] = [];

  for (let i = 0; i < count; i++) {
    // A per-carrier "quality center" gives a realistic spread: a bulk of solid
    // carriers, a middle, and a weak tail.
    const roll = rng();
    const center =
      roll < 0.55 ? 74 : // solid majority
      roll < 0.85 ? 58 : // middling
      38;                // weaker tail

    const inputs: ScoreInputs = {
      fleet_size_score: scoreDraw(rng, center, 22),
      vehicle_oos_score: scoreDraw(rng, center, 24),
      driver_oos_score: scoreDraw(rng, center, 24),
      accident_rate_score: scoreDraw(rng, center, 20),
      confidence_modifier: 0,
    };

    // Confidence: most carriers well-observed; a tail of thin files near neutral.
    const thin = chance(rng, 0.1);
    inputs.confidence_modifier = thin
      ? 0.1 + rng() * 0.3 // 0.10–0.40, sparse data
      : 0.7 + rng() * 0.3; // 0.70–1.00, well-observed

    const authorityRoll = rng();
    const safetyRoll = rng();
    const gates: GateInputs = {
      authority_status:
        authorityRoll < 0.015 ? 'revoked' :
        authorityRoll < 0.03 ? 'inactive' :
        authorityRoll < 0.05 ? 'pending' : 'active',
      safety_rating:
        safetyRoll < 0.02 ? 'unsatisfactory' :
        safetyRoll < 0.05 ? 'conditional' :
        safetyRoll < 0.55 ? 'satisfactory' : 'unrated',
      insurance_lapsed_or_below_min: chance(rng, 0.02),
      on_dnu: chance(rng, 0.01),
      confirmed_fraud: chance(rng, 0.005),
      has_open_material_flag: chance(rng, 0.08),
      is_thin_file: thin,
    };

    const dot = 100000 + i;
    carriers.push({
      carrier_id: `FX-${String(i + 1).padStart(5, '0')}`,
      dot_number: dot,
      legal_name: `Fixture Carrier ${i + 1} LLC`,
      inputs,
      gates,
    });
  }

  return carriers;
}

// Re-export so callers can reference the live default lines the preview compares against.
export { DISPATCH_DEFAULTS };
