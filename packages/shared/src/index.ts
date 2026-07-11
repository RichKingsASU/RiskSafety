// packages/shared/src/index.ts
// Public surface of @forrest/shared.
//   ./constants — canonical numbers, weights, bands, feature flags, scoring types.
//   ./enums     — TypeScript mirror of the Postgres enums (kept in lockstep with
//                 supabase/migrations). One dictionary for app + workers + tests.
export * from './constants';
export * from './enums';
