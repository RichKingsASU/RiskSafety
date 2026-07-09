Grep the codebase for regressions against the CLAUDE.md non-negotiables and report
any hits with file:line. Check for:

1. **Score inversion** — anywhere a HIGH score is treated as dangerous/bad, or a
   band mapping that inverts Excellent≥80 / Good 60–79 / Fair 40–59 / Poor <40.
   Look for phrases like "high risk" tied to high scores, inverted comparisons.
2. **Second scoring implementation** — weighted-sum scoring logic outside
   `packages/scoring`. There must be exactly one engine.
3. **One-click enforcement** — restrict/suspend/decertify/add-to-DNU without a
   confirm-with-reason dialog and an audit-row write.
4. **Automated carrier outreach** — any email/SMS/call to carriers. Must not exist.
5. **Dispatch-block defaulting on** — `FEATURE_DISPATCH_BLOCK_ENFORCING` defaulting
   to `true`, or RED hard-blocking dispatch while the flag is false.
6. **Browser storage in client components** — `localStorage`/`sessionStorage`.
7. **Invented thresholds/weights** — R/Y/G or Blue Wire numbers hardcoded outside
   `packages/shared` (Q1/Q2 must stay config placeholders).
8. **Committed secrets** — keys/tokens in tracked files instead of env.

Report findings grouped by rule, or state "no guardrail regressions found."
