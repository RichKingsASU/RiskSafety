# Forrest RSOS — Risk & Safety Operating System

RSOS consolidates a fragmented carrier-vetting stack into one auditable system of
record for Forrest Logistics / Forrest Transportation. Its purpose is to
**manufacture a contemporaneous, per-carrier / per-load due-diligence record** —
the defense under *Montgomery v. Caribe Transport II* (SCOTUS 9-0, May 14 2026).

Users are **operational domain experts, not engineers.** UI copy is plain-language.

> **Read [`CLAUDE.md`](./CLAUDE.md) first.** It holds the non-negotiable rules
> (scoring direction, governance guardrails) and is the source of truth.

## Non-negotiables (see CLAUDE.md)
- **Scoring is the FMCSA scorecard and HIGH = GOOD.**
  `overall = 0.15·fleet + 0.20·vehicle_oos + 0.25·driver_oos + 0.40·accident_rate`.
  Bands: Excellent ≥80 · Good 60–79 · Fair 40–59 · Poor <40. Insurance/claims/
  compliance are **hard gates and flags**, never weighted inputs.
- **Dispatch eligibility ≠ quality band.** Hard gates force `red` regardless of score.
- Canonical carrier count **1,136**; own fleet ≈ **22** units (separate view).
- Enforcement is **confirm-with-reason**; **no automated carrier outreach**;
  **dispatch blocking ships dormant** behind `FEATURE_DISPATCH_BLOCK_ENFORCING=false`;
  COI OCR never auto-approves.

## Monorepo layout
```
apps/web                 Next.js (App Router) + Tailwind  (Phase 4)
packages/shared          canonical constants / enums / types  ✅ golden
packages/scoring         canonical FMCSA scorecard engine     ✅ golden + impl
packages/fmcsa-adapter   the ONLY raw-FMCSA → internal mapping site  (Phase 3 stub)
workers/datahub-daily    daily FMCSA sync                     (Phase 3)
workers/sms-monthly      monthly SMS sync                     (Phase 3)
n8n/                     orchestration                        (later)
supabase/migrations      schema + RLS + append-only audit     0001 golden; rest Phase 1
tests/{unit,integration,rls,e2e}                              per phase
docs/                    spec + build prompt + ADRs
```

## Commands
```bash
npm install
npm run test         # all vitest suites (scoring golden tests included)
npm run test:unit
npm run typecheck
```

## Build status
Scaffold + canonical scoring wired and tested. **Blocked** on: Supabase access
(Work4Vince org) and two missing spec docs — see
[`docs/STATUS.md`](./docs/STATUS.md).
