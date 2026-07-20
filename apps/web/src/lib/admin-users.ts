import type { User } from "@prisma/client";
import { UserRole } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class AdminUserActionError extends Error {
  constructor(
    message: string,
    readonly status = 400
  ) {
    super(message);
    this.name = "AdminUserActionError";
  }
}

export async function countAdmins(): Promise<number> {
  return prisma.user.count({ where: { role: UserRole.ADMIN } });
}

export function assertNotSelf(actorId: string, targetId: string, action: string): void {
  if (actorId === targetId) {
    throw new AdminUserActionError(`Нельзя ${action} свой аккаунт`, 403);
  }
}

export async function assertCanChangeAdminRole(target: User): Promise<void> {
  if (target.role !== UserRole.ADMIN) return;
  const admins = await countAdmins();
  if (admins <= 1) {
    throw new AdminUserActionError("Нельзя снять роль у последнего администратора", 403);
  }
}

export async function revokeUserSessions(userId: string): Promise<number> {
  const result = await prisma.session.deleteMany({ where: { userId } });
  return result.count;
}

export async function setUserRole(userId: string, role: UserRole): Promise<User> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new AdminUserActionError("Пользователь не найден", 404);

  if (target.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
    await assertCanChangeAdminRole(target);
  }

  return prisma.user.update({
    where: { id: userId },
    data: { role },
  });
}

export async function setUserBlocked(userId: string, blocked: boolean): Promise<User> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new AdminUserActionError("Пользователь не найден", 404);

  if (blocked && target.role === UserRole.ADMIN) {
    await assertCanChangeAdminRole(target);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      blocked,
      blockedAt: blocked ? new Date() : null,
    },
  });

  if (blocked) {
    await revokeUserSessions(userId);
  }

  return updated;
}

export async function deleteUserAccount(userId: string): Promise<void> {
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target) throw new AdminUserActionError("Пользователь не найден", 404);

  if (target.role === UserRole.ADMIN) {
    await assertCanChangeAdminRole(target);
  }

  await prisma.verification.deleteMany({
    where: { identifier: target.email },
  });

  await prisma.user.delete({ where: { id: userId } });
}

export async function isUserBlocked(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { blocked: true },
  });
  return user?.blocked ?? false;
}
