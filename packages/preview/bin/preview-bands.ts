// packages/preview/bin/preview-bands.ts
// CLI: preview dispatch/triage queue volumes at candidate green/yellow cutoffs
// against the 1,136-carrier fixture population. READ-ONLY — prints a table and
// exits; it never writes to config. This is the "name a pair of cutoffs and
// we'll show you the queues" tool from the Phase 1 memo.
//
// Usage:
//   npm run preview                         # live defaults + illustrative candidates
//   npm run preview -- --green 75 --yellow 55
//   npm run preview -- -s 80:60 -s 75:55 -s 70:50   # compare several
//   npm run preview -- --seed 12345 --count 1136
//
// Nothing here is written to the live configuration; every row is a what-if.

import { DISPATCH_DEFAULTS, type DispatchCutoffs } from '@forrest/shared/constants';
import { CARRIER_POPULATION } from '@forrest/shared/constants';
import { generateFixturePopulation, DEFAULT_SEED } from '../src/fixture-population.ts';
import { previewBands, type BandVolumes } from '../src/preview.ts';

interface Cli {
  scenarios: DispatchCutoffs[];
  seed: number;
  count: number;
  help: boolean;
}

function parsePair(raw: string): DispatchCutoffs {
  const parts = raw.split(':').map((n) => Number(n.trim()));
  const g = parts[0];
  const y = parts[1];
  if (g === undefined || y === undefined || !Number.isFinite(g) || !Number.isFinite(y)) {
    throw new Error(`bad scenario "${raw}" — expected green:yellow, e.g. 75:55`);
  }
  if (g < y) throw new Error(`green (${g}) must be >= yellow (${y}) in "${raw}"`);
  return { green_min: g, yellow_min: y };
}

function parseArgs(argv: string[]): Cli {
  const cli: Cli = { scenarios: [], seed: DEFAULT_SEED, count: CARRIER_POPULATION, help: false };
  let pendingGreen: number | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`missing value after ${a}`);
      return v;
    };
    switch (a) {
      case '-h':
      case '--help':
        cli.help = true;
        break;
      case '--green':
        pendingGreen = Number(next());
        break;
      case '--yellow': {
        const y = Number(next());
        if (pendingGreen === undefined) throw new Error('--yellow given without --green');
        cli.scenarios.push(parsePair(`${pendingGreen}:${y}`));
        pendingGreen = undefined;
        break;
      }
      case '-s':
      case '--scenario':
        cli.scenarios.push(parsePair(next()));
        break;
      case '--seed':
        cli.seed = Number(next());
        break;
      case '--count':
        cli.count = Number(next());
        break;
      default:
        throw new Error(`unknown argument: ${a}`);
    }
  }
  if (pendingGreen !== undefined) throw new Error('--green given without --yellow');
  return cli;
}

const HELP = `
Forrest RSOS — what-if band preview (READ-ONLY; writes nothing to config)

Preview how many carriers land in each dispatch band, and how big Danica's
triage review queue would be, at candidate green/yellow cutoffs.

  npm run preview                               live defaults + illustrative candidates
  npm run preview -- --green 75 --yellow 55     one candidate pair
  npm run preview -- -s 80:60 -s 72:52          compare several (green:yellow)
  npm run preview -- --seed 12345 --count 1136  vary the fixture population

Bands: green = clear to work · yellow = look first · orange = restricted
       red = blocked (hard gate or below yellow line).
Review queue = yellow + orange (the manual triage workload).
`;

const pad = (s: string | number, w: number) => String(s).padStart(w);

function labelFor(v: BandVolumes): string {
  const live =
    v.cutoffs.green_min === DISPATCH_DEFAULTS.green_min &&
    v.cutoffs.yellow_min === DISPATCH_DEFAULTS.yellow_min;
  return `g${v.cutoffs.green_min}/y${v.cutoffs.yellow_min}${live ? ' (live default)' : ''}`;
}

function printTable(rows: BandVolumes[]): void {
  const header = ['cutoffs', 'green', 'yellow', 'orange', 'red', 'review Q', '% pop'];
  const widths = [24, 7, 7, 7, 7, 9, 7];
  const line = (cells: (string | number)[]) =>
    cells.map((c, i) => pad(c, widths[i]!)).join(' ');

  console.log(line(header));
  console.log(widths.map((w) => '-'.repeat(w)).join(' '));
  for (const v of rows) {
    console.log(
      line([
        labelFor(v).padEnd(widths[0]!).slice(0, widths[0]!),
        v.dispatch.green,
        v.dispatch.yellow,
        v.dispatch.orange,
        v.dispatch.red,
        v.review_queue,
        `${v.review_queue_pct}%`,
      ]),
    );
  }
}

function main(): void {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    console.log(HELP);
    return;
  }

  const population = generateFixturePopulation(cli.count, cli.seed);

  // No candidate given -> show the live default plus a tighter and a looser
  // illustrative pair so the trade-off is visible at a glance. The extra rows are
  // derived as +/- offsets from the live default (no band numbers hardcoded here);
  // they are illustrations, NOT proposed values — the memo leaves the lines to Matt.
  const clampBand = (n: number) => Math.min(100, Math.max(0, n));
  const shifted = (delta: number): DispatchCutoffs => ({
    green_min: clampBand(DISPATCH_DEFAULTS.green_min + delta),
    yellow_min: clampBand(DISPATCH_DEFAULTS.yellow_min + delta),
  });
  const scenarios =
    cli.scenarios.length > 0
      ? cli.scenarios
      : [
          DISPATCH_DEFAULTS, // live default
          shifted(+15), // tighter (more review)
          shifted(-15), // looser (less review)
        ];

  const rows = scenarios.map((s) => previewBands(population, s));

  console.log(
    `\nFixture population: ${population.length} carriers ` +
      `(seed ${cli.seed}) — WHAT-IF PREVIEW ONLY, nothing written to config.\n`,
  );
  printTable(rows);

  const first = rows[0]!;
  console.log(
    `\nHard-gated (forced red regardless of score): ${first.hard_gated}` +
      ` · routed to review (thin file / open flag): ${first.routed_to_review}` +
      ` — constant across cutoffs.\n`,
  );
  console.log(
    'Quality bands (independent of cutoffs): ' +
      `excellent ${first.quality.excellent} · good ${first.quality.good} · ` +
      `fair ${first.quality.fair} · poor ${first.quality.poor}\n`,
  );
}

main();
