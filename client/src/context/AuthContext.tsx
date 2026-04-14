import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { AuthUser } from '../types';
import { apiUrl } from '../utils/api';

interface AuthContextValue {
  user: AuthUser | null;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  loginAsGuest: (displayName: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('pb_user');
    if (stored) {
      try { setUser(JSON.parse(stored)); } catch { localStorage.removeItem('pb_user'); }
    }
  }, []);

  const saveUser = (u: AuthUser) => {
    setUser(u);
    localStorage.setItem('pb_user', JSON.stringify(u));
  };

  const apiFetch = async (path: string, body: object) => {
    const res = await fetch(apiUrl(`/api/auth${path}`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  };

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true); setError(null);
    try {
      const data = await apiFetch('/login', { username, password });
      saveUser({ id: data.id, username: data.username, isGuest: false, token: data.token });
    } catch (e) {
      setError((e as Error).message);
    } finally { setIsLoading(false); }
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    setIsLoading(true); setError(null);
    try {
      const data = await apiFetch('/register', { username, password });
      saveUser({ id: data.id, username: data.username, isGuest: false, token: data.token });
    } catch (e) {
      setError((e as Error).message);
    } finally { setIsLoading(false); }
  }, []);

  const loginAsGuest = useCallback(async (displayName: string) => {
    setIsLoading(true); setError(null);
    try {
      const data = await apiFetch('/guest', { displayName });
      saveUser({ id: data.id, username: data.username, isGuest: true, token: data.token });
    } catch (e) {
      setError((e as Error).message);
    } finally { setIsLoading(false); }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem('pb_user');
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, register, loginAsGuest, logout, isLoading, error, clearError: () => setError(null) }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
