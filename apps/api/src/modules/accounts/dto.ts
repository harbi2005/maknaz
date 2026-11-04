import type {
  LicenseDto,
  LicenseReviewStatus,
  LicenseType,
  MemberDto,
  MemberRole,
  MemberStatus,
  OrganizationDto,
  OrganizationPublicDto,
  OrgStatus,
  OrgType,
  RegionCode,
  UserDto,
} from '@maknaz/shared';
import type { Organization, OrganizationLicense, OrganizationMember, User } from '../../generated/prisma/client.js';
import { iso, isoDate } from '../../lib/serialize.js';

export const userDto = (u: User): UserDto => ({
  id: u.id,
  email: u.email,
  full_name: u.full_name,
  phone: u.phone,
  is_platform_admin: u.is_platform_admin,
  created_at: u.created_at.toISOString(),
});

export const organizationDto = (o: Organization): OrganizationDto => ({
  id: o.id,
  type: o.type as OrgType,
  legal_name_ar: o.legal_name_ar,
  legal_name_en: o.legal_name_en,
  commercial_registration_no: o.commercial_registration_no,
  city: o.city,
  region_code: o.region_code as RegionCode,
  contact_email: o.contact_email,
  contact_phone: o.contact_phone,
  status: o.status as OrgStatus,
  status_reason: o.status_reason,
  reviewed_at: iso(o.reviewed_at),
  created_at: o.created_at.toISOString(),
  updated_at: o.updated_at.toISOString(),
});

export const organizationPublicDto = (o: Organization): OrganizationPublicDto => ({
  id: o.id,
  type: o.type as OrgType,
  legal_name_ar: o.legal_name_ar,
  legal_name_en: o.legal_name_en,
  city: o.city,
  region_code: o.region_code as RegionCode,
});

export const memberDto = (m: OrganizationMember & { user: User }): MemberDto => ({
  id: m.id,
  user_id: m.user_id,
  full_name: m.user.full_name,
  email: m.user.email,
  role: m.role as MemberRole,
  status: m.status as MemberStatus,
  created_at: m.created_at.toISOString(),
});

export const licenseDto = (l: OrganizationLicense): LicenseDto => ({
  id: l.id,
  license_type: l.license_type as LicenseType,
  license_number: l.license_number,
  issuing_authority: l.issuing_authority,
  expires_on: isoDate(l.expires_on),
  review_status: l.review_status as LicenseReviewStatus,
  reviewed_at: iso(l.reviewed_at),
  created_at: l.created_at.toISOString(),
});
