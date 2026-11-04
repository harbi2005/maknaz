import type { ErrorCode, FieldError } from '@maknaz/shared';
import type { ZodError } from 'zod';

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly details: Record<string, unknown> | undefined;
  readonly fieldErrors: FieldError[];
  readonly retryable: boolean;

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    opts: { details?: Record<string, unknown>; fieldErrors?: FieldError[]; retryable?: boolean } = {},
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = opts.details;
    this.fieldErrors = opts.fieldErrors ?? [];
    this.retryable = opts.retryable ?? false;
  }
}

export const notFound = () => new AppError(404, 'NOT_FOUND', 'المورد غير موجود.');

export const forbiddenRole = () =>
  new AppError(403, 'FORBIDDEN_ROLE', 'لا تملك صلاحية تنفيذ هذا الإجراء.');

export const orgNotActive = (status?: string) =>
  new AppError(403, 'ORG_NOT_ACTIVE', 'جهتك ليست نشطة بعد؛ لا يمكن تنفيذ إجراءات تجارية حتى تعتمدها الإدارة.', {
    details: status ? { organization_status: status } : undefined,
  });

export const invalidState = (message = 'لا تسمح حالة السجل الحالية بهذا الإجراء.', details?: Record<string, unknown>) =>
  new AppError(409, 'INVALID_STATE', message, { details });

export const stateConflict = () =>
  new AppError(409, 'STATE_CONFLICT', 'تغيرت حالة هذا السجل؛ أعد تحميل الصفحة.', { retryable: true });

export const unprocessable = (code: ErrorCode, message: string, details?: Record<string, unknown>) =>
  new AppError(422, code, message, { details });

export const conflict = (code: ErrorCode, message: string, details?: Record<string, unknown>) =>
  new AppError(409, code, message, { details });

export function validationError(err: ZodError): AppError {
  return new AppError(400, 'VALIDATION_FAILED', 'تحقق من الحقول المدخلة.', {
    fieldErrors: err.issues.map((i) => ({ field: i.path.join('.') || '_', message: i.message })),
  });
}
