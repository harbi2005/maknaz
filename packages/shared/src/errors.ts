// Error contract from docs/03-architecture/API_SPECIFICATION.md §1.2.

export const ERROR_CODES = [
  // 400
  'VALIDATION_FAILED',
  'INVALID_SORT',
  'IDEMPOTENCY_KEY_REQUIRED',
  'CSRF_TOKEN_INVALID',
  // 401
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  // 403
  'FORBIDDEN_ROLE',
  'ORG_NOT_ACTIVE',
  'MEMBERSHIP_REQUIRED',
  'ACCOUNT_DISABLED',
  // 404
  'NOT_FOUND',
  // 405
  'METHOD_NOT_ALLOWED',
  // 409
  'INVALID_STATE',
  'STATE_CONFLICT',
  'DUPLICATE_REGISTRATION',
  'ALREADY_MEMBER',
  'EMAIL_TAKEN',
  // 412
  'VERSION_MISMATCH',
  // 429
  'RATE_LIMITED',
  // 500
  'INTERNAL_ERROR',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number] | (string & {});

export interface FieldError {
  field: string;
  message: string;
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: Record<string, unknown>;
    field_errors: FieldError[];
    request_id: string;
    retryable: boolean;
  };
}
