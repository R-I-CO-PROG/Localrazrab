import { NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { isAuthEnabled } from "@/lib/auth-config";

/**
 * Защита AI-эндпоинтов: запрос к LLM/генерации не должен уходить
 * от неавторизованного пользователя. Возвращает 401-ответ, если нужно
 * прервать обработку, либо null — если пользователь авторизован
 * (или авторизация выключена в окружении).
 */
export async function requireAiAuth(): Promise<NextResponse | null> {
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
  return null;
}
