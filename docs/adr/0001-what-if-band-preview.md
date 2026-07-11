# ADR 0001 — What-if band-volume preview for the Q1 cutoff decision

- **Status:** Accepted
- **Date:** 2026-07-11
- **Deciders:** Richard (build); pending input from Matt (Q1 owner)
- **Context tags:** Open Question Q1 (R/Y/G thresholds), governance rule #4

## Context

Phase 1's scoring engine is code-complete, but two policy decisions remain open.
One of them — Q1, where the operational green/yellow/red dispatch cutoffs fall —
is a risk-tolerance judgment call that only Matt can make. The Phase 1 memo notes
that this is often easier to decide by **seeing the resulting queue volumes** than
in the abstract: tighter green lines catch more marginal carriers but grow the
manual triage queue; looser lines shrink review work but move more borderline
carriers unchecked.

CLAUDE.md forbids inventing thresholds (Q1) and the live `DISPATCH_DEFAULTS`
placeholders must stay untouched until Matt signs off. So we needed a way to show
the trade-off **without** writing any value into the live configuration.

## Decision

Add a **read-only what-if preview** (`packages/preview`) that scores a
deterministic fixture population at *candidate* green/yellow cutoffs and reports
the resulting band volumes and triage-queue size. It:

- reuses the **canonical** engine (`computeScore`) for the numeric score — no
  second scoring version; the score formula lives in `packages/scoring` alone;
- applies the *candidate* green/yellow lines in the preview's **own** banding
  helper (`packages/preview/src/band.ts`, `bandFor`), reading the engine's numeric
  score — it never asks the engine to band on other lines;
- **writes nothing** to config — every row is a what-if; Q1 stays open;
- runs against the canonical **1,136**-carrier count via a seeded, reproducible
  fixture generator (invented carriers only — no real data, no invented
  thresholds/weights/table-dictionary values);
- ships as a CLI (`npm run preview -- --green 75 --yellow 55`) so Matt can name a
  pair of cutoffs and see the dispatch bands + Danica's review queue immediately.

## Preview fence (the four invariants that keep this safe)

1. **Candidate cutoffs stay in the preview's own state.** The engine
   (`computeScore`) has exactly ONE behavior — it bands on `DISPATCH_DEFAULTS`
   only and takes no cutoff parameter. Candidate lines exist only inside
   `@forrest/preview` (`bandFor`), so no caller can make the single canonical
   scoring path band on arbitrary lines. (This invariant was tightened after the
   initial version, which had passed cutoffs into `computeScore`; that widened
   the engine's contract and is now reverted — see Amendment below.)
2. **Provisional labeling.** Every previewed pair is shown as a what-if; the CLI
   header states "WHAT-IF PREVIEW ONLY, nothing written to config."
3. **Read-only module.** No writes, no persistence, no I/O beyond printing.
4. **Nothing ratified.** `DISPATCH_DEFAULTS` is never mutated and no previewed
   pair is ever persisted as the live configuration; Q1 stays Matt's to decide.

## Amendment (post PR #5 / squash `9537167`)

The first cut of the preview reused the engine by giving `computeScore` an optional
`cutoffs` argument. That let any caller band on arbitrary lines through the single
canonical path, widening the engine's contract and undercutting the "one engine,
one behavior" invariant the directionality / anti-drift guardrails (PRs #2–#4)
depend on. **Resolution:** `computeScore` is restored to its two-argument single
behavior (bands on `DISPATCH_DEFAULTS` only), and candidate-cutoff banding moved
into `bandFor` in the preview package. Only the cutoff *comparison* (plus the same
hard-gate / open-flag / thin-file adjustments) moved — the scoring *formula* stays
in `packages/scoring`. Previewed volumes are byte-for-byte unchanged.

## Consequences

- Matt can pick the bands by looking at real volumes; when he signs off, the
  chosen pair is a one-line change to `DISPATCH_DEFAULTS` (Q1 closes).
- The preview is guardrail-tested to be deterministic and to leave the live
  config untouched (`packages/preview/src/preview.test.ts`).
- The fixture population is a stand-in for the real book; it is replaced by live
  data once the TMS/vendor-API connection (Decision 2, Richard) lands. The same
  preview then runs against real carriers unchanged.
- Blue Wire weights (Q2) remain a separate open question; this preview covers the
  cutoff half of Decision 1 only.
