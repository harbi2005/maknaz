import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { addHours, now } from './clock.js';
import { sha256Hex } from './crypto.js';
import { AppError } from './errors.js';

const keySchema = z.string().min(8).max(100).regex(/^[A-Za-z0-9_-]+$/);

/**
 * ADR-008 / BR-043: critical actions require an Idempotency-Key. The same key with the same
 * body replays the stored response (Idempotent-Replayed: true); the same key with a different
 * body is rejected with 409 IDEMPOTENCY_KEY_REUSED. Records are kept for 24 hours.
 */
export function idempotent(handler: (req: Request, res: Response) => Promise<{ status: number; body: unknown }>): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.auth?.userId;
      if (!userId) throw new AppError(401, 'UNAUTHENTICATED', 'يجب تسجيل الدخول.');
      const parsedKey = keySchema.safeParse(req.get('idempotency-key'));
      if (!parsedKey.success) {
        throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'ترويسة Idempotency-Key مطلوبة لهذا الإجراء.');
      }
      const key = parsedKey.data;
      const endpoint = `${req.method} ${req.baseUrl}${req.route?.path ?? req.path}:${JSON.stringify(req.params)}`;
      const requestHash = sha256Hex(JSON.stringify(req.body ?? {}));

      const existing = await db().idempotencyRecord.findUnique({
        where: { user_id_endpoint_key: { user_id: userId, endpoint, key } },
      });
      if (existing && existing.expires_at > now()) {
        if (existing.request_hash !== requestHash) {
          throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'استُخدم مفتاح الطلب نفسه مع بيانات مختلفة.');
        }
        res.set('Idempotent-Replayed', 'true');
        res.status(existing.response_status).json(existing.response_body);
        return;
      }

      const result = await handler(req, res);
      if (result.status < 500) {
        await db().idempotencyRecord.upsert({
          where: { user_id_endpoint_key: { user_id: userId, endpoint, key } },
          create: {
            user_id: userId,
            endpoint,
            key,
            request_hash: requestHash,
            response_status: result.status,
            response_body: result.body as object,
            expires_at: addHours(now(), 24),
          },
          update: {
            request_hash: requestHash,
            response_status: result.status,
            response_body: result.body as object,
            created_at: now(),
            expires_at: addHours(now(), 24),
          },
        });
      }
      res.status(result.status).json(result.body);
    } catch (err) {
      next(err);
    }
  };
}
