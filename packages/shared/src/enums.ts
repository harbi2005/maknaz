// Domain enums. Values mirror the CHECK constraints in docs/03-architecture/DATABASE_DESIGN.md.

export const ORG_TYPES = ['FACTORY', 'MINE', 'CARRIER'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

export const ORG_STATUSES = ['PENDING_REVIEW', 'ACTIVE', 'REJECTED', 'SUSPENDED'] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

export const MEMBER_ROLES = ['OWNER', 'MEMBER'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const MEMBER_STATUSES = ['INVITED', 'ACTIVE', 'REMOVED'] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const USER_STATUSES = ['ACTIVE', 'DISABLED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Application-level role used by the web app for routing. Derived from the
 * organization type, or ADMIN for platform administrators (is_platform_admin).
 * The platform admin is NOT an organization member (RBAC_MATRIX §2).
 */
export const APP_ROLES = ['MINE', 'FACTORY', 'CARRIER', 'ADMIN'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const LICENSE_TYPES = [
  'COMMERCIAL_TRANSPORT',
  'WASTE_TRANSPORT_PERMIT',
  'MINING_LICENSE',
  'OTHER',
] as const;
export type LicenseType = (typeof LICENSE_TYPES)[number];

export const LICENSE_REVIEW_STATUSES = [
  'NOT_REVIEWED',
  'REVIEWED_DOCUMENT_PRESENT',
  'REVIEWED_ISSUE_FOUND',
] as const;
export type LicenseReviewStatus = (typeof LICENSE_REVIEW_STATUSES)[number];

/**
 * The 13 administrative regions of Saudi Arabia.
 * ASSUMPTION: the docs require "region_code from the 13 administrative regions"
 * but only spell out MAKKAH; these codes are the engineering convention used here.
 */
export const REGION_CODES = [
  'RIYADH',
  'MAKKAH',
  'MADINAH',
  'EASTERN',
  'QASSIM',
  'ASIR',
  'TABUK',
  'HAIL',
  'NORTHERN_BORDERS',
  'JAZAN',
  'NAJRAN',
  'AL_BAHA',
  'AL_JOUF',
] as const;
export type RegionCode = (typeof REGION_CODES)[number];

export const AUDIT_ACTOR_TYPES = ['USER', 'SYSTEM', 'ADMIN'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
