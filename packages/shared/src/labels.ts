import type {
  LicenseReviewStatus,
  LicenseType,
  MemberRole,
  OrgStatus,
  OrgType,
  RegionCode,
} from './enums.js';

export const ORG_TYPE_LABELS: Record<OrgType, string> = {
  FACTORY: 'مصنع',
  MINE: 'منجم',
  CARRIER: 'ناقل',
};

export const ORG_TYPE_DESCRIPTIONS: Record<OrgType, string> = {
  FACTORY: 'تبحث عن مواد خام ثانوية وتقدم عروض شراء.',
  MINE: 'تعرض المواد والمخلفات التعدينية القابلة للتقييم.',
  CARRIER: 'تقدم خدمات نقل المواد بين المناجم والمصانع.',
};

export const ORG_STATUS_LABELS: Record<OrgStatus, string> = {
  PENDING_REVIEW: 'قيد المراجعة',
  ACTIVE: 'نشطة',
  REJECTED: 'مرفوضة',
  SUSPENDED: 'معلقة',
};

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  OWNER: 'مالك',
  MEMBER: 'عضو',
};

export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  COMMERCIAL_TRANSPORT: 'ترخيص نقل تجاري',
  WASTE_TRANSPORT_PERMIT: 'تصريح نقل نفايات',
  MINING_LICENSE: 'رخصة تعدين',
  OTHER: 'أخرى',
};

export const LICENSE_REVIEW_LABELS: Record<LicenseReviewStatus, string> = {
  NOT_REVIEWED: 'لم تتم المراجعة',
  REVIEWED_DOCUMENT_PRESENT: 'روجع: المستند موجود',
  REVIEWED_ISSUE_FOUND: 'روجع: توجد ملاحظة',
};

export const REGION_LABELS: Record<RegionCode, string> = {
  RIYADH: 'منطقة الرياض',
  MAKKAH: 'منطقة مكة المكرمة',
  MADINAH: 'منطقة المدينة المنورة',
  EASTERN: 'المنطقة الشرقية',
  QASSIM: 'منطقة القصيم',
  ASIR: 'منطقة عسير',
  TABUK: 'منطقة تبوك',
  HAIL: 'منطقة حائل',
  NORTHERN_BORDERS: 'منطقة الحدود الشمالية',
  JAZAN: 'منطقة جازان',
  NAJRAN: 'منطقة نجران',
  AL_BAHA: 'منطقة الباحة',
  AL_JOUF: 'منطقة الجوف',
};
