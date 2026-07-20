"use client";

import { useEffect, useRef } from "react";
import { fetchWorkspace, saveWorkspace } from "@/lib/workspace-client";
import { useProjectStore } from "@/store/project-store";

const SAVE_DEBOUNCE_MS = 2500;

/** Синхронизирует проекты, концепции, визуализации и презентации с БД. */
export function WorkspaceBootstrap() {
  const hydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverUpdatedAt = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void fetchWorkspace().then(({ payload, updatedAt, userId }) => {
      if (cancelled) return;
      const store = useProjectStore.getState();
      // Смена аккаунта на этом браузере → ПОЛНЫЙ сброс закэшированного воркспейса
      // ДО гидратации и до первого автосейва, иначе данные предыдущего пользователя
      // покажутся новому и перезапишут его серверную запись.
      if (userId && store.ownerUserId !== userId) {
        store.resetWorkspace(userId);
      }
      if (payload) {
        serverUpdatedAt.current = updatedAt;
        useProjectStore.getState().hydrateFromServer(payload);
      }
      if (userId && useProjectStore.getState().ownerUserId !== userId) {
        useProjectStore.setState({ ownerUserId: userId });
      }
      hydrated.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const scheduleSave = () => {
      if (!hydrated.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const payload = useProjectStore.getState().exportWorkspacePayload();
        void saveWorkspace(payload).then((updatedAt) => {
          if (updatedAt) serverUpdatedAt.current = updatedAt;
        });
      }, SAVE_DEBOUNCE_MS);
    };

    const unsub = useProjectStore.subscribe(scheduleSave);
    return () => {
      unsub();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  return null;
}
