import type { MemberRole, OrgStatus, OrgType } from '@maknaz/shared';
import type { Request } from 'express';
import { AppError } from './errors.js';

export interface AuthContext {
  userId: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  sessionId: string;
  csrfToken: string;
  org: { id: string; type: OrgType; status: OrgStatus; legalNameAr: string } | null;
  membershipRole: MemberRole | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    requestId: string;
    auth?: AuthContext;
  }
}

export function auth(req: Request): AuthContext {
  if (!req.auth) throw new AppError(401, 'UNAUTHENTICATED', 'يجب تسجيل الدخول.');
  return req.auth;
}

/**
 * RBAC layer 1 (RBAC_MATRIX §1): the user must belong to an organization of one of the
 * given types. The organization always comes from the session, never the request body (SEC-03).
 */
export function requireOrg(req: Request, ...types: OrgType[]): NonNullable<AuthContext['org']> & { role: MemberRole } {
  const a = auth(req);
  if (a.isPlatformAdmin) throw new AppError(403, 'FORBIDDEN_ROLE', 'هذا الإجراء مخصص للجهات وليس لإدارة المنصة.');
  if (!a.org || !a.membershipRole) {
    throw new AppError(403, 'MEMBERSHIP_REQUIRED', 'أنشئ جهتك أولًا أو انضم إلى جهة.');
  }
  if (types.length > 0 && !types.includes(a.org.type)) throw new AppError(403, 'FORBIDDEN_ROLE', 'لا تملك صلاحية تنفيذ هذا الإجراء.');
  return { ...a.org, role: a.membershipRole };
}

/** Commercial actions additionally require an ACTIVE organization (BR-002). */
export function requireActiveOrg(req: Request, ...types: OrgType[]) {
  const org = requireOrg(req, ...types);
  if (org.status !== 'ACTIVE') {
    throw new AppError(403, 'ORG_NOT_ACTIVE', 'جهتك ليست نشطة؛ لا يمكن تنفيذ إجراءات تجارية حتى تعتمدها الإدارة.', {
      details: { organization_status: org.status },
    });
  }
  return org;
}

export function requireAdmin(req: Request): AuthContext {
  const a = auth(req);
  if (!a.isPlatformAdmin) throw new AppError(403, 'FORBIDDEN_ROLE', 'هذه الصفحة لإدارة المنصة فقط.');
  return a;
}
