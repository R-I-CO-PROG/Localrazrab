"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { useAuthStatus } from "@/components/auth/auth-status-context";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

interface MeUser {
  name: string | null;
  email: string;
  image: string | null;
  planLabel: string;
  credits: number;
}

function SettingsProfileGuest() {
  const { authConfigured, loading, message } = useAuthStatus();

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Профиль</CardTitle>
        <CardDescription>Информация об аккаунте</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
              Г
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-semibold text-lg">Гость</p>
            <p className="text-sm text-muted-foreground">локальный режим</p>
          </div>
        </div>
        {!loading && !authConfigured && (
          <p className="rounded-xl border border-dashed border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
            {message ??
              "Для входа настройте Better Auth и PostgreSQL — см. AUTH_SETUP.md в папке проекта."}
          </p>
        )}
        {!loading && authConfigured && (
          <div className="flex flex-col gap-3 rounded-xl border border-dashed border-border bg-secondary/30 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Войдите или зарегистрируйтесь, чтобы сохранять проекты и кредиты в аккаунте.
            </p>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href="/sign-in">Войти</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/sign-up">Регистрация</Link>
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SettingsProfileAuthenticated() {
  const { data: session, isPending } = authClient.useSession();
  const [dbUser, setDbUser] = useState<MeUser | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.authenticated && data.user) {
          setDbUser(data.user);
        }
      })
      .catch(() => {});
  }, []);

  const sessionUser = session?.user;
  const name = dbUser?.name || sessionUser?.name || "Пользователь";
  const avatar = dbUser?.image || sessionUser?.image;
  const plan = dbUser?.planLabel ?? "Starter";
  const credits = dbUser?.credits;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Профиль</CardTitle>
        <CardDescription>Информация об аккаунте</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {!isPending && avatar && <AvatarImage src={avatar} alt={name} />}
              <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
                {name.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold text-lg">{name}</p>
              <Badge className="mt-1">{plan}</Badge>
              {credits != null && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {credits} кредитов на счёте
                </p>
              )}
            </div>
          </div>
          <SignOutButton className="w-full gap-2 sm:w-auto" variant="outline" />
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsProfileCard() {
  const { loading, authConfigured, authenticated } = useAuthStatus();

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Профиль</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-24 animate-pulse rounded-xl bg-secondary/50" />
        </CardContent>
      </Card>
    );
  }

  if (!authConfigured || !authenticated) {
    return <SettingsProfileGuest />;
  }

  return <SettingsProfileAuthenticated />;
}
