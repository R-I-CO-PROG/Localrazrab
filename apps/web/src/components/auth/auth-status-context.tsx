"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface AuthStatusState {
  loading: boolean;
  authConfigured: boolean;
  authenticated: boolean;
  dbConfigured: boolean;
  message?: string;
  refresh: () => void;
}

const defaultState: AuthStatusState = {
  loading: true,
  authConfigured: false,
  authenticated: false,
  dbConfigured: false,
  refresh: () => {},
};

const AuthStatusContext = createContext<AuthStatusState>(defaultState);

export function AuthStatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Omit<AuthStatusState, "refresh">>({
    loading: true,
    authConfigured: false,
    authenticated: false,
    dbConfigured: false,
  });

  const fetchStatus = useCallback(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        setStatus({
          loading: false,
          authConfigured: !!data.authConfigured,
          authenticated: !!data.authenticated,
          dbConfigured: !!data.dbConfigured,
          message: data.message,
        });
      })
      .catch(() => {
        setStatus((s) => ({ ...s, loading: false }));
      });
  }, []);

  useEffect(() => {
    fetchStatus();
    const onFocus = () => fetchStatus();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchStatus]);

  const value: AuthStatusState = { ...status, refresh: fetchStatus };

  return (
    <AuthStatusContext.Provider value={value}>{children}</AuthStatusContext.Provider>
  );
}

export function useAuthStatus() {
  return useContext(AuthStatusContext);
}
