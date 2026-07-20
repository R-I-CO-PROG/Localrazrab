"use client";

import { useEffect } from "react";
import { fetchBlacklist } from "@/lib/blacklist-client";
import { useProjectStore } from "@/store/project-store";

/** Подгружает Black List с сервера при входе в кабинет. */
export function BlacklistBootstrap() {
  const setBlacklistItems = useProjectStore((s) => s.setBlacklistItems);

  useEffect(() => {
    void fetchBlacklist().then(setBlacklistItems);
  }, [setBlacklistItems]);

  return null;
}
