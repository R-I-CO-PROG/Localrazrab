"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

interface UserMenuProps {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  compact?: boolean;
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

/** Аватар ведёт в профиль — без выпадающего меню */
export function UserMenu({ name, email, image, compact }: UserMenuProps) {
  return (
    <Button
      variant="ghost"
      size={compact ? "icon" : "default"}
      className={compact ? "h-9 w-9 rounded-full p-0" : "gap-2 px-2"}
      asChild
    >
      <Link href="/settings" title="Профиль">
        <Avatar className="h-8 w-8">
          {image && <AvatarImage src={image} alt={name ?? "Профиль"} />}
          <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
            {initials(name, email)}
          </AvatarFallback>
        </Avatar>
        {!compact && (
          <span className="hidden max-w-[120px] truncate text-sm sm:inline">
            {name ?? "Профиль"}
          </span>
        )}
      </Link>
    </Button>
  );
}
