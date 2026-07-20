"use client";

import { Sidebar } from "./sidebar";
import { TopHeader } from "./top-header";
import { SidebarProvider, useSidebar } from "./sidebar-context";
import { BlacklistBootstrap } from "@/components/providers/blacklist-bootstrap";
import { WorkspaceBootstrap } from "@/components/providers/workspace-bootstrap";
import { cn } from "@/lib/utils";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { sidebarWidth, mobileOpen, setMobileOpen } = useSidebar();

  return (
    <div className="min-h-screen bg-background">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Закрыть меню"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <Sidebar />
      <div
        className={cn(
          "transition-[padding] duration-200 ease-in-out",
          "pl-0 md:pl-[var(--sidebar-width)]"
        )}
        style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}
      >
        <TopHeader />
        <main>
          <div className="mx-auto max-w-[1400px] p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <BlacklistBootstrap />
      <WorkspaceBootstrap />
      <DashboardShell>{children}</DashboardShell>
    </SidebarProvider>
  );
}
