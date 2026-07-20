"use client";

import { formatCurrency, cn } from "@/lib/utils";

interface BudgetSpendIndicatorProps {
  /** Лимит бюджета на один набор, ₽ */
  budgetPerSet: number;
  /** Фактическая сумма выбранных товаров, ₽ */
  spent?: number | null;
  className?: string;
  compact?: boolean;
}

export function BudgetSpendIndicator({
  budgetPerSet,
  spent,
  className,
  compact = false,
}: BudgetSpendIndicatorProps) {
  const hasSpent = spent != null && spent > 0;
  const pct = hasSpent && budgetPerSet > 0 ? Math.round((spent / budgetPerSet) * 100) : null;
  const spendTone =
    pct == null
      ? "text-muted-foreground"
      : pct > 100
        ? "text-destructive"
        : pct < 85
          ? "text-amber-600 dark:text-amber-400"
          : "text-emerald-600 dark:text-emerald-400";

  return (
    <div className={cn(compact ? "space-y-1" : "space-y-2", className)}>
      <div className={cn(compact ? "" : "grid grid-cols-1 gap-3 sm:grid-cols-2")}>
        <div>
          <p className="mb-1 text-xs text-muted-foreground">Бюджет набора</p>
          <p className="font-semibold text-primary">{formatCurrency(budgetPerSet)}</p>
          <p className="text-[10px] text-muted-foreground">лимит на 1 набор</p>
        </div>
        {hasSpent && (
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Набрано</p>
            <p className={cn("font-semibold", spendTone)}>
              {formatCurrency(spent!)}
              {pct != null && <span className="ml-1.5 text-sm font-medium">({pct}%)</span>}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
