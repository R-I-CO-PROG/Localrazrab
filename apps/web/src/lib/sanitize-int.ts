/** Клиентские границы — совпадают с API (apps/api/src/common/sanitize-request-integers.ts) */
export const LIMITS = {
  budget: { min: 100, max: 50_000_000 },
  quantity: { min: 1, max: 1_000_000 },
  setItems: { min: 1, max: 50 },
  conceptCount: { min: 1, max: 10 },
  visualizationCount: { min: 1, max: 5 },
} as const;

export function clampInt(
  value: unknown,
  opts: { min?: number; max?: number; fallback?: number } = {},
): number {
  const { min = 0, max = 50_000_000, fallback = min } = opts;
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? '').replace(/\s/g, ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function sanitizeFormBudget(form: {
  budget: number;
  totalBudget: number;
  quantity: number;
  setItemCount?: number;
  minProductsPerSet?: number;
  maxProductsPerSet?: number;
  conceptCount?: number;
  visualizationCount?: number;
}) {
  const quantity = clampInt(form.quantity, LIMITS.quantity);
  const totalBudget = clampInt(form.totalBudget, LIMITS.budget);
  const budget = clampInt(
    form.budget,
    { min: LIMITS.budget.min, max: LIMITS.budget.max, fallback: Math.max(LIMITS.budget.min, Math.round(totalBudget / quantity)) },
  );
  return {
    ...form,
    quantity,
    totalBudget,
    budget,
    setItemCount: clampInt(form.setItemCount, LIMITS.setItems),
    minProductsPerSet: clampInt(form.minProductsPerSet, { ...LIMITS.setItems, max: form.maxProductsPerSet ?? LIMITS.setItems.max }),
    maxProductsPerSet: clampInt(form.maxProductsPerSet, LIMITS.setItems),
    conceptCount: clampInt(form.conceptCount, LIMITS.conceptCount),
    visualizationCount: clampInt(form.visualizationCount, LIMITS.visualizationCount),
  };
}
