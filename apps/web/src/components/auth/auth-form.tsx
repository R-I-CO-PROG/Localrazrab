"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStatus } from "@/components/auth/auth-status-context";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface AuthFeatures {
  googleEnabled: boolean;
  emailVerificationEnabled: boolean;
}

function translateAuthError(
  error: { message?: string; code?: string } | null | undefined,
  mode: "sign-in" | "sign-up"
): string {
  const code = error?.code;
  if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL") {
    return "Аккаунт с таким email уже существует. Попробуйте войти.";
  }
  if (code === "EMAIL_NOT_VERIFIED") {
    return "Email не подтверждён. Проверьте почту или запросите письмо повторно.";
  }
  if (code === "FAILED_TO_CREATE_USER") {
    return "Ошибка базы данных. На сервере выполните: npx prisma db push";
  }
  if (code === "EMAIL_PASSWORD_SIGN_UP_DISABLED") {
    return "Регистрация временно отключена";
  }

  const message = error?.message;
  if (!message) {
    return mode === "sign-up" ? "Не удалось зарегистрироваться" : "Неверный email или пароль";
  }
  const lower = message.toLowerCase();
  if (lower.includes("already exists") || lower.includes("user already")) {
    return "Аккаунт с таким email уже существует";
  }
  if (lower.includes("not verified") || lower.includes("email not verified")) {
    return "Email не подтверждён. Проверьте почту.";
  }
  if (lower.includes("invalid email") || lower.includes("email")) {
    return "Некорректный email";
  }
  if (lower.includes("password") && lower.includes("short")) {
    return "Пароль слишком короткий (минимум 8 символов)";
  }
  if (lower.includes("invalid") && lower.includes("credential")) {
    return "Неверный email или пароль";
  }
  return message;
}

interface AuthFormProps {
  mode: "sign-in" | "sign-up";
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const { refresh: refreshAuth } = useAuthStatus();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [verificationSent, setVerificationSent] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [features, setFeatures] = useState<AuthFeatures>({
    googleEnabled: false,
    emailVerificationEnabled: false,
  });

  useEffect(() => {
    fetch("/api/auth/config")
      .then((r) => r.json())
      .then(setFeatures)
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    setVerificationSent(false);

    try {
      if (mode === "sign-up") {
        const result = await authClient.signUp.email({
          email,
          password,
          name: name.trim() || email.split("@")[0],
          callbackURL: callbackUrl,
        });
        if (result.error) {
          setError(translateAuthError(result.error, mode));
          return;
        }
        if (features.emailVerificationEnabled && !result.data?.token) {
          setVerificationSent(true);
          return;
        }
      } else {
        const result = await authClient.signIn.email({
          email,
          password,
          callbackURL: callbackUrl,
        });
        if (result.error) {
          setError(translateAuthError(result.error, mode));
          return;
        }
      }

      refreshAuth();
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    await authClient.signIn.social({
      provider: "google",
      callbackURL: callbackUrl,
    });
  }

  async function handleResendVerification() {
    if (!email) {
      setError("Укажите email");
      return;
    }
    setResendLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/send-verification-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, callbackURL: callbackUrl }),
      });
      if (!res.ok) {
        setError("Не удалось отправить письмо. Попробуйте позже.");
        return;
      }
      setVerificationSent(true);
    } catch {
      setError("Не удалось отправить письмо. Попробуйте позже.");
    } finally {
      setResendLoading(false);
    }
  }

  const isSignUp = mode === "sign-up";

  if (verificationSent) {
    return (
      <Card className="w-full max-w-md border-border/60 shadow-lg">
        <CardHeader>
          <CardTitle>Проверьте почту</CardTitle>
          <CardDescription>
            Мы отправили ссылку для подтверждения на <strong>{email}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Перейдите по ссылке в письме, чтобы завершить регистрацию. После подтверждения вы
            автоматически войдёте в аккаунт.
          </p>
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={resendLoading}
            onClick={handleResendVerification}
          >
            {resendLoading ? "Отправляем..." : "Отправить письмо ещё раз"}
          </Button>
        </CardContent>
        <CardFooter>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/sign-in">Уже подтвердили? Войти</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-md border-border/60 shadow-lg">
      <CardHeader>
        <CardTitle>{isSignUp ? "Регистрация" : "Вход"}</CardTitle>
        <CardDescription>
          {isSignUp
            ? "Создайте аккаунт для сохранения проектов и кредитов"
            : "Войдите в аккаунт Mercai"}
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          {isSignUp && (
            <div className="space-y-2">
              <Label htmlFor="name">Имя</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Как к вам обращаться"
                autoComplete="name"
              />
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Пароль</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isSignUp ? "Минимум 8 символов" : "••••••••"}
              required
              minLength={8}
              autoComplete={isSignUp ? "new-password" : "current-password"}
            />
          </div>
          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {mode === "sign-in" && features.emailVerificationEnabled && error?.includes("не подтверждён") && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              disabled={resendLoading || !email}
              onClick={handleResendVerification}
            >
              {resendLoading ? "Отправляем..." : "Отправить письмо подтверждения"}
            </Button>
          )}
          {features.googleEnabled && (
            <>
              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">или</span>
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handleGoogle}
              >
                {isSignUp ? "Регистрация через Google" : "Войти через Google"}
              </Button>
            </>
          )}
        </CardContent>
        <CardFooter className="flex flex-col gap-3">
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Подождите..."
              : isSignUp
                ? "Зарегистрироваться"
                : "Войти"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            {isSignUp ? (
              <>
                Уже есть аккаунт?{" "}
                <Link href="/sign-in" className="text-primary hover:underline">
                  Войти
                </Link>
              </>
            ) : (
              <>
                Нет аккаунта?{" "}
                <Link href="/sign-up" className="text-primary hover:underline">
                  Регистрация
                </Link>
              </>
            )}
          </p>
        </CardFooter>
      </form>
    </Card>
  );
}
