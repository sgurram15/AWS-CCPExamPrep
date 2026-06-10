"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { apiPost, getToken, setToken } from "./api";

interface AuthState {
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setTok] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTok(getToken());
    setReady(true);
  }, []);

  const persist = (t: string) => {
    setToken(t);
    setTok(t);
  };

  const login = useCallback(async (email: string, password: string) => {
    const res = await apiPost<{ access_token: string }>("/auth/login", { email, password });
    persist(res.access_token);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const res = await apiPost<{ access_token: string }>("/auth/register", { email, password });
    persist(res.access_token);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setTok(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, ready, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
