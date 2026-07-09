# workers

- `datahub-daily` — Phase 3. Download FMCSA DataHub → filter to TMS watchlist →
  normalize via `@forrest/fmcsa-adapter` → snapshot(+payload_hash) → diff
  authority/rating/insurance → emit safety_events. Never auto-approve on stale data.
- `sms-monthly` — monthly SMS pull.

Orchestrated by n8n. See `docs/Forrest_RSOS_Project_Documentation.md` (when provided).
