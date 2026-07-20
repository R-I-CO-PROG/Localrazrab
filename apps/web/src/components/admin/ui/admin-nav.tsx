"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Activity, ArrowLeft, FlaskConical, FolderSearch, Map as MapIcon, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/admin/analytics", label: "Аналитика", icon: Activity },
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/users-explorer", label: "Обзор аккаунтов", icon: FolderSearch },
  { href: "/admin/logic", label: "Карта логики", icon: MapIcon },
  { href: "/admin/tester", label: "Тестер", icon: FlaskConical },
] as const;

export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    <header className="sticky top-0 z-30 flex flex-col gap-4 border-b border-border bg-background/85 px-4 py-3.5 backdrop-blur-xl sm:px-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
          <span className="h-2.5 w-2.5 rounded-full bg-primary admin-pulse" />
        </span>
        <div className="leading-tight">
          <p className="font-display text-[15px] font-semibold tracking-tight">
            Mercai · Контроль
          </p>
          <p className="mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
            operator console
          </p>
        </div>
      </div>

      <nav className="flex items-center gap-1 overflow-x-auto rounded-xl border border-border bg-card/60 p-1">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group relative flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary/12 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/settings"
        className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
      >
        <ArrowLeft className="h-4 w-4" />
        В настройки
      </Link>
    </header>
  );
}
