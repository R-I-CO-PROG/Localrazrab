import type { User } from "@prisma/client";
import { CreditAction, PlanType, Prisma } from "@prisma/client";
import { getCreditCost } from "@/lib/credit-costs";
import { prisma } from "@/lib/prisma";

export type CreditAdjustMode = "add" | "set" | "deduct";

export class InsufficientCreditsError extends Error {
  readonly code = "INSUFFICIENT_CREDITS" as const;

  constructor(
    public readonly required: number,
    public readonly available: number
  ) {
    super(`Недостаточно кредитов: нужно ${required}, доступно ${available}`);
    this.name = "InsufficientCreditsError";
  }
}

export interface AdjustCreditsInput {
  userId: string;
  amount: number;
  mode: CreditAdjustMode;
  adminUserId: string;
  note?: string;
}

export interface SpendCreditsInput {
  userId: string;
  action: CreditAction;
  cost?: number;
  metadata?: Prisma.InputJsonValue;
}

export interface RefundCreditsInput {
  userId: string;
  action: CreditAction;
  amount: number;
  metadata?: Prisma.InputJsonValue;
}

function hasUnlimitedCredits(user: Pick<User, "credits" | "plan">): boolean {
  return user.plan === PlanType.ENTERPRISE || user.credits < 0;
}

/** Списание кредитов перед платной операцией (атомарно). */
export async function spendCredits(input: SpendCreditsInput): Promise<User> {
  const cost = input.cost ?? getCreditCost(input.action);

  if (!Number.isInteger(cost) || cost < 0) {
    throw new Error("cost должен быть неотрицательным целым числом");
  }

  if (cost === 0) {
    const user = await prisma.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new Error("Пользователь не найден");
    return user;
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) {
      throw new Error("Пользователь не найден");
    }

    if (hasUnlimitedCredits(user)) {
      return user;
    }

    if (user.credits < cost) {
      throw new InsufficientCreditsError(cost, user.credits);
    }

    const nextBalance = user.credits - cost;

    const updated = await tx.user.update({
      where: { id: input.userId },
      data: { credits: nextBalance },
    });

    await tx.creditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        amount: -cost,
        balance: nextBalance,
        metadata: input.metadata,
      },
    });

    return updated;
  });
}

/** Возврат кредитов при ошибке генерации после списания. */
export async function refundCredits(input: RefundCreditsInput): Promise<User> {
  const { userId, action, amount, metadata } = input;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("amount для возврата должен быть положительным целым числом");
  }

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new Error("Пользователь не найден");
    }

    if (hasUnlimitedCredits(user)) {
      return user;
    }

    const nextBalance = user.credits + amount;

    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: nextBalance },
    });

    await tx.creditLog.create({
      data: {
        userId,
        action,
        amount,
        balance: nextBalance,
        metadata: {
          refund: true,
          ...(typeof metadata === "object" &&
          metadata !== null &&
          !Array.isArray(metadata)
            ? metadata
            : {}),
        } as Prisma.InputJsonValue,
      },
    });

    return updated;
  });
}

export async function adjustUserCredits(input: AdjustCreditsInput): Promise<User> {
  const { userId, amount, mode, adminUserId, note } = input;

  if (!Number.isFinite(amount) || !Number.isInteger(amount)) {
    throw new Error("amount должен быть целым числом");
  }

  if (mode === "set" && amount < 0) {
    throw new Error("Баланс не может быть отрицательным");
  }

  if ((mode === "add" || mode === "deduct") && amount <= 0) {
    throw new Error("Укажите положительное количество кредитов");
  }

  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: userId } });
    if (!target) {
      throw new Error("Пользователь не найден");
    }

    const nextBalance =
      mode === "set"
        ? amount
        : mode === "deduct"
          ? Math.max(0, target.credits - amount)
          : Math.max(0, target.credits + amount);
    const delta = nextBalance - target.credits;

    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: nextBalance },
    });

    await tx.creditLog.create({
      data: {
        userId,
        action: CreditAction.ADMIN_GRANT,
        amount: delta,
        balance: nextBalance,
        metadata: {
          mode,
          requestedAmount: amount,
          adminUserId,
          note: note ?? null,
        },
      },
    });

    return updated;
  });
}

export async function findUserByEmailOrId(identifier: {
  email?: string;
  userId?: string;
}): Promise<User | null> {
  if (identifier.userId) {
    return prisma.user.findUnique({ where: { id: identifier.userId } });
  }

  if (identifier.email) {
    const email = identifier.email.trim();
    return prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
  }

  return null;
}
