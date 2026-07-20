"use client";

import { useEffect, useState, useCallback } from "react";
import { CREDITS_UPDATED_EVENT } from "@/lib/credits-events";

export interface DbUserInfo {
  authenticated: boolean;
  credits: number;
  planLabel: string;
  role: string;
}

const GUEST: DbUserInfo = { authenticated: false, credits: 0, planLabel: "", role: "" };

export function useDbUser(enabled: boolean) {
  const [dbUser, setDbUser] = useState<DbUserInfo | null>(null);

  const refresh = useCallback(() => {
    if (!enabled) return;
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setDbUser({
            authenticated: true,
            credits: data.user.credits,
            planLabel: data.user.planLabel,
            role: data.user.role ?? "USER",
          });
        } else {
          setDbUser(GUEST);
        }
      })
      .catch(() => setDbUser(GUEST));
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;

    const onCreditsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ creditsRemaining: number }>).detail;
      if (typeof detail?.creditsRemaining === "number") {
        setDbUser((prev) =>
          prev ? { ...prev, credits: detail.creditsRemaining } : prev
        );
      } else {
        refresh();
      }
    };

    window.addEventListener(CREDITS_UPDATED_EVENT, onCreditsUpdated);
    return () => window.removeEventListener(CREDITS_UPDATED_EVENT, onCreditsUpdated);
  }, [enabled, refresh]);

  return dbUser;
}
