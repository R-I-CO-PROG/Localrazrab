"use client";

import Link from "next/link";
import NextImage from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Layers,
  Sparkles,
  Image,
  FileText,
  BookOpen,
  LayoutTemplate,
  Heart,
  Settings,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_NAME, NAV_ITEMS } from "@/lib/constants";
import { ProBanner } from "./pro-banner";
import { useSidebar } from "./sidebar-context";

const iconMap: Record<string, React.ElementType> = {
  Layers,
  Sparkles,
  Image,
  FileText,
  BookOpen,
  LayoutTemplate,
  Heart,
  Settings,
};

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, mobileOpen, toggleCollapsed, setMobileOpen } = useSidebar();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-40 flex h-screen flex-col border-r border-border bg-card/95 backdrop-blur-xl",
        "w-[260px] transition-[transform,width] duration-200 ease-in-out",
        collapsed ? "md:w-[72px]" : "md:w-[260px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      <Link
        href="/"
        onClick={() => setMobileOpen(false)}
        aria-label={APP_NAME}
        className="flex h-16 items-center border-b border-border px-4 transition-colors hover:bg-secondary/50"
      >
        {!collapsed || mobileOpen ? (
          <div className="flex items-center gap-2">
            <img
              src="/logo-mark.svg"
              alt="logo"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0"
            />
            <NextImage
              src="/logo-text.png"
              alt="МЕРЦАЙ"
              width={130}
              height={36}
              className="h-9 w-auto object-contain"
              priority
              unoptimized
            />
          </div>
        ) : (
          <img
            src="/logo-mark.svg"
            alt={APP_NAME}
            width={36}
            height={36}
            className="h-9 w-9"
          />
        )}
      </Link>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 scrollbar-thin">
        {NAV_ITEMS.map((item) => {
          const Icon = iconMap[item.icon];
          const isActive =
            item.href === "/proposals"
              ? pathname === "/proposals" ||
                pathname.startsWith("/proposals/") ||
                pathname.startsWith("/presentations/")
              : pathname === item.href || pathname.startsWith(item.href + "/");

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl bg-primary/10"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
                />
              )}
              <Icon className="relative h-[18px] w-[18px] shrink-0" />
              {(!collapsed || mobileOpen) && (
                <span className="relative truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-border p-3">
        <ProBanner collapsed={collapsed && !mobileOpen} />
        <button
          type="button"
          onClick={toggleCollapsed}
          className="hidden w-full items-center justify-center rounded-xl py-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:flex"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
