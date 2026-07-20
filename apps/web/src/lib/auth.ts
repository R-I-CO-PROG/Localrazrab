import { headers } from "next/headers";
import type { User } from "@prisma/client";
import { auth } from "@/lib/better-auth-server";
import { isAuthEnabled, isDatabaseConfigured } from "@/lib/auth-config";
import { isUserBlocked, revokeUserSessions } from "@/lib/admin-users";
import { prisma } from "@/lib/prisma";

export async function getSessionUserId(): Promise<string | null> {
  if (!isAuthEnabled()) return null;

  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user?.id ?? null;
}

/** Проверка, что PostgreSQL доступна и таблицы auth созданы. */
export async function pingAuthDatabase(): Promise<string | null> {
  if (!isDatabaseConfigured()) {
    return "DATABASE_URL не настроен";
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.user.count();
    await prisma.account.count();
    return null;
  } catch (error) {
    console.error("[pingAuthDatabase]", error);
    return "Таблицы auth не найдены или БД недоступна. Выполните: npx prisma db push";
  }
}

/** Текущий пользователь из PostgreSQL (создаётся Better Auth при регистрации). */
export async function getOrCreateDbUser(): Promise<User | null> {
  if (!isAuthEnabled() || !isDatabaseConfigured()) return null;

  const userId = await getSessionUserId();
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (user?.blocked) {
    await revokeUserSessions(userId);
    return null;
  }

  return user;
}
