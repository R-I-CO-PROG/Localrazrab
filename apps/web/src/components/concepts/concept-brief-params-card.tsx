"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { formatNumber, cn } from "@/lib/utils";
import type { ConceptGenerationInput } from "@/lib/generation-payload";
import type { GenerationMode } from "@/lib/types";
import { FileText, Image as ImageIcon } from "lucide-react";
import { BudgetSpendIndicator } from "@/components/concepts/budget-spend-indicator";

const MODE_LABELS: Record<GenerationMode, string> = {
  catalog: "Каталог товаров",
  creative: "AI-концепции",
};

interface ConceptBriefParamsCardProps {
  input: ConceptGenerationInput;
  /** Краткий fallback, если полного брифа нет в store */
  briefExcerpt?: string;
  selectedConceptTitle?: string;
  /** Актуальный состав набора (после добавления/удаления SKU) */
  catalogSetItemCount?: number;
  catalogSetTotalCost?: number;
  compact?: boolean;
  className?: string;
}

export function ConceptBriefParamsCard({
  input,
  briefExcerpt,
  selectedConceptTitle,
  catalogSetItemCount,
  catalogSetTotalCost,
  compact = false,
  className,
}: ConceptBriefParamsCardProps) {
  const briefText = input.description.trim() || briefExcerpt?.trim() || "";
  const hasLogo = input.files.some((f) => f.fileType === "LOGO");
  const liveSetItemCount = catalogSetItemCount ?? input.setItemCount ?? 4;
  const liveSetTotalCost = catalogSetTotalCost;

  return (
    <Card className={cn("border-border/50 h-full", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Параметры брифа</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {briefText && (
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Описание задачи</p>
            <p
              className={cn(
                "text-muted-foreground leading-relaxed whitespace-pre-wrap",
                compact ? "line-clamp-6" : "",
              )}
            >
              {briefText}
            </p>
          </div>
        )}

        {briefText && <Separator />}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Категория</p>
            <p className="font-medium leading-snug">{input.category}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">Режим</p>
            <p className="font-medium">{MODE_LABELS[input.generationMode]}</p>
          </div>
        </div>

        {input.generationMode === "catalog" && input.budget > 0 && (
          <BudgetSpendIndicator
            budgetPerSet={input.budget}
            spent={liveSetTotalCost}
          />
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Тираж</p>
            <p className="font-medium">{formatNumber(input.quantity)} шт.</p>
          </div>
          {input.generationMode === "catalog" && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Товаров в наборе</p>
              <p className="font-medium">{liveSetItemCount} SKU</p>
            </div>
          )}
        </div>

        {input.colors.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Фирменные цвета</p>
              <div className="flex flex-wrap gap-2">
                {input.colors.map((color) => (
                  <div
                    key={color}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-secondary/30 px-2 py-1"
                  >
                    <div
                      className="h-5 w-5 shrink-0 rounded-md border border-border"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-mono text-[10px] text-muted-foreground">{color}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {input.allowedItems.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Разрешённые позиции</p>
              <div className="flex flex-wrap gap-1.5">
                {input.allowedItems.map((item) => (
                  <Badge key={item} variant="secondary" className="text-[10px] font-normal">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {input.excludedItems.length > 0 && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground mb-2">Исключения</p>
              <div className="flex flex-wrap gap-1.5">
                {input.excludedItems.map((item) => (
                  <Badge
                    key={item}
                    variant="outline"
                    className="border-destructive/30 text-[10px] font-normal text-destructive"
                  >
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}

        {(hasLogo || input.files.length > 0) && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground mb-2">
                Загруженные файлы ({input.files.length})
              </p>
              <div className="space-y-1.5">
                {input.files.map((file) => (
                  <div key={file.id} className="flex items-center gap-2 text-xs text-muted-foreground">
                    {file.type.startsWith("image/") ? (
                      <ImageIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <FileText className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                    <span className="truncate">{file.name}</span>
                    {file.fileType === "LOGO" && (
                      <Badge variant="outline" className="ml-auto shrink-0 text-[9px]">
                        Логотип
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {selectedConceptTitle && (
          <>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground mb-1">Выбранная идея</p>
              <p className="font-medium leading-snug">{selectedConceptTitle}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
