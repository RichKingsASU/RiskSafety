# tests

- `unit` — pure logic (scoring golden tests live next to source in `packages/scoring`).
- `integration` — service + DB wiring (Phase 2+).
- `rls` — asserts the ten-role RBAC matrix at the database (Phase 1). Needs the
  RBAC matrix from `docs/Forrest_RSOS_Project_Documentation.md`.
- `e2e` — Phase 6 scenarios: pre-screen RED hard-stop, conditional-rating block,
  yellow→GREEN remediation w/ dossier, auto-decertify → write-back + DNU, load
  block on lapsed insurance, dual-approval remittance.
