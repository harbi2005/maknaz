import type { MeResponse } from '@maknaz/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, type ReactNode } from 'react';
import { api, ApiError, setCsrf } from './lib/api';

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  refresh: () => Promise<unknown>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        const me = await api<MeResponse>('/me');
        setCsrf(me.csrf_token);
        return me;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
  const value: AuthState = {
    me: q.data ?? null,
    loading: q.isLoading,
    refresh: () => qc.invalidateQueries({ queryKey: ['me'] }),
    logout: async () => {
      await api('/auth/logout', { method: 'POST' }).catch(() => {});
      setCsrf('');
      qc.clear();
      window.location.assign('/login');
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
}

/** The current organization context; components under RequireOrg can rely on it. */
export function useOrg() {
  const { me } = useAuth();
  return { org: me?.organization ?? null, role: me?.app_role ?? null, isOwner: me?.membership_role === 'OWNER', active: me?.organization?.status === 'ACTIVE' };
}
