import { CreditAction } from "@prisma/client";

/**
 * Классификация POST-путей под /api/backend.
 * - charge: AI-действие, требует авторизацию и списывает кредиты.
 * - auth:   AI-действие (или запуск discovery), требует только авторизацию
 *           (списание уже произошло на этапе /api/concepts/generate).
 * - null:   обычный прокси (GET, создание/обновление request и т.п.).
 */
export type BackendPathAction =
  | { kind: "charge"; action: CreditAction }
  | { kind: "auth" };

/** Визуализация и перевизуализация — 10 кредитов (VISUALIZATION). */
const VISUALIZATION_POST = /^requests\/[^/]+\/(generate|regenerate|refine-visualization)$/;
/** Перегенерация 5 концепций — 5 кредитов (CONCEPT_GENERATION). */
const CONCEPT_RETRY_POST = /^requests\/[^/]+\/agent-run\/retry$/;
/** AI-действия, которые нельзя выполнять без авторизации (списание — отдельно или не нужно). */
const AUTH_ONLY_POST: RegExp[] = [
  /^requests\/parse-brief$/,
  /^requests\/parameters\/extract$/,
  /^requests\/[^/]+\/extract-parameters$/,
  /^requests\/[^/]+\/suggest-products$/,
  /^requests\/[^/]+\/suggest-product-add$/,
  /^requests\/[^/]+\/agent-run$/,
  /^requests\/[^/]+\/agent-run\/select$/,
];

export function classifyBackendPath(
  method: string,
  pathSegments: string[]
): BackendPathAction | null {
  if (method.toUpperCase() !== "POST") return null;
  const path = pathSegments.join("/");

  if (VISUALIZATION_POST.test(path)) {
    return { kind: "charge", action: CreditAction.VISUALIZATION };
  }
  if (CONCEPT_RETRY_POST.test(path)) {
    return { kind: "charge", action: CreditAction.CONCEPT_GENERATION };
  }
  if (AUTH_ONLY_POST.some((re) => re.test(path))) {
    return { kind: "auth" };
  }
  return null;
}

/** @deprecated Используйте classifyBackendPath. */
export function creditActionForBackendPath(
  method: string,
  pathSegments: string[]
): CreditAction | null {
  const classified = classifyBackendPath(method, pathSegments);
  return classified && classified.kind === "charge" ? classified.action : null;
}
