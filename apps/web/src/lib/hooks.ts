import { useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';
import { useRef } from 'react';
import { useToast } from '../components/toast';
import { api, ApiError } from './api';

export function useApi<T>(key: unknown[], path: string | null, opts: Partial<UseQueryOptions<T>> = {}) {
  return useQuery<T>({ queryKey: key, queryFn: () => api<T>(path!), enabled: path !== null, ...opts });
}

/**
 * A server action with: one stable Idempotency-Key per attempt (safe retries), a success toast,
 * cache refresh, and automatic reload on 409 state conflicts (UI_UX §1.4).
 */
export function useAction<TBody = unknown, TRes = unknown>(
  fn: (body: TBody, idemKey: string) => Promise<TRes>,
  opts: { success?: string; invalidate?: unknown[][]; onSuccess?: (res: TRes) => void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  const key = useRef<string>(crypto.randomUUID());
  const m = useMutation<TRes, unknown, TBody>({
    mutationFn: (body) => fn(body, key.current),
    onSuccess: (res) => {
      key.current = crypto.randomUUID();
      if (opts.success) toast(opts.success);
      for (const k of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: k });
      void qc.invalidateQueries({ queryKey: ['unread'] });
      opts.onSuccess?.(res);
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        // The record changed (or the key was consumed): refresh and use a new key next time.
        key.current = crypto.randomUUID();
        for (const k of opts.invalidate ?? []) void qc.invalidateQueries({ queryKey: k });
      }
    },
  });
  return m;
}

export const postAction = <TRes = unknown>(path: string) => (body: unknown, idem: string) =>
  api<TRes>(path, { method: 'POST', body: body ?? {}, idempotent: idem });
