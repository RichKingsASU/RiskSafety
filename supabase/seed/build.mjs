// supabase/seed/build.mjs
// SEED BUILD STEP (Node). Imports the CANONICAL scoring engine from
// packages/scoring, computes every carrier's score from its inputs, and emits:
//   * carriers.generated.sql    — the 1,132 generated carriers (literals)
//   * scores.generated.sql      — all 1,136 risk_scores (engine-emitted literals)
//   * dataset.generated.json    — frozen inputs+outputs the anti-drift test reads
//
// The FMCSA weighted-sum lives in exactly ONE place (packages/scoring). This script
// never re-expresses it; seed.sql `\ir`-includes the generated files, which contain
// NO scoring arithmetic — only literal results.
//
// Run:  npm run seed:build

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// RUNTIME NODE GUARD — fail loudly on the machine actually running this build.
// seed:build imports the canonical TS engine (@forrest/scoring) directly and
// relies on Node 22's native TS type-stripping. .nvmrc and package "engines"
// are soft guarantees (.nvmrc only binds runners that consult it; engines is
// advisory without --engine-strict), so assert the real runtime major here.
const REQUIRED_NODE_MAJOR = 22;
const runningNodeMajor = Number(process.versions.node.split('.')[0]);
if (!(runningNodeMajor >= REQUIRED_NODE_MAJOR)) {
  console.error(
    `seed:build requires Node >= ${REQUIRED_NODE_MAJOR} (running ${process.versions.node}).\n` +
      `This step imports the canonical TypeScript scoring engine directly and depends\n` +
      `on Node ${REQUIRED_NODE_MAJOR}+ native TS type-stripping. Use the pinned version\n` +
      `(.nvmrc = ${REQUIRED_NODE_MAJOR}; e.g. \`nvm use\`) and re-run \`npm run seed:build\`.`
  );
  process.exit(1);
}

const { computeScore } = await import('@forrest/scoring');
const { buildDataset, CARRIER_POPULATION, NAMED_COUNT } = await import('./dataset.mjs');

const here = dirname(fileURLToPath(import.meta.url));
const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);
const bool = (b) => (b ? 'true' : 'false');

/** carrier.status from dispatch band — STORED STATE ONLY, never enforcement. */
function statusForBand(band) {
  switch (band) {
    case 'red':
      return 'dnu';
    case 'orange':
      return 'restricted';
    case 'yellow':
      return 'onboarding';
    default:
      return 'approved';
  }
}

function score(records) {
  return records.map((r) => {
    const result = computeScore(r.inputs, r.gates);
    return {
      ...r,
      output: {
        overall_score: result.overall_score,
        quality_band: result.quality_band,
        dispatch_band: result.dispatch_band,
        hard_gate_triggered: result.hard_gate_triggered,
        routed_to_review: result.routed_to_review,
      },
    };
  });
}

function renderGeneratedCarriers(scored) {
  const gen = scored.filter((r) => !r.is_named);
  const lines = [];
  lines.push('-- supabase/seed/carriers.generated.sql');
  lines.push('-- GENERATED — do not edit by hand. Regenerate with `npm run seed:build`.');
  lines.push('-- The 1,132 generated carriers (population total = 1,136 with the 4 named).');
  lines.push('-- dispatch_band/status are LITERAL results from the packages/scoring engine.');
  lines.push('insert into carriers');
  lines.push('  (id, dot_number, mc_number, legal_name, authority_status, authority_grant_date,');
  lines.push('   safety_rating, power_unit_count, physical_address, ab5_status, identity_verified,');
  lines.push('   dispatch_band, status)');
  lines.push('values');
  const rows = gen.map((r) => {
    return `  (${[
      q(r.id),
      q(r.dot_number),
      q(r.mc_number),
      q(r.legal_name),
      `${q(r.gates.authority_status)}::authority_status`,
      q(r.authority_grant_date),
      `${q(r.gates.safety_rating)}::safety_rating`,
      String(r.power_unit_count),
      q(r.physical_address),
      `${q(r.ab5_status)}::ab5_status`,
      bool(r.identity_verified),
      `${q(r.output.dispatch_band)}::dispatch_band`,
      `${q(statusForBand(r.output.dispatch_band))}::carrier_status`,
    ].join(', ')})`;
  });
  lines.push(rows.join(',\n') + '\non conflict (dot_number) do nothing;');
  lines.push('');
  return lines.join('\n');
}

function renderScores(scored) {
  const lines = [];
  lines.push('-- supabase/seed/scores.generated.sql');
  lines.push('-- GENERATED — do not edit by hand. Regenerate with `npm run seed:build`.');
  lines.push('-- All 1,136 risk_scores. Every overall_score / quality_band / dispatch_band is a');
  lines.push('-- LITERAL emitted by the canonical engine in packages/scoring. NO weighted-sum');
  lines.push('-- arithmetic and NO SQL banding here — the scoring formula lives in ONE place.');
  lines.push('insert into risk_scores');
  lines.push('  (carrier_id, fleet_size_score, vehicle_oos_score, driver_oos_score,');
  lines.push('   accident_rate_score, overall_score, quality_band, confidence_modifier,');
  lines.push('   carrierassure_grade, divergence_flag, dispatch_band)');
  lines.push('values');
  const rows = scored.map((r) => {
    const i = r.inputs;
    return `  (${[
      q(r.id),
      String(i.fleet_size_score),
      String(i.vehicle_oos_score),
      String(i.driver_oos_score),
      String(i.accident_rate_score),
      String(r.output.overall_score),
      `${q(r.output.quality_band)}::quality_band`,
      i.confidence_modifier.toFixed(2),
      q(r.carrierassure_grade),
      bool(r.divergence_flag),
      `${q(r.output.dispatch_band)}::dispatch_band`,
    ].join(', ')})`;
  });
  lines.push(rows.join(',\n') + '\non conflict do nothing;');
  lines.push('');
  return lines.join('\n');
}

function renderJson(scored) {
  const carriers = scored.map((r) => ({
    id: r.id,
    fixture_key: r.fixture_key,
    is_named: r.is_named,
    inputs: r.inputs,
    gates: r.gates,
    carrierassure_grade: r.carrierassure_grade,
    divergence_flag: r.divergence_flag,
    output: r.output,
  }));
  return JSON.stringify(
    { generator: 'packages/scoring', population: CARRIER_POPULATION, named: NAMED_COUNT, carriers },
    null,
    2
  );
}

const records = buildDataset();
if (records.length !== CARRIER_POPULATION) {
  throw new Error(`expected ${CARRIER_POPULATION} carriers, built ${records.length}`);
}
const scored = score(records);

writeFileSync(join(here, 'carriers.generated.sql'), renderGeneratedCarriers(scored) + '\n');
writeFileSync(join(here, 'scores.generated.sql'), renderScores(scored) + '\n');
writeFileSync(join(here, 'dataset.generated.json'), renderJson(scored) + '\n');
console.log(
  `seed built: ${scored.length} carriers (${NAMED_COUNT} named + ${scored.length - NAMED_COUNT} generated) ` +
    `-> carriers.generated.sql, scores.generated.sql, dataset.generated.json`
);
