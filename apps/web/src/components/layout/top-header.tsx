"use client";

import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserProfile } from "./user-profile";
import { ThemeToggle } from "./theme-toggle";
import { useSidebar } from "./sidebar-context";

export function TopHeader() {
  const { setMobileOpen } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setMobileOpen(true)}
        aria-label="Открыть меню"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <div className="hidden md:block" />
      <div className="flex items-center gap-4">
        <ThemeToggle />
        <UserProfile variant="header" />
      </div>
    </header>
  );
}
