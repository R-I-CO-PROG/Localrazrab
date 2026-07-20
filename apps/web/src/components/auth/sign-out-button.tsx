"use client";

import { LogOut, Loader2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useProjectStore } from "@/store/project-store";

interface SignOutButtonProps {
  className?: string;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost" | "link";
}

export function SignOutButton({ className, variant = "outline" }: SignOutButtonProps) {
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      await authClient.signOut({
        fetchOptions: {
          onSuccess: () => {
            // Полностью очищаем локальный кэш воркспейса, чтобы данные этого аккаунта
            // не остались следующему пользователю на том же браузере.
            try {
              useProjectStore.getState().resetWorkspace(null);
              useProjectStore.persist.clearStorage();
            } catch {
              /* no-op */
            }
            window.location.href = "/sign-in";
          },
        },
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      className={className}
      disabled={loading}
      onClick={() => void handleSignOut()}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      Выйти
    </Button>
  );
}
