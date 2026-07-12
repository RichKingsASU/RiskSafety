// tests/unit/decision-gate.test.ts
// Phase 1 decision-gate guardrails. These pin the "do not invent values" rule
// (CLAUDE.md Open Questions Q1/Q2, check-guardrails rule #7) so the two pending
// policy calls stay unset until their owners sign off — and stay SAFE once they do.
//
// Rescued from claude/rsos-phase-1-decisions-92bvwi (only copy) and reconciled to
// main's current API: it additionally exercises the ONE canonical engine
// (@forrest/scoring, ADR-0002 / CLAUDE.md #1) to prove Blue Wire is never applied
// while disabled — rather than trusting the flag by inspection alone.

import { describe, it, expect } from 'vitest';
import {
  DISPATCH_DEFAULTS,
  DISPATCH_BANDS_PROVISIONAL,
  BLUE_WIRE_WEIGHTS,
  BLUE_WIRE_ENABLED,
  SCORE_WEIGHTS,
} from '@forrest/shared/constants';
import { computeScore, type ScoreInputs, type GateInputs } from '@forrest/scoring';

describe('Q1 — dispatch bands (Matt)', () => {
  it('green cutoff sits strictly above the yellow cutoff', () => {
    expect(DISPATCH_DEFAULTS.green_min).toBeGreaterThan(DISPATCH_DEFAULTS.yellow_min);
  });

  it('both cutoffs are valid 0–100 scores', () => {
    for (const v of [DISPATCH_DEFAULTS.green_min, DISPATCH_DEFAULTS.yellow_min]) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it('bands are flagged provisional until Q1 is ratified (deliberate tripwire)', () => {
    // Q1 is open, so the bands are placeholders, NOT signed-off policy. This assertion
    // fails the moment someone flips the flag — forcing that change to also ratify the
    // cutoffs and record them in ADR-0003 rather than silently promoting a guess.
    expect(typeof DISPATCH_BANDS_PROVISIONAL).toBe('boolean');
    expect(DISPATCH_BANDS_PROVISIONAL).toBe(true);
  });
});

describe('Q2 — Blue Wire weights (Matt)', () => {
  it('never enables Blue Wire without a weight map (no invented contribution)', () => {
    // Enabled with null/empty weights would mean Blue Wire counts with invented
    // numbers. That must be impossible.
    const enabledWithoutWeights =
      BLUE_WIRE_ENABLED && (BLUE_WIRE_WEIGHTS === null || Object.keys(BLUE_WIRE_WEIGHTS).length === 0);
    expect(enabledWithoutWeights).toBe(false);
  });

  it('if weights are set, every weight is a finite non-negative number', () => {
    if (BLUE_WIRE_WEIGHTS !== null) {
      for (const w of Object.values(BLUE_WIRE_WEIGHTS)) {
        expect(Number.isFinite(w)).toBe(true);
        expect(w).toBeGreaterThanOrEqual(0);
      }
    } else {
      // Q2 not yet decided — slot stays unset, Blue Wire contributes nothing.
      expect(BLUE_WIRE_ENABLED).toBe(false);
    }
  });

  it('while disabled, the canonical engine applies ONLY the FMCSA weights (Blue Wire never contributes)', () => {
    // Exercises the intent against the real engine, not just the flag: the composite
    // breakdown must contain exactly the four FMCSA sub-score weights and nothing else
    // — no Blue Wire term — while BLUE_WIRE_ENABLED is false.
    expect(BLUE_WIRE_ENABLED).toBe(false);

    const inputs: ScoreInputs = {
      fleet_size_score: 80,
      vehicle_oos_score: 80,
      driver_oos_score: 80,
      accident_rate_score: 80,
      confidence_modifier: 1,
    };
    const gates: GateInputs = {
      authority_status: 'active',
      safety_rating: 'satisfactory',
      insurance_lapsed_or_below_min: false,
      on_dnu: false,
      confirmed_fraud: false,
      has_open_material_flag: false,
      is_thin_file: false,
    };

    const result = computeScore(inputs, gates);
    expect(Object.keys(result.contributions).sort()).toEqual(Object.keys(SCORE_WEIGHTS).sort());
  });
});
