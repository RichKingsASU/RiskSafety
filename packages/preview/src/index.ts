// packages/preview/src/index.ts
// Public surface of @forrest/preview — the what-if band-volume preview tool.
// Read-only: previews candidate green/yellow cutoffs against a deterministic
// fixture population. Writes nothing to config (Open Question Q1 stays open).
export * from './fixture-population.ts';
export * from './preview.ts';
