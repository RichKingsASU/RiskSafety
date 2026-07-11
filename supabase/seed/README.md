# Seed pipeline (`supabase/seed`)

This directory generates the local/dev seed for the carrier population. It is
built by importing the **canonical scoring engine**, never by re-expressing the
formula in SQL.

## The invariant (do not regress)

- The FMCSA weighted-sum formula lives in **exactly one place**:
  `packages/scoring`. Nothing here re-implements it.
- `dataset.mjs` holds **deterministic inputs only** (per-carrier sub-scores,
  gate inputs, confidence modifier) — no scoring arithmetic.
- `build.mjs` imports the engine (`@forrest/scoring`), computes each carrier's
  result, and emits **literals**:
  - `carriers.generated.sql` — the 1,132 generated carriers (`dispatch_band` /
    `status` are engine-computed literals).
  - `scores.generated.sql` — all 1,136 `risk_scores` rows (`overall_score` /
    `quality_band` / `dispatch_band` are engine-computed literals).
  - `dataset.generated.json` — frozen inputs + outputs the anti-drift test reads.
- The generated `.sql` files (and `seed.sql`, which `\ir`-includes them) carry
  **no weighted-sum arithmetic and no SQL banding** — only literal results.
- `dispatch_band='red'` / `status='dnu'` are **stored state only**, never an
  enforcement action (see the dispatch-block dormancy guarantee).

## What enforces the invariant

- `tests/unit/seed-scoring.test.ts` — anti-drift: recomputes from the frozen
  inputs via the engine and asserts the generated outputs still match.
- `tests/unit/directionality.golden.test.ts` — anchors HIGH = GOOD / LOW = POOR
  to hand-verified inputs, so the score direction can't silently flip.

If seed output ever disagrees with the engine, these tests fail — that is the
signal that someone hand-edited a generated file or forked the formula.

## Regenerating

```
npm run seed:build
```

- Requires **Node >= 22** — the build imports the canonical TypeScript engine
  directly and depends on Node 22 native TS type-stripping. `build.mjs` asserts
  the running major and exits non-zero with a clear message if it is older
  (`.nvmrc` pins 22; run `nvm use`).
- Output is **byte-deterministic**: two builds on Node 22 produce identical
  files, and CI runs `seed:build` then `git diff --exit-code` on the generated
  files to guarantee the committed output matches.

Never hand-edit the `*.generated.sql` or `dataset.generated.json` files —
regenerate instead.
