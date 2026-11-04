import { loginSchema, registerSchema, type MeResponse } from '@maknaz/shared';
import { Router, type Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { db, transaction } from '../../db.js';
import { auth } from '../../lib/context.js';
import { now } from '../../lib/clock.js';
import { dummyPasswordHash, hashPassword, verifyPassword } from '../../lib/crypto.js';
import { AppError } from '../../lib/errors.js';
import { parse } from '../../lib/validate.js';
import { createSession, destroySession } from '../../middleware/session.js';
import { audit } from '../audit/audit.js';
import { userDto } from './dto.js';

export const authRouter = Router();

// SR-05: rate limit login and registration per IP.
const credentialLimiter = rateLimit({
  windowMs: 60_000,
  limit: process.env.APP_ENV === 'test' ? 1000 : 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, _res, next) => next(new AppError(429, 'RATE_LIMITED', 'محاولات كثيرة، حاول بعد دقيقة.')),
});

authRouter.post('/auth/register', credentialLimiter, async (req, res) => {
  const input = parse(registerSchema, req.body);
  const existing = await db().user.findFirst({ where: { email: { equals: input.email, mode: 'insensitive' } } });
  if (existing) {
    throw new AppError(409, 'EMAIL_TAKEN', 'يوجد حساب بهذا البريد الإلكتروني؛ سجّل الدخول أو استخدم بريدًا آخر.');
  }
  const password_hash = await hashPassword(input.password);
  const user = await transaction(async (tx) => {
    const u = await tx.user.create({
      data: { email: input.email, full_name: input.full_name, phone: input.phone ?? null, password_hash },
    });
    await audit(tx, { type: 'USER', userId: u.id, orgId: null, requestId: req.requestId, ip: req.ip ?? null }, {
      action: 'USER_REGISTERED',
      entityType: 'USER',
      entityId: u.id,
      after: { email: u.email, full_name: u.full_name },
    });
    return u;
  });
  // UX simplification: sign the new user in immediately so they can continue to organization setup.
  const s = await createSession(res, req, user.id);
  res.status(201).json({ user: userDto(user), csrf_token: s.csrfToken });
});

authRouter.post('/auth/login', credentialLimiter, async (req, res) => {
  const input = parse(loginSchema, req.body);
  const user = await db().user.findFirst({ where: { email: { equals: input.email, mode: 'insensitive' } } });
  // Equal work for unknown emails; one generic message (UI_UX SCR-AUTH-01).
  const ok = await verifyPassword(user?.password_hash ?? (await dummyPasswordHash()), input.password);
  if (!user || !ok) throw new AppError(401, 'INVALID_CREDENTIALS', 'البريد أو كلمة المرور غير صحيحة.');
  if (user.status !== 'ACTIVE') throw new AppError(403, 'ACCOUNT_DISABLED', 'هذا الحساب موقوف؛ تواصل مع إدارة المنصة.');
  await db().user.update({ where: { id: user.id }, data: { last_login_at: now() } });
  const s = await createSession(res, req, user.id);
  res.json({ user: userDto(user), csrf_token: s.csrfToken });
});

authRouter.post('/auth/logout', async (req, res) => {
  if (req.auth) await destroySession(res, req.auth.sessionId);
  res.status(204).end();
});

export async function buildMe(req: Request): Promise<MeResponse> {
  const a = auth(req);
  const user = await db().user.findUniqueOrThrow({ where: { id: a.userId } });
  return {
    user: userDto(user),
    organization: a.org
      ? { id: a.org.id, type: a.org.type, status: a.org.status, legal_name_ar: a.org.legalNameAr }
      : null,
    membership_role: a.membershipRole,
    is_platform_admin: a.isPlatformAdmin,
    app_role: a.isPlatformAdmin ? 'ADMIN' : (a.org?.type ?? null),
    csrf_token: a.csrfToken,
  };
}

authRouter.get('/me', async (req, res) => {
  res.json(await buildMe(req));
});
