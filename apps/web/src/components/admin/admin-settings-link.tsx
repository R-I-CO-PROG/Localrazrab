"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, FlaskConical, Map as MapIcon, ShieldCheck, Users } from "lucide-react";

const LINKS = [
  { href: "/admin/analytics", label: "Аналитика", icon: Activity },
  { href: "/admin/users", label: "Пользователи", icon: Users },
  { href: "/admin/logic", label: "Карта логики", icon: MapIcon },
  { href: "/admin/tester", label: "Тестер", icon: FlaskConical },
] as const;

export function AdminSettingsLink() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    fetch("/api/admin/check")
      .then((r) => r.json())
      .then((data) => setIsAdmin(!!data.isAdmin))
      .catch(() => setIsAdmin(false));
  }, []);

  if (!isAdmin) return null;

  return (
    <div className="admin-shell overflow-hidden rounded-3xl border border-border p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-primary/30 bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="leading-tight">
          <p className="mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
            operator console
          </p>
          <h3 className="font-display text-lg font-semibold tracking-tight text-foreground">
            Администрирование
          </h3>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        Пульт оператора: аналитика, кредиты, пользователи и карта логики платформы.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group inline-flex items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary"
          >
            <Icon className="h-4 w-4 text-primary" />
            {label}
            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
