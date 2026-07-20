import { NextResponse } from "next/server";
import type { User } from "@prisma/client";
import { CreditAction, PlanType, Prisma } from "@prisma/client";
import { getSessionUserId } from "@/lib/auth";
import { isAuthEnabled } from "@/lib/auth-config";
import { getCreditCost } from "@/lib/credit-costs";
import { InsufficientCreditsError, spendCredits } from "@/lib/credits";
import { prisma } from "@/lib/prisma";

/**
 * Требует авторизацию и минимальный баланс кредитов для запуска действия.
 * Возвращает 401 (нет входа) или 402 (недостаточно кредитов), иначе null.
 * Не списывает кредиты — только проверяет доступность.
 */
export async function requireMinimumCredits(min: number): Promise<NextResponse | null> {
  if (!isAuthEnabled()) return null;

  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json(
      {
        error: "Для использования функций генерации необходимо войти в систему.",
        code: "AUTH_REQUIRED",
      },
      { status: 401 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return NextResponse.json(
      {
        error: "Для использования функций генерации необходимо войти в систему.",
        code: "AUTH_REQUIRED",
      },
      { status: 401 }
    );
  }

  const unlimited = user.plan === PlanType.ENTERPRISE || user.credits < 0;
  if (!unlimited && user.credits < min) {
    return NextResponse.json(
      {
        error: `Для использования функции требуется минимум ${min} кредитов.`,
        code: "INSUFFICIENT_CREDITS",
        required: min,
        available: user.credits,
      },
      { status: 402 }
    );
  }

  return null;
}

export type SpendCreditsResult =
  | { ok: true; user: User | null; cost: number; creditsRemaining: number | null }
  | { ok: false; response: NextResponse };

export async function spendCreditsForRequest(
  action: CreditAction,
  metadata?: Prisma.InputJsonValue
): Promise<SpendCreditsResult> {
  const cost = getCreditCost(action);
  const userId = await getSessionUserId();

  if (!userId) {
    if (isAuthEnabled()) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "Для использования функций генерации необходимо войти в систему.",
            code: "AUTH_REQUIRED",
          },
          { status: 401 }
        ),
      };
    }
    return { ok: true, user: null, cost, creditsRemaining: null };
  }

  try {
    const user = await spendCredits({ userId, action, cost, metadata });
    return { ok: true, user, cost, creditsRemaining: user.credits };
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error: "Недостаточно кредитов",
            code: error.code,
            required: error.required,
            available: error.available,
          },
          { status: 402 }
        ),
      };
    }
    throw error;
  }
}
