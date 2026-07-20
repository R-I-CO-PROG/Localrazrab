function friendlyHttpError(status: number, raw: string): string {
  if (status === 502) {
    return "Сервер временно недоступен. Подождите несколько секунд и обновите страницу.";
  }
  if (status === 503) {
    return "Сервер перегружен. Попробуйте через минуту.";
  }
  if (status === 504) {
    return "Сервер не успел ответить. Попробуйте ещё раз.";
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith("<") || trimmed.includes("<html")) {
    return `Ошибка сервера (HTTP ${status}). Обновите страницу и повторите попытку.`;
  }
  return `Ошибка сервера (${status}): ${trimmed.slice(0, 200) || "пустой ответ"}`;
}

export async function readJsonResponse<T = Record<string, unknown>>(
  res: Response,
): Promise<{ data: T | null; raw: string }> {
  const raw = await res.text();
  if (!raw.trim()) {
    return { data: null, raw };
  }
  try {
    return { data: JSON.parse(raw) as T, raw };
  } catch {
    throw new Error(
      res.ok ? "Сервер вернул некорректный ответ" : friendlyHttpError(res.status, raw),
    );
  }
}

export async function parseApiResponse<T = Record<string, unknown>>(res: Response): Promise<T> {
  const { data, raw } = await readJsonResponse<T>(res);
  if (data == null) {
    throw new Error(
      res.ok
        ? "Сервер вернул пустой ответ"
        : `Сервер недоступен или не ответил (HTTP ${res.status}). Проверьте API и миграции БД.`,
    );
  }
  return data;
}
