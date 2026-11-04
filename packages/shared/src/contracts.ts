// Response shapes shared by apps/api and apps/web (API_SPECIFICATION §2–3, §16).
import type {
  AppRole,
  LicenseReviewStatus,
  LicenseType,
  MemberRole,
  MemberStatus,
  OrgStatus,
  OrgType,
  RegionCode,
} from './enums.js';

export interface UserDto {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_platform_admin: boolean;
  created_at: string;
}

export interface OrganizationSummaryDto {
  id: string;
  type: OrgType;
  status: OrgStatus;
  legal_name_ar: string;
}

export interface MeResponse {
  user: UserDto;
  organization: OrganizationSummaryDto | null;
  membership_role: MemberRole | null;
  is_platform_admin: boolean;
  /** Convenience for routing; null when the user has no organization yet. */
  app_role: AppRole | null;
  csrf_token: string;
}

export interface OrganizationDto {
  id: string;
  type: OrgType;
  legal_name_ar: string;
  legal_name_en: string | null;
  commercial_registration_no: string;
  city: string;
  region_code: RegionCode;
  contact_email: string;
  contact_phone: string;
  status: OrgStatus;
  status_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrganizationPublicDto {
  id: string;
  type: OrgType;
  legal_name_ar: string;
  legal_name_en: string | null;
  city: string;
  region_code: RegionCode;
}

export interface MemberDto {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: MemberRole;
  status: MemberStatus;
  created_at: string;
}

export interface LicenseDto {
  id: string;
  license_type: LicenseType;
  license_number: string;
  issuing_authority: string;
  expires_on: string | null;
  review_status: LicenseReviewStatus;
  reviewed_at: string | null;
  created_at: string;
}

export interface AdminOrganizationDto extends OrganizationDto {
  members: MemberDto[];
  licenses: LicenseDto[];
}

export interface AuditLogDto {
  id: string;
  occurred_at: string;
  actor_type: string;
  actor_user_id: string | null;
  actor_user_name: string | null;
  actor_org_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before: unknown;
  after: unknown;
  request_id: string | null;
}

export interface PolicyDto {
  version_no: number;
  effective_from: string;
  values: Record<string, unknown>;
}

export interface ListResponse<T> {
  data: T[];
  page: { next_cursor: string | null; size: number; has_more: boolean };
}
