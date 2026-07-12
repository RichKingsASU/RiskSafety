# ADR 0003 — Effective-dated governance config layer for Q1/Q2

- **Status:** Accepted (implementation; values still pending owner sign-off)
- **Supersedes:** the code-constant approach in ADR-0002 for the two keys below
- **Superseded by:** —
- **Date:** 2026-07-12
- **Owners of the values:** Matt (Q1 dispatch thresholds, Q2 Blue Wire weights)
- **Related:** [ADR-0002 — phase-1 decision gate](0002-phase-1-decision-gate.md) ·
  [ADR-0001 — what-if band preview](0001-what-if-band-preview.md) · CLAUDE.md Q1/Q2

## Context

ADR-0002 parked the two pending policy decisions as code constants in
`packages/shared/src/constants.ts` (`DISPATCH_BANDS_PROVISIONAL`, `BLUE_WIRE_WEIGHTS`,
`BLUE_WIRE_ENABLED`), with the plan that "when Q1/Q2 land, edit the constants." Two
problems with landing them as code:

1. **They're data, not code.** Matt's cutoffs/weights are policy values; requiring a
   code change + PR + deploy to set them couples a business decision to an engineering
   release.
2. **The due-diligence record needs history.** RSOS exists to manufacture a
   contemporaneous per-decision record (Montgomery). A dispatch decision made last
   month must be explainable against the thresholds that were **in force that day** —
   not whatever the current constant says. A single mutable constant cannot show that.

## Decision

Introduce an **effective-dated, append-only** config table `governance_config`
(migration `0006`) keyed by `config_key` ∈ {`dispatch_thresholds`, `blue_wire_weights`},
with `value jsonb`, `enabled`, `effective_from`, `created_by`. The **active** config
for a key as of a timestamp is the row with the greatest `effective_from <= ts`
(`config_active_as_of(key, ts)`). History is immutable: superseding a value is an
INSERT of a newer row, never an UPDATE/DELETE (enforced by RLS — SELECT-only for app
roles, no write policy; no destructive trigger).

A **pure** typed accessor in `@forrest/shared` (`governance-config.ts`) derives the
flags from a fetched set of rows + a timestamp:
- `dispatchBandsProvisional(ts)` = no active `dispatch_thresholds` row
- `blueWireEnabled(ts)` = active `blue_wire_weights` row exists **and** `enabled`
- `blueWireWeights(ts)` = active **and enabled** weights, else `null`

The historical constants remain as **thin wrappers over empty config**, so existing
importers keep working and their values are unchanged.

### Why append-only + effective-dated

The record must answer "what thresholds were in force when this load was cleared?"
Effective-dating makes that a pure function of the decision timestamp; append-only
guarantees the answer can't be rewritten after the fact. Reading config **as of the
decision time** (not `now()`) is the audit property — runtime surfaces must pass the
decision timestamp.

### Explicitly out of scope

- **The canonical model weights** (`0.15/0.20/0.25/0.40`) and `computeScore` in
  `packages/scoring` — untouched. This layer governs dispatch **eligibility** cutoffs
  and Blue Wire supplemental signal, **not** the FMCSA composite formula, which stays a
  single-source invariant.
- **Seeding any value.** The table ships empty; Q1/Q2 are still unratified and no
  number is invented (check-guardrails #7).
- **Wiring `computeScore` to read config thresholds**, and the **settings UI** — both
  deferred (post-auth; admin-only writes + RLS to come). Until then the engine keeps
  using its code default and the config layer supplies the provisional/enabled flags.

## Consequences

- **Fail closed.** When `governance_config` is empty, or has no entry active as of the
  decision time `T`, decisions resolve to the **most conservative** behavior —
  provisional banding, Blue Wire off, weights null — and **never** to a seeded or
  hardcoded default. This binds the Phase 2 implementer who wires `computeScore` to
  consume config: absent/inactive config must fall back to the safe/provisional path,
  never to a permissive assumed value.
- On **empty config** the system is byte-for-byte identical to today: dispatch
  provisional, Blue Wire disabled, no weights. (Proven in `tests/unit/governance-config.test.ts`.)
- When Q1 lands: INSERT a `dispatch_thresholds` row (data) → `dispatchBandsProvisional`
  flips to false as of that `effective_from`; no code change.
- When Q2 lands: INSERT an enabled `blue_wire_weights` row → weights resolve; a
  disabled row never yields weights, so Blue Wire cannot contribute invented numbers.
- Dispatch-block stays dormant behind `FEATURE_DISPATCH_BLOCK_ENFORCING` (unchanged).
