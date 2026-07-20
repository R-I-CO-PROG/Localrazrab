/** Безопасные границы для INT4 в PostgreSQL и бизнес-логики */
export const PG_INT_MAX = 2_147_483_647;

export const LIMITS = {
  budget: { min: 0, max: 50_000_000 },
  quantity: { min: 1, max: 1_000_000 },
  setItems: { min: 1, max: 50 },
  conceptCount: { min: 1, max: 10 },
  visualizationCount: { min: 1, max: 5 },
} as const;

export function sanitizeInt(
  value: unknown,
  opts: { min?: number; max?: number; fallback?: number | null } = {},
): number | null | undefined {
  const { min = 0, max = PG_INT_MAX, fallback = undefined } = opts;
  if (value === undefined) return undefined;
  if (value === null) return null;

  const n = typeof value === 'number' ? value : Number.parseInt(String(value).replace(/\s/g, ''), 10);
  if (!Number.isFinite(n)) return fallback ?? undefined;

  return Math.min(max, Math.max(min, Math.round(n)));
}

export interface RequestIntegerPayload {
  budgetMin?: number | null;
  budgetMax?: number | null;
  quantity?: number;
  setItemCount?: number;
  minProductsPerSet?: number;
  maxProductsPerSet?: number;
  conceptCount?: number;
  visualizationCount?: number;
  [key: string]: unknown;
}

export function sanitizeRequestPayload<T extends RequestIntegerPayload>(data: T): T {
  const out = { ...data };

  if (out.budgetMin !== undefined) {
    out.budgetMin = sanitizeInt(out.budgetMin, { ...LIMITS.budget, fallback: null });
  }
  if (out.budgetMax !== undefined) {
    out.budgetMax = sanitizeInt(out.budgetMax, { ...LIMITS.budget, fallback: null });
  }
  if (out.quantity !== undefined) {
    out.quantity = sanitizeInt(out.quantity, LIMITS.quantity) ?? LIMITS.quantity.min;
  }
  if (out.setItemCount !== undefined) {
    out.setItemCount = sanitizeInt(out.setItemCount, LIMITS.setItems) ?? LIMITS.setItems.min;
  }
  if (out.minProductsPerSet !== undefined) {
    out.minProductsPerSet = sanitizeInt(out.minProductsPerSet, LIMITS.setItems) ?? LIMITS.setItems.min;
  }
  if (out.maxProductsPerSet !== undefined) {
    out.maxProductsPerSet = sanitizeInt(out.maxProductsPerSet, LIMITS.setItems) ?? LIMITS.setItems.min;
  }
  if (out.conceptCount !== undefined) {
    out.conceptCount = sanitizeInt(out.conceptCount, LIMITS.conceptCount) ?? LIMITS.conceptCount.min;
  }
  if (out.visualizationCount !== undefined) {
    out.visualizationCount =
      sanitizeInt(out.visualizationCount, LIMITS.visualizationCount) ?? LIMITS.visualizationCount.min;
  }

  return out;
}
