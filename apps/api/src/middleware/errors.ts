import type { ApiErrorBody } from '@maknaz/shared';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

function prismaToAppError(err: unknown): AppError | null {
  const e = err as { code?: string; meta?: Record<string, unknown>; message?: string; name?: string };
  if (e?.code === 'P2002') {
    return new AppError(409, 'STATE_CONFLICT', 'تعارض مع سجل موجود؛ أعد تحميل الصفحة.', { retryable: true });
  }
  if (e?.code === 'P2025') return new AppError(404, 'NOT_FOUND', 'المورد غير موجود.');
  // CHECK / EXCLUDE violations reaching this point mean a service-layer check was raced.
  if (/violates check constraint|violates exclusion constraint|immutable|append-only/i.test(e?.message ?? '')) {
    return new AppError(409, 'STATE_CONFLICT', 'تعذر تنفيذ العملية لأنها تخالف قيود البيانات؛ أعد تحميل الصفحة.', {
      retryable: true,
    });
  }
  return null;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  let appErr = err instanceof AppError ? err : prismaToAppError(err);
  if (!appErr) {
    const e = err as { type?: string; status?: number };
    if (e?.type === 'entity.parse.failed') {
      appErr = new AppError(400, 'VALIDATION_FAILED', 'صيغة الطلب غير صحيحة.');
    } else if (e?.type === 'entity.too.large' || e?.status === 413) {
      appErr = new AppError(413, 'FILE_TOO_LARGE', 'حجم الطلب أكبر من المسموح.');
    }
  }
  if (!appErr) {
    // Unexpected: log details server-side only (SR-14: no secrets in logs).
    logger.error({ err, request_id: req.requestId, path: req.path }, 'unhandled error');
    appErr = new AppError(500, 'INTERNAL_ERROR', 'حدث خطأ غير متوقع؛ حاول مرة أخرى.', { retryable: true });
  }
  const body: ApiErrorBody = {
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details ? { details: appErr.details } : {}),
      field_errors: appErr.fieldErrors,
      request_id: req.requestId,
      retryable: appErr.retryable,
    },
  };
  res.status(appErr.status).json(body);
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, 'NOT_FOUND', 'المسار غير موجود.'));
}
