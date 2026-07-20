"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { clampInt, LIMITS } from "@/lib/sanitize-int";
import type { BudgetMode } from "@/lib/types";
import { Calculator, Package } from "lucide-react";

interface BudgetInputProps {
  mode: BudgetMode;
  budgetPerUnit: number;
  totalBudget: number;
  quantity: number;
  onModeChange: (mode: BudgetMode) => void;
  onBudgetPerUnitChange: (value: number) => void;
  onTotalBudgetChange: (value: number) => void;
}

export function BudgetInput({
  mode,
  budgetPerUnit,
  totalBudget,
  quantity,
  onModeChange,
  onBudgetPerUnitChange,
  onTotalBudgetChange,
}: BudgetInputProps) {
  const calculatedPerUnit =
    quantity > 0 ? Math.max(100, Math.round(totalBudget / quantity)) : budgetPerUnit;

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-xl border border-border bg-secondary/40 p-1">
        <button
          type="button"
          onClick={() => onModeChange("total")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-all",
            mode === "total"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          От общей суммы
        </button>
        <button
          type="button"
          onClick={() => onModeChange("per_unit")}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium transition-all",
            mode === "per_unit"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          От стоимости единицы
        </button>
      </div>

      {mode === "total" ? (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="budget-total">Общая сумма бюджета, ₽</Label>
            <Input
              id="budget-total"
              type="number"
              min={100}
              step={100}
              value={totalBudget || ""}
              onChange={(e) => onTotalBudgetChange(clampInt(e.target.value, LIMITS.budget))}
            />
            <p className="text-xs text-muted-foreground">Введите общий бюджет на весь тираж</p>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <Calculator className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="text-muted-foreground">Расчёт на 1 набор:</p>
              <p className="font-semibold text-primary">
                {formatCurrency(totalBudget)} ÷ {quantity} = {formatCurrency(calculatedPerUnit)}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="budget-per-unit">Бюджет на 1 набор, ₽</Label>
              <Input
                id="budget-per-unit"
                type="number"
                min={100}
                step={100}
                value={budgetPerUnit || ""}
                onChange={(e) =>
                  onBudgetPerUnitChange(clampInt(e.target.value, LIMITS.budget))
                }
              />
              <p className="text-xs text-muted-foreground">Лимит стоимости одного набора</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget-total-per-unit">Общая сумма бюджета, ₽</Label>
              <Input
                id="budget-total-per-unit"
                type="number"
                min={100}
                step={100}
                value={totalBudget || ""}
                onChange={(e) => onTotalBudgetChange(clampInt(e.target.value, LIMITS.budget))}
              />
              <p className="text-xs text-muted-foreground">Общий бюджет на весь тираж</p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="space-y-2 text-sm">
              <p className="text-muted-foreground">
                Подборка соберёт <strong className="text-foreground">несколько разных товаров</strong>{" "}
                в пределах бюджета набора — до {formatCurrency(budgetPerUnit)}.
              </p>
              <p className="font-semibold text-primary">
                На 1 набор: {formatCurrency(totalBudget)} ÷ {quantity} ={" "}
                {formatCurrency(calculatedPerUnit)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
