import type { MemberRole, OrgStatus, OrgType } from '@maknaz/shared';
import type { NextFunction, Request, Response } from 'express';
import { cookiesSecure } from '../config.js';
import { db } from '../db.js';
import { now } from '../lib/clock.js';
import { randomToken, safeEqual, sha256Hex } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';

export const SESSION_COOKIE = 'mkz_session';
const SESSION_TTL_MS = 7 * 24 * 3_600_000;

export async function createSession(res: Response, req: Request, userId: string) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const expires = new Date(now().getTime() + SESSION_TTL_MS);
  const session = await db().userSession.create({
    data: {
      user_id: userId,
      token_hash: sha256Hex(token),
      csrf_token: csrf,
      expires_at: expires,
      ip: req.ip ?? null,
      user_agent: req.get('user-agent')?.slice(0, 300) ?? null,
    },
  });
  // SR-04: HttpOnly; Secure (outside local dev); SameSite=Lax.
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookiesSecure(),
    sameSite: 'lax',
    expires,
    path: '/',
  });
  return { sessionId: session.id, csrfToken: csrf };
}

export async function destroySession(res: Response, sessionId: string) {
  await db().userSession.deleteMany({ where: { id: sessionId } });
  res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, secure: cookiesSecure(), sameSite: 'lax' });
}

/** Loads the session (if any) into req.auth. Never fails the request by itself. */
export async function loadSession(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== 'string' || token.length < 20) return next();
  const session = await db().userSession.findUnique({
    where: { token_hash: sha256Hex(token) },
    include: {
      user: {
        include: {
          memberships: { where: { status: 'ACTIVE' }, include: { organization: true }, take: 1 },
        },
      },
    },
  });
  if (!session || session.expires_at <= now() || session.user.status !== 'ACTIVE') return next();
  const m = session.user.memberships[0];
  req.auth = {
    userId: session.user.id,
    email: session.user.email,
    fullName: session.user.full_name,
    isPlatformAdmin: session.user.is_platform_admin,
    sessionId: session.id,
    csrfToken: session.csrf_token,
    org: m
      ? {
          id: m.organization.id,
          type: m.organization.type as OrgType,
          status: m.organization.status as OrgStatus,
          legalNameAr: m.organization.legal_name_ar,
        }
      : null,
    membershipRole: (m?.role as MemberRole | undefined) ?? null,
  };
  next();
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** SR-01: every endpoint requires authentication except the explicit public ones. */
export function requireAuthentication(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(new AppError(401, 'UNAUTHENTICATED', 'يجب تسجيل الدخول.'));
  next();
}

/** SR-04: CSRF token (per session) required in X-CSRF-Token for authenticated writes. */
export function requireCsrf(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method) || !req.auth) return next();
  const header = req.get('x-csrf-token') ?? '';
  if (!safeEqual(header, req.auth.csrfToken)) {
    return next(new AppError(403, 'CSRF_TOKEN_INVALID', 'انتهت صلاحية الجلسة في هذه الصفحة؛ أعد تحميلها.'));
  }
  next();
}
