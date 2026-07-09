# Security Policy — Forrest RSOS

RSOS is a system of record for carrier due-diligence. It holds regulated data and
produces the contemporaneous record used for legal defense. Treat security as a
correctness requirement, not an add-on.

## Reporting a vulnerability
Report privately to the repository owner. Do not open a public issue for security
reports. Include reproduction steps and impact.

## Baseline controls (enforced in CI + review)
- **No committed secrets.** All credentials come from environment variables; see
  `.env.example`. CI runs a secret scan; `.env*` is git-ignored.
- **RLS enforces RBAC at the database.** Every table has row-level security; the
  ten-role matrix (per `docs/Forrest_RSOS_Project_Documentation.md`) is asserted in
  `tests/rls`. Application code is not the only line of defense.
- **`audit_logs` is append-only.** UPDATE/DELETE are revoked for app roles; DB
  triggers write on state changes. Records are archived/superseded, never deleted
  (VP-only delete, always audited).
- **MFA required** for privileged access; storage buckets are private.
- **Never auto-approve on degraded/stale data.** On FMCSA failure, reuse the last
  snapshot and set `integrations.status='degraded'`.
- **Enforcement is confirm-with-reason**, never one-click; each action writes a
  rationale and an immutable audit row.

## Governance flags (default off/dormant — team votes)
`FEATURE_DISPATCH_BLOCK_ENFORCING=false`, `FEATURE_AI_ASSISTANT=false`,
`FEATURE_COI_OCR=true` (parse-and-prefill only; never auto-approves).
