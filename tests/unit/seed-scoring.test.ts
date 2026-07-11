// tests/unit/seed-scoring.test.ts
// ANTI-DRIFT GUARD for the carrier seed.
//
// The seed emits scores as LITERALS (supabase/seed/scores.generated.sql, and the
// frozen supabase/seed/dataset.generated.json). Those literals are produced at build
// time by the ONE canonical engine in packages/scoring. This test re-derives every
// score from the frozen inputs using that same engine and asserts the persisted seed
// values still match. If the engine changes and the seed is not regenerated — or if
// anyone hand-edits a seed value — the two diverge and CI FAILS. That
// divergence-fails-CI behaviour is the whole point.
//
// It is NOT circular: the committed artifacts are static text on disk; the engine
// recomputes independently and the values must agree.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { computeScore } from '@forrest/scoring';
import { buildDataset, CARRIER_POPULATION, NAMED_COUNT } from '../../supabase/seed/dataset.mjs';

const readRepo = (rel: string) =>
  readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8');

type Carrier = {
  id: string;
  fixture_key: string | null;
  is_named: boolean;
  inputs: Parameters<typeof computeScore>[0];
  gates: Parameters<typeof computeScore>[1];
  carrierassure_grade: string | null;
  divergence_flag: boolean;
  output: {
    overall_score: number;
    quality_band: string;
    dispatch_band: string;
    hard_gate_triggered: boolean;
    routed_to_review: boolean;
  };
};

const dataset = JSON.parse(readRepo('supabase/seed/dataset.generated.json')) as {
  population: number;
  named: number;
  carriers: Carrier[];
};
const carriers = dataset.carriers;
const seedSql = readRepo('supabase/seed/seed.sql');
const scoresSql = readRepo('supabase/seed/scores.generated.sql');
const carriersSql = readRepo('supabase/seed/carriers.generated.sql');

describe('seed <-> engine parity (anti-drift)', () => {
  it('every persisted seed score equals a fresh engine computation', () => {
    // If this fails, the seed and the TS engine have DRIFTED. Regenerate the seed
    // (`npm run seed:build`) if the engine change was intentional; otherwise the
    // engine regressed. Do not "fix" it by editing the literals.
    const mismatches: string[] = [];
    for (const c of carriers) {
      const r = computeScore(c.inputs, c.gates);
      if (
        r.overall_score !== c.output.overall_score ||
        r.quality_band !== c.output.quality_band ||
        r.dispatch_band !== c.output.dispatch_band ||
        r.hard_gate_triggered !== c.output.hard_gate_triggered ||
        r.routed_to_review !== c.output.routed_to_review
      ) {
        mismatches.push(
          `${c.id} (${c.fixture_key ?? 'gen'}): seed=${JSON.stringify(c.output)} engine=${JSON.stringify({
            overall_score: r.overall_score,
            quality_band: r.quality_band,
            dispatch_band: r.dispatch_band,
            hard_gate_triggered: r.hard_gate_triggered,
            routed_to_review: r.routed_to_review,
          })}`
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('the four NAMED example carriers each match the engine (explicit)', () => {
    // The task's acceptance bar: seeded_score == scoring.compute(inputs) for the
    // named examples. C1 = 86 is the canonical "86 is GOOD, not dangerous" proof.
    const named = carriers.filter((c) => c.is_named);
    expect(named.length).toBe(NAMED_COUNT);
    for (const c of named) {
      const r = computeScore(c.inputs, c.gates);
      expect(r.overall_score, `${c.fixture_key} overall`).toBe(c.output.overall_score);
      expect(r.quality_band, `${c.fixture_key} quality`).toBe(c.output.quality_band);
      expect(r.dispatch_band, `${c.fixture_key} dispatch`).toBe(c.output.dispatch_band);
    }
    const c1 = named.find((c) => c.fixture_key === 'C1')!;
    expect([c1.output.overall_score, c1.output.quality_band, c1.output.dispatch_band]).toEqual([
      86,
      'excellent',
      'green',
    ]);
  });

  it('the committed inputs match a fresh deterministic dataset build', () => {
    const fresh = buildDataset();
    expect(fresh.length).toBe(carriers.length);
    for (let i = 0; i < fresh.length; i++) {
      expect(fresh[i].inputs).toEqual(carriers[i].inputs);
      expect(fresh[i].gates).toEqual(carriers[i].gates);
      expect(fresh[i].id).toBe(carriers[i].id);
    }
  });
});

describe('scores.generated.sql literals match the dataset (SQL <-> JSON parity)', () => {
  const rowRe =
    /\('([0-9a-f-]+)',\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+),\s*'(\w+)'::quality_band,\s*[\d.]+,\s*(?:'[^']*'|null),\s*(?:true|false),\s*'(\w+)'::dispatch_band\)/g;
  const byId = new Map(carriers.map((c) => [c.id, c]));

  it('parses exactly CARRIER_POPULATION risk_scores rows', () => {
    const count = (scoresSql.match(rowRe) ?? []).length;
    expect(count).toBe(CARRIER_POPULATION);
  });

  it('each SQL row equals the JSON inputs/outputs for that carrier', () => {
    let m: RegExpExecArray | null;
    let checked = 0;
    while ((m = rowRe.exec(scoresSql)) !== null) {
      const [, id, fleet, veh, drv, acc, overall, quality, dispatch] = m;
      const c = byId.get(id);
      expect(c, `unknown carrier id in SQL: ${id}`).toBeTruthy();
      if (!c) continue;
      expect(Number(fleet)).toBe(c.inputs.fleet_size_score);
      expect(Number(veh)).toBe(c.inputs.vehicle_oos_score);
      expect(Number(drv)).toBe(c.inputs.driver_oos_score);
      expect(Number(acc)).toBe(c.inputs.accident_rate_score);
      expect(Number(overall)).toBe(c.output.overall_score);
      expect(quality).toBe(c.output.quality_band);
      expect(dispatch).toBe(c.output.dispatch_band);
      checked++;
    }
    expect(checked).toBe(CARRIER_POPULATION);
  });
});

describe('the seed contains NO scoring formula (one-engine rule)', () => {
  it('neither seed.sql nor the generated files re-express the weighted sum', () => {
    for (const [name, sql] of [
      ['seed.sql', seedSql],
      ['scores.generated.sql', scoresSql],
      ['carriers.generated.sql', carriersSql],
    ] as const) {
      expect(sql, `${name}: weight*column arithmetic`).not.toMatch(/0\.(15|20|25|40)\s*\*/);
      expect(sql, `${name}: column arithmetic`).not.toMatch(
        /(fleet|veh|drv|acc|fleet_size|vehicle_oos|driver_oos|accident_rate)\w*\s*[*+]/
      );
      expect(sql, `${name}: SQL banding`).not.toMatch(/case\s+when\s+overall/i);
      expect(sql, `${name}: overall assignment`).not.toMatch(/round\s*\(\s*0\.15/);
    }
    // The risk_scores VALUES must be pure literals — no numeric arithmetic at all.
    const block = scoresSql.slice(scoresSql.indexOf('values'));
    expect(block).not.toMatch(/\d\s*[*]\s*\d/);
  });
});

describe('canonical & directionality invariants (CLAUDE.md rules #1–#3)', () => {
  it('population is exactly 1,136 (4 named + 1,132 generated)', () => {
    expect(CARRIER_POPULATION).toBe(1136);
    expect(dataset.population).toBe(1136);
    expect(carriers.length).toBe(1136);
    expect(carriers.filter((c) => c.is_named).length).toBe(4);
  });

  it('HIGH = GOOD: no high composite is mislabeled or read as unsafe by score alone', () => {
    for (const c of carriers) {
      const { overall_score, quality_band, dispatch_band, hard_gate_triggered } = c.output;
      if (overall_score >= 80) expect(quality_band).toBe('excellent');
      if (overall_score >= 60 && overall_score < 80) expect(quality_band).toBe('good');
      if (overall_score < 40) expect(quality_band).toBe('poor');
      if (overall_score >= 60 && !hard_gate_triggered) {
        expect(dispatch_band === 'red' || dispatch_band === 'orange').toBe(false);
      }
    }
  });

  it('quality band is monotonic in the composite (0 directionality violations)', () => {
    const rank = { poor: 0, fair: 1, good: 2, excellent: 3 } as const;
    const sorted = [...carriers].sort((a, b) => a.output.overall_score - b.output.overall_score);
    for (let i = 1; i < sorted.length; i++) {
      expect(rank[sorted[i].output.quality_band as keyof typeof rank]).toBeGreaterThanOrEqual(
        rank[sorted[i - 1].output.quality_band as keyof typeof rank]
      );
    }
  });
});

describe('seed coverage (all bands + hard gates represented)', () => {
  it('all four dispatch bands appear', () => {
    const bands = new Set(carriers.map((c) => c.output.dispatch_band));
    for (const b of ['green', 'yellow', 'orange', 'red']) expect(bands.has(b)).toBe(true);
  });

  it('hard gates (revoked authority, conditional rating) force red', () => {
    const gated = carriers.filter((c) => c.output.hard_gate_triggered);
    expect(gated.some((c) => c.gates.authority_status === 'revoked' && c.output.dispatch_band === 'red')).toBe(true);
    expect(gated.some((c) => c.gates.safety_rating === 'conditional' && c.output.dispatch_band === 'red')).toBe(true);
  });

  it('thin-file carriers are routed to review, never auto-failed to red on sparse data', () => {
    const thin = carriers.filter((c) => c.gates.is_thin_file && !c.output.hard_gate_triggered);
    expect(thin.length).toBeGreaterThan(0);
    for (const c of thin) expect(c.output.dispatch_band).not.toBe('red');
  });
});
