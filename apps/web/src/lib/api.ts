import type { ApiErrorBody, FieldError } from '@maknaz/shared';

/** Error thrown for any non-2xx API response, carrying the documented error contract. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fieldErrors: FieldError[] = [],
    public requestId: string | null = null,
    public details: Record<string, unknown> | undefined = undefined,
  ) {
    super(message);
  }
}

let csrfToken = '';
export const setCsrf = (t: string) => {
  csrfToken = t;
};

const newKey = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

interface Opts {
  method?: string;
  body?: unknown;
  /** Critical actions send an Idempotency-Key (ADR-008). Pass a stable key to make retries safe. */
  idempotent?: boolean | string;
  ifMatch?: number;
  form?: FormData;
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const method = opts.method ?? (opts.body !== undefined || opts.form ? 'POST' : 'GET');
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.idempotent) headers['Idempotency-Key'] = typeof opts.idempotent === 'string' ? opts.idempotent : newKey();
  if (opts.ifMatch !== undefined) headers['If-Match'] = `"${opts.ifMatch}"`;

  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'تعذر الاتصال بالخادم؛ تحقق من اتصالك وحاول مرة أخرى.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const e = (json as ApiErrorBody | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'INTERNAL_ERROR', e?.message ?? 'حدث خطأ غير متوقع.', e?.field_errors ?? [], e?.request_id ?? res.headers.get('x-request-id'), e?.details);
  }
  return json as T;
}

export const post = <T = unknown>(path: string, body: unknown = {}, idempotent: boolean | string = true) =>
  api<T>(path, { method: 'POST', body, idempotent });

export function fieldErrorMap(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError)) return {};
  return Object.fromEntries(err.fieldErrors.map((f) => [f.field, f.message]));
}
