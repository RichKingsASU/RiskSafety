# @forrest/preview — what-if band-volume preview

**Read-only.** Preview how many carriers land in each dispatch band — and how big
the triage review queue would be — at *candidate* green/yellow cutoffs, computed
against a deterministic 1,136-carrier fixture population.

This is the "name a pair of cutoffs and see the queues" tool from the Phase 1
memo. It exists so the Q1 cutoff decision can be made by **looking at real
volumes** instead of in the abstract.

## Guarantees

- **Writes nothing to config.** The live `DISPATCH_DEFAULTS` (pending Q1 sign-off)
  are never mutated. Candidate cutoffs live only in this package. Every result is
  a what-if.
- **One scoring engine, one behavior.** The score comes from the canonical
  `computeScore` in `@forrest/scoring`, which bands on `DISPATCH_DEFAULTS` only and
  takes no cutoff parameter. Candidate green/yellow lines are applied here, in
  `bandFor` (`src/band.ts`), from the engine's numeric score — the scoring formula
  is never duplicated; only the cutoff comparison lives in this package.
- **No invented values.** The fixture carriers are invented *test data* (seeded,
  reproducible); no thresholds, weights, or table-dictionary values are invented.
- **Deterministic.** Same seed → identical population and identical preview.

## Usage

```bash
npm run preview                               # live defaults + illustrative candidates
npm run preview -- --green 75 --yellow 55     # one candidate pair
npm run preview -- -s 80:60 -s 72:52          # compare several (green:yellow)
npm run preview -- --seed 12345 --count 1136  # vary the fixture population
npm run preview -- --help
```

Bands: **green** = clear to work · **yellow** = look first · **orange** =
restricted · **red** = blocked (hard gate or below the yellow line). The review
queue = yellow + orange (the manual triage workload).

## API

```ts
import {
  generateFixturePopulation,
  previewBands,
  previewScenarios,
} from '@forrest/preview';

const pop = generateFixturePopulation();                 // 1,136 carriers
const v = previewBands(pop, { green_min: 75, yellow_min: 55 });
// v.dispatch.{green,yellow,orange,red}, v.review_queue, v.quality.*, v.hard_gated
```

When live carrier data replaces the fixture (Decision 2), the same functions run
against real carriers unchanged.
