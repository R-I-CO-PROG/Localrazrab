"use client";

import { useEffect, useState } from "react";
import { useProjectStore } from "@/store/project-store";

/** Ждём rehydrate zustand persist — иначе SSR и клиент расходятся */
export function useProjectStoreHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const store = useProjectStore.persist;
    if (store.hasHydrated()) {
      setHydrated(true);
      return;
    }
    return store.onFinishHydration(() => setHydrated(true));
  }, []);

  return hydrated;
}
