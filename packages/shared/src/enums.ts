// packages/shared/src/enums.ts
// TypeScript mirror of the Postgres enums defined in supabase/migrations
// (0001_init.sql + 0002_schema.sql). ONE dictionary shared by the app, workers,
// and tests — keep this in lockstep with the migrations. Values are the exact
// DB enum labels (snake_case) so they round-trip without translation.

export const AUTHORITY_STATUS = ['active', 'inactive', 'revoked', 'pending'] as const;
export const SAFETY_RATING = ['satisfactory', 'conditional', 'unsatisfactory', 'unrated'] as const;
export const QUALITY_BAND = ['excellent', 'good', 'fair', 'poor'] as const; // HIGH = GOOD
export const DISPATCH_BAND = ['green', 'yellow', 'orange', 'red'] as const; // eligibility
export const CARRIER_STATUS = ['prospect', 'onboarding', 'approved', 'restricted', 'suspended', 'dnu'] as const;
export const SEVERITY_LEVEL = ['low', 'medium', 'high', 'critical'] as const;
export const SAFETY_EVENT_TYPE = ['inspection', 'crash', 'oos', 'violation'] as const;
export const SEVERITY_CLASS = ['administrative', 'minor', 'safety_critical'] as const;
export const SNAPSHOT_SOURCE = ['qcmobile', 'datahub', 'sms'] as const;

export const AB5_STATUS = ['compliant', 'non_compliant', 'attested', 'na'] as const;
export const QUALIFICATION_STATUS = ['qualified', 'pending', 'disqualified'] as const;
export const EQUIPMENT_STATUS = ['active', 'inactive', 'maintenance', 'out_of_service'] as const;

export const POLICY_TYPE = ['auto_liability', 'cargo', 'trailer_interchange', 'workers_comp'] as const;
export const POLICY_SOURCE = ['coi', 'fmcsa_filing'] as const;
export const CERTIFICATE_TYPE = ['coi', 'w9', 'authority_letter', 'ab5_attestation'] as const;
export const CERTIFICATE_STATUS = ['valid', 'expiring', 'expired', 'invalid'] as const;
export const DOCUMENT_ENTITY_TYPE = ['carrier', 'driver', 'claim', 'incident', 'load'] as const;
export const DOC_TYPE = ['coi', 'police_report', 'attestation', 'inspection'] as const;

export const CLAIM_TYPE = ['cargo', 'accident', 'liability', 'shortage'] as const;
export const CLAIM_STATUS = ['open', 'investigating', 'pending', 'resolved', 'denied'] as const;
export const AT_FAULT = ['carrier', 'not_carrier', 'undetermined'] as const;
export const INCIDENT_TYPE = ['accident', 'cargo_theft', 'double_brokering', 'cyber', 'other'] as const;
export const INCIDENT_STATUS = ['open', 'contained', 'resolved'] as const;

export const TASK_TYPE = ['coi_renewal', 'review', 'audit', 'remediation'] as const;
export const TASK_STATUS = ['todo', 'in_progress', 'blocked', 'done'] as const;

export const VALUE_TIER = ['standard', 'elevated', 'high_value'] as const;
export const LOAD_CHECK_RESULT = ['cleared', 'blocked', 'exception_approved'] as const;
export const LINK_TYPE = ['shared_phone', 'shared_address', 'shared_officer'] as const;
export const REMEDIATION_DECISION = ['advanced_green', 'restricted', 'recommend_dnu', 'escalated'] as const;

export const FLEET_EVENT_TYPE = ['harsh_event', 'hos', 'inspection'] as const;
export const FLEET_SOURCE = ['samsara'] as const;

export const INTEGRATION_NAME = ['qcmobile', 'datahub', 'sms', 'rmis', 'highway', 'carrier411', 'carrierassure', 'tms', 'samsara'] as const;
export const INTEGRATION_AUTH_TYPE = ['api_key', 'oauth', 'login_gov_webkey', 'file'] as const;
export const INTEGRATION_STATUS = ['healthy', 'degraded', 'failed', 'disabled'] as const;

export const NOTIFICATION_TYPE = ['coi_expiring', 'dot_inactive', 'claim_opened', 'load_blocked', 'task_overdue', 'divergence', 'anomaly'] as const;
export const NOTIFICATION_CHANNEL = ['in_app', 'email', 'teams', 'dashboard'] as const;
export const NOTIFICATION_SEVERITY = ['info', 'warning', 'critical'] as const;

/** The ten DB roles (Project Documentation §5). Enforced at the DB via RLS (0003). */
export const APP_ROLES = [
  'r_s_vp',
  'safety_manager',
  'triage_reviewer',
  'deep_dive_analyst',
  'blue_wire_owner',
  'ops_manager',
  'dispatcher',
  'claims_coordinator',
  'accounting_admin',
  'external_carrier',
] as const;

// ---- Types derived from the const arrays (single source of truth) ----
export type SafetyEventType = (typeof SAFETY_EVENT_TYPE)[number];
export type SeverityLevel = (typeof SEVERITY_LEVEL)[number];
export type SeverityClass = (typeof SEVERITY_CLASS)[number];
export type SnapshotSource = (typeof SNAPSHOT_SOURCE)[number];
export type CarrierStatus = (typeof CARRIER_STATUS)[number];
export type Ab5Status = (typeof AB5_STATUS)[number];
export type QualificationStatus = (typeof QUALIFICATION_STATUS)[number];
export type EquipmentStatus = (typeof EQUIPMENT_STATUS)[number];
export type PolicyType = (typeof POLICY_TYPE)[number];
export type PolicySource = (typeof POLICY_SOURCE)[number];
export type CertificateType = (typeof CERTIFICATE_TYPE)[number];
export type CertificateStatus = (typeof CERTIFICATE_STATUS)[number];
export type DocumentEntityType = (typeof DOCUMENT_ENTITY_TYPE)[number];
export type DocType = (typeof DOC_TYPE)[number];
export type ClaimType = (typeof CLAIM_TYPE)[number];
export type ClaimStatus = (typeof CLAIM_STATUS)[number];
export type AtFault = (typeof AT_FAULT)[number];
export type IncidentType = (typeof INCIDENT_TYPE)[number];
export type IncidentStatus = (typeof INCIDENT_STATUS)[number];
export type TaskType = (typeof TASK_TYPE)[number];
export type TaskStatus = (typeof TASK_STATUS)[number];
export type ValueTier = (typeof VALUE_TIER)[number];
export type LoadCheckResult = (typeof LOAD_CHECK_RESULT)[number];
export type LinkType = (typeof LINK_TYPE)[number];
export type RemediationDecision = (typeof REMEDIATION_DECISION)[number];
export type FleetEventType = (typeof FLEET_EVENT_TYPE)[number];
export type FleetSource = (typeof FLEET_SOURCE)[number];
export type IntegrationName = (typeof INTEGRATION_NAME)[number];
export type IntegrationAuthType = (typeof INTEGRATION_AUTH_TYPE)[number];
export type IntegrationStatus = (typeof INTEGRATION_STATUS)[number];
export type NotificationType = (typeof NOTIFICATION_TYPE)[number];
export type NotificationChannel = (typeof NOTIFICATION_CHANNEL)[number];
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITY)[number];
export type AppRole = (typeof APP_ROLES)[number];

// AuthorityStatus, SafetyRating, QualityBand, DispatchBand types are exported
// from ./constants (used by the scoring engine) — re-exported via the barrel.
