"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/auth/user-menu";
import { useAuthStatus } from "@/components/auth/auth-status-context";
import { authClient } from "@/lib/auth-client";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";
import { useDbUser } from "@/hooks/use-db-user";

interface UserProfileProps {
  collapsed?: boolean;
  variant?: "sidebar" | "header";
}

function initials(name?: string | null, email?: string | null) {
  if (name) {
    return name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }
  return email?.slice(0, 2).toUpperCase() ?? "??";
}

function UserProfileGuest({ collapsed, variant = "sidebar" }: UserProfileProps) {
  const stats = useProjectStore((s) => s.stats);

  if (variant === "header") {
    return (
      <Link
        href="/settings"
        className="flex items-center gap-3 rounded-xl border border-border bg-card/80 px-3 py-2 transition-all hover:border-primary/30 hover:shadow-sm"
      >
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
            Г
          </AvatarFallback>
        </Avatar>
        <div className="hidden sm:block text-left">
          <p className="text-sm font-medium leading-none">Гость</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {stats.creditsRemaining} кредитов (локально)
          </p>
        </div>
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl p-2 transition-colors hover:bg-secondary/50",
        collapsed && "justify-center"
      )}
    >
      <Avatar className="h-8 w-8">
        <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
          Г
        </AvatarFallback>
      </Avatar>
      {!collapsed && (
        <div className="flex-1 overflow-hidden">
          <p className="truncate text-sm font-medium">Гость</p>
          <span className="text-[10px] text-muted-foreground">локальный режим</span>
        </div>
      )}
    </div>
  );
}

function UserProfileAuthenticated({ collapsed, variant = "sidebar" }: UserProfileProps) {
  const stats = useProjectStore((s) => s.stats);
  const dbUser = useDbUser(true);
  const { data: session, isPending } = authClient.useSession();

  const credits = dbUser?.credits ?? stats.creditsRemaining;
  const planLabel = dbUser?.planLabel ?? "Starter";
  const user = session?.user;

  if (isPending) {
    return (
      <div
        className={cn(
          "h-10 animate-pulse rounded-xl bg-secondary/50",
          collapsed ? "w-10" : "w-full"
        )}
      />
    );
  }

  if (!user) {
    return (
      <Button asChild size="sm" variant="outline" className={cn(collapsed && "px-2")}>
        <Link href="/sign-in">{collapsed ? "Вход" : "Войти"}</Link>
      </Button>
    );
  }

  const name = user.name || "Пользователь";
  const email = user.email;

  if (variant === "header") {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="hidden sm:flex items-center gap-3 rounded-xl border border-border bg-card/80 px-3 py-2 transition-all hover:border-primary/30 hover:shadow-sm"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.image ?? undefined} alt={name} />
            <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
              {initials(name, email)}
            </AvatarFallback>
          </Avatar>
          <div className="text-left">
            <p className="text-sm font-medium leading-none">{name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {credits} кредитов
            </p>
          </div>
        </Link>
        <UserMenu name={name} email={email} image={user.image} compact />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl p-2",
        collapsed && "justify-center"
      )}
    >
      <UserMenu name={name} email={email} image={user.image} compact={collapsed} />
      {!collapsed && (
        <div className="min-w-0 flex-1 overflow-hidden">
          <p className="truncate text-sm font-medium">{name}</p>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
              {planLabel}
            </Badge>
            <span className="text-[10px] text-muted-foreground">
              {credits} кредитов
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

export function UserProfile(props: UserProfileProps) {
  const { loading, authConfigured } = useAuthStatus();

  if (loading) {
    return (
      <div
        className={cn(
          "h-10 animate-pulse rounded-xl bg-secondary/50",
          props.collapsed ? "w-10" : "w-24"
        )}
      />
    );
  }

  if (!authConfigured) {
    return <UserProfileGuest {...props} />;
  }

  return <UserProfileAuthenticated {...props} />;
}
