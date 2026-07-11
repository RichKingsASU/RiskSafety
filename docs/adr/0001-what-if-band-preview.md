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

- reuses the **canonical** engine (`computeScore`) — no second scoring version;
  cutoffs are passed as an optional override argument that defaults to the live
  `DISPATCH_DEFAULTS`, so the config remains the single source of truth;
- **writes nothing** to config — every row is a what-if; Q1 stays open;
- runs against the canonical **1,136**-carrier count via a seeded, reproducible
  fixture generator (invented carriers only — no real data, no invented
  thresholds/weights/table-dictionary values);
- ships as a CLI (`npm run preview -- --green 75 --yellow 55`) so Matt can name a
  pair of cutoffs and see the dispatch bands + Danica's review queue immediately.

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
