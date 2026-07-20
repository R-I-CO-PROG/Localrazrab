/** Проверка, что Better Auth настроен (секрет и БД). */
/** Причина, если Better Auth «не настроен» — для /api/me (без секрета). */
export function getAuthConfigIssue(): string | null {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret) return "BETTER_AUTH_SECRET не задан";
  if (secret.length < 16) return "BETTER_AUTH_SECRET слишком короткий (нужно >= 16)";
  if (secret.includes("change-me") || secret.includes("..."))
    return "BETTER_AUTH_SECRET — заглушка, замените на реальный";
  return null;
}

export function isAuthEnabled(): boolean {
  return getAuthConfigIssue() === null;
}

/** @deprecated Используйте useAuthStatus() — определяет auth по /api/me в рантайме. */
export function isAuthEnabledOnClient(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_ENABLED === "true";
}

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return (
    !!url &&
    url.startsWith("postgresql") &&
    !url.includes("user:password@localhost")
  );
}

export const PLAN_LABELS: Record<string, string> = {
  STARTER: "Starter",
  BUSINESS: "Business",
  ENTERPRISE: "Enterprise",
};
