import type { User } from "@prisma/client";
import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/auth";
import { isAuthEnabled, isDatabaseConfigured } from "@/lib/auth-config";

export function getAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(user: Pick<User, "email" | "role">): boolean {
  if (user.role === "ADMIN") return true;
  return getAdminEmails().includes(user.email.toLowerCase());
}

/** ID всех админ-аккаунтов (role=ADMIN или email из ADMIN_EMAILS) — для исключения из аналитики. */
export async function resolveAdminUserIds(): Promise<string[]> {
  const { prisma } = await import("@/lib/prisma");
  const emails = getAdminEmails();
  const rows = await prisma.user.findMany({
    where: {
      OR: [{ role: "ADMIN" as const }, ...(emails.length ? [{ email: { in: emails } }] : [])],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export type AdminAuthResult =
  | { ok: true; user: User; viaSecret: boolean }
  | { ok: false; response: NextResponse };

/** Проверяет права админа: role ADMIN, email из ADMIN_EMAILS или заголовок X-Admin-Secret. */
export async function requireAdmin(request: Request): Promise<AdminAuthResult> {
  if (!isDatabaseConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "DATABASE_URL не настроен" },
        { status: 503 }
      ),
    };
  }

  const adminSecret = process.env.ADMIN_SECRET?.trim();
  const headerSecret = request.headers.get("x-admin-secret")?.trim();

  if (adminSecret && headerSecret && headerSecret === adminSecret) {
    const bootstrapEmail = getAdminEmails()[0];
    if (bootstrapEmail) {
      const { prisma } = await import("@/lib/prisma");
      const user = await prisma.user.findUnique({
        where: { email: bootstrapEmail },
      });
      if (user) {
        return { ok: true, user, viaSecret: true };
      }
    }

    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "ADMIN_SECRET принят, но пользователь с первым email из ADMIN_EMAILS не найден в БД",
        },
        { status: 403 }
      ),
    };
  }

  if (!isAuthEnabled()) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Авторизация не настроена — войдите через приложение или используйте X-Admin-Secret" },
        { status: 503 }
      ),
    };
  }

  const user = await getOrCreateDbUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Требуется авторизация" }, { status: 401 }),
    };
  }

  if (!isAdminUser(user)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Доступ только для администратора" }, { status: 403 }),
    };
  }

  return { ok: true, user, viaSecret: false };
}
