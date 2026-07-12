# ADR 0002 — Phase 1 decision gate: two policy calls before go-live

- **Status:** Proposed (awaiting owner sign-off)
- **Supersedes:** —
- **Superseded by:** — _(when Q1/Q2 land, this ADR moves to `Superseded by ADR-0003`,
  which records the ratified numbers; do not silently contradict this one with new
  config.)_
- **Date:** 2026-07-11
- **Owners of the open decisions:** Matt (Q1, Q2) · Richard (TMS + vendor API)
- **Related:** CLAUDE.md Open Questions Q1, Q2, Q5 · `docs/STATUS.md` ·
  [ADR-0001 — what-if band preview](0001-what-if-band-preview.md) (the preview
  mechanism this gate's cutoff-preview guardrail refers to)

> **Numbering note.** This ADR was rescued from the stray branch
> `claude/rsos-phase-1-decisions-92bvwi`, where it was authored as "ADR-0001".
> Current `main` already has ADR-0001 (what-if band preview), so it is renumbered
> to **0002** here. The forward-looking "ratified numbers" ADR it anticipates is
> therefore **ADR-0003**, not 0002.

## Context

The RSOS carrier scoring engine is code-complete for Phase 1:

- The scoring math lives in exactly one place (`packages/scoring`), driven entirely
  by config in `packages/shared/src/constants.ts` — no inlined magic numbers.
- The core invariant is locked: **HIGH score = GOOD carrier.** Hard gates force
  dispatch RED regardless of score; thin files route to review rather than
  auto-fail; open flags gate an otherwise-green carrier to review.
- The full 1,136-carrier **fixture** population runs through it cleanly. Golden
  and decision-gate tests are green (`npm run test`).

What remains before Phase 1 can move from "works on invented data" to "live on the
real book" is **not engineering** — it is a small set of judgment calls that only
their owners can make. CLAUDE.md forbids inventing these values, so the code holds
explicit, honestly-unset placeholders rather than guesses.

## The two decisions

### Decision 1 — Matt

**1a. Operational green / yellow / red dispatch cutoffs (Q1).**
Distinct from the fixed quality bands (Excellent/Good/Fair/Poor). These are the
lines the triage reviewer (Danica) and the dispatch view react to. A risk-tolerance
trade: tighter lines catch more marginal carriers up front but grow the manual
review queue; looser lines cut review load but let more borderline carriers move.

- **Config slot:** `DISPATCH_DEFAULTS.green_min` / `.yellow_min` (red = below yellow),
  flagged `DISPATCH_BANDS_PROVISIONAL = true` until ratified.
- **Ask:** the green cutoff and the yellow cutoff. Rough is fine to start — we can
  preview the resulting triage/dispatch queue volumes against the fixture population
  and adjust. **Preview guardrail:** candidate cutoffs are what-if inputs held in the
  preview's own state (`@forrest/preview`, see ADR-0001), visibly labeled provisional,
  read alongside `DISPATCH_BANDS_PROVISIONAL`; they are NEVER written to
  `DISPATCH_DEFAULTS` or persisted as ratified. Only Matt's sign-off (→ ADR-0003)
  moves a number into config.

**1b. Blue Wire supplemental weights (Q2).**
How much the Blue Wire supplemental signal counts. Owned by Matt (not Damien/Dave).
Signal set + weights come from the two outstanding Blue Wire source docs.

- **Config slot:** `BLUE_WIRE_WEIGHTS` (currently `null`) + `BLUE_WIRE_ENABLED`
  (currently `false`). While unset, Blue Wire contributes nothing to anything the
  platform shows — enabling it with a null/empty weight map is guarded against.
- **Ask:** the weight each Blue Wire signal should carry (plus the two source docs).

### Decision 2 — Richard

**TMS integration + vendor API access (Q5).**
Everything today runs on the fixture population. Going live needs the TMS access path
(how we read real carrier records) and the vendor API credentials/endpoints for the
FMCSA-sourced inputs the score depends on — or a pointer to whoever holds them.

- **Config slot:** `.env` — `TMS_API_BASE_URL` / `TMS_API_KEY`, `FMCSA_*`
  (see `.env.example`). Connector is interface-first: Phase 1 = watchlist import +
  queued write-back.

## What stays frozen until these land

Deliberately not guessed at:

- **Q1 / Q2 configuration** — the band cutoffs and Blue Wire weights *are* the values
  that go in the slots above.
- **The table dictionary** — still a placeholder; CLAUDE.md forbids inventing it.
- **The do-not-use and load-check tables** — depend on the table dictionary, so there
  is nothing for the platform to *enforce* yet.
- **Turning on dispatch blocking (Q15)** — ships dormant
  (`FEATURE_DISPATCH_BLOCK_ENFORCING=false`); RED is a strong recommendation until the
  team ratifies enforcing mode, and even then only once the underlying tables exist.

## Decision

Pending. This ADR records the gate; it will be updated to **Accepted** (with the
agreed numbers and a link to the change that sets them) once each owner signs off.
No default is treated as ratified in the meantime.

## Consequences

- Nothing breaks while the decisions are open — Phase 1 simply stays a tested model
  on fixture data rather than a live view of the real carrier book.
- When Q1/Q2 land: update `DISPATCH_DEFAULTS`, set `DISPATCH_BANDS_PROVISIONAL=false`,
  populate `BLUE_WIRE_WEIGHTS` + set `BLUE_WIRE_ENABLED=true` — all in `packages/shared`,
  one place. The decision-gate tests then assert the new values stay internally valid.
- When TMS + vendor access land: fill the `.env` slots and swap the fixture source for
  the live connector. The same tested engine scores the real carriers unchanged.
