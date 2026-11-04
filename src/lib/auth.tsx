import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import * as api from '../api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  ready: boolean;
  setUser: (u: User | null) => void;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const refresh = useCallback(async () => {
    setUser(await api.currentUser());
    setReady(true);
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);
  return <AuthCtx.Provider value={{ user, ready, setUser, refresh, signOut }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
export const isStaff = (u: User | null) => !!u && u.role !== 'participant';
