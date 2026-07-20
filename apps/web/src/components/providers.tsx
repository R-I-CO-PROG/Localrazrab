"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { AuthStatusProvider } from "@/components/auth/auth-status-context";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <AuthStatusProvider>
        {children}
        <Toaster />
      </AuthStatusProvider>
    </ThemeProvider>
  );
}
