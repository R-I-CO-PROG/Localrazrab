"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { getEffectiveCategory } from "@/lib/category-utils";
import { useProjectStore } from "@/store/project-store";
import { Button } from "@/components/ui/button";
import { FileText, Image as ImageIcon, RotateCcw, X } from "lucide-react";

export function ProjectSidebar() {
  const formData = useProjectStore((s) => s.formData);
  const resetBrandColors = useProjectStore((s) => s.resetBrandColors);
  const removeColor = useProjectStore((s) => s.removeColor);
  const category = getEffectiveCategory(formData.categoryPreset, formData.categoryCustom);
  const isCatalog = formData.generationMode === "catalog";

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      className="sticky top-24 w-full min-w-0 max-w-full space-y-4"
    >
      <Card className="glass-card min-w-0 overflow-hidden border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Параметры проекта</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0 space-y-4 overflow-hidden">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Категория</p>
            <p className="break-words text-sm font-medium leading-snug">{category}</p>
          </div>

          <Separator />

          <div className="grid min-w-0 grid-cols-2 gap-3">
            <div className="min-w-0 overflow-hidden">
              <p className="text-xs text-muted-foreground mb-1">
                {formData.budgetMode === "per_unit" ? "Бюджет набора" : "На единицу"}
              </p>
              <p className="break-all text-sm font-semibold text-primary sm:text-base">
                {formatCurrency(formData.budget)}
              </p>
            </div>
            <div className="min-w-0 overflow-hidden">
              <p className="text-xs text-muted-foreground mb-1">Общий бюджет</p>
              <p className="break-all text-sm font-semibold sm:text-base">
                {formatCurrency(formData.totalBudget)}
              </p>
            </div>
          </div>

          <div className="min-w-0">
            <p className="text-xs text-muted-foreground mb-1">Тираж</p>
            <p className="break-all text-sm font-medium">
              {formatNumber(formData.quantity)} шт.
            </p>
          </div>

          {isCatalog && formData.useProductCountLimit && (
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground mb-1">Товаров в наборе</p>
              <p className="text-sm font-medium tabular-nums">
                {formData.minProductsPerSet}–{formData.maxProductsPerSet} SKU
              </p>
            </div>
          )}

          <Separator />

          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">Цвета</p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={resetBrandColors}
              >
                <RotateCcw className="h-3 w-3" />
                Сбросить
              </Button>
            </div>
            {formData.colors.length === 0 ? (
              <p className="text-xs text-muted-foreground">Нет выбранных цветов</p>
            ) : (
            <div className="flex min-w-0 w-full flex-wrap gap-2">
              {formData.colors.map((color) => (
                <div
                  key={color}
                  className="group relative flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-border bg-secondary/30 py-1 pl-2 pr-7"
                >
                  <div
                    className="h-5 w-5 shrink-0 rounded-md border border-border"
                    style={{ backgroundColor: color }}
                  />
                  <span className="min-w-0 break-all font-mono text-[10px] text-muted-foreground">
                    {color}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeColor(color)}
                    className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-destructive opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/10"
                    aria-label={`Удалить ${color}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
            )}
          </div>

          {isCatalog && formData.allowedItems.length > 0 && (
            <>
              <Separator />
              <div className="min-w-0 w-full overflow-hidden">
                <p className="text-xs text-muted-foreground mb-2">Разрешено</p>
                <div className="flex min-w-0 w-full flex-wrap gap-1.5">
                  {formData.allowedItems.map((item) => (
                    <span
                      key={item}
                      title={item}
                      className={cn(
                        "rounded-lg border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-medium leading-snug text-primary",
                        "min-w-0 break-all [overflow-wrap:anywhere]",
                        item.length > 20 ? "w-full max-w-full" : "max-w-full"
                      )}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {isCatalog && formData.excludedItems.length > 0 && (
            <>
              <Separator />
              <div className="min-w-0 w-full overflow-hidden">
                <p className="text-xs text-muted-foreground mb-2">Запрещено</p>
                <div className="flex min-w-0 w-full flex-wrap gap-1.5">
                  {formData.excludedItems.map((item) => (
                    <span
                      key={item}
                      title={item}
                      className={cn(
                        "rounded-lg border border-destructive/30 bg-destructive/5 px-2 py-1 text-[10px] font-medium leading-snug text-destructive",
                        "min-w-0 break-all [overflow-wrap:anywhere]",
                        item.length > 20 ? "w-full max-w-full" : "max-w-full"
                      )}
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </>
          )}

          {formData.files.length > 0 && (
            <>
              <Separator />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground mb-2">
                  Файлы ({formData.files.length})
                </p>
                <div className="space-y-2">
                  {formData.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex min-w-0 items-center gap-2 text-xs"
                    >
                      {file.type.startsWith("image/") ? (
                        <ImageIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                      )}
                      <span className="truncate">{file.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Стоимость генерации</p>
          <p className="text-lg font-semibold">5 кредитов</p>
          <p className="text-xs text-muted-foreground mt-1">
            5 уникальных концепций · визуализация создаётся отдельно
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
