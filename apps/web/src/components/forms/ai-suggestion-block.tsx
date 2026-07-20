"use client";

import { Sparkles, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

export type SuggestedProduct = {
  id: string;
  name: string;
  category: string;
  price?: number | null;
  stockAvailable?: number;
  colors?: string[];
};

type Props = {
  productNames?: string[];
  products?: SuggestedProduct[];
  setPriceRub?: number | null;
  catalogStats?: { totalInDb?: number; afterFilters?: number; sentToLlm?: number };
  composition?: string | null;
  style?: string | null;
  hint?: string | null;
  usedFallback?: boolean;
  suggesting: boolean;
  disabled?: boolean;
  onSuggest: () => void;
  canSuggest: boolean;
};

export function AiSuggestionBlock({
  productNames,
  products,
  setPriceRub,
  catalogStats,
  composition,
  style,
  hint,
  usedFallback,
  suggesting,
  disabled,
  onSuggest,
  canSuggest,
}: Props) {
  const explanation = composition || style || hint;

  return (
    <Card className="border-primary/20 bg-card/80">
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-lg">Подбор товаров из каталога</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              ИИ подберёт позиции из каталога 2000+ SKU с учётом брифа, бюджета, тиража и остатков
            </p>
          </div>
          <Button
            type="button"
            onClick={onSuggest}
            disabled={disabled || suggesting || !canSuggest}
            className="shrink-0 gap-2"
          >
            {suggesting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Подобрать товары из каталога с помощью ИИ
          </Button>
        </div>
      </CardHeader>

      {(explanation || (productNames && productNames.length > 0) || (products && products.length > 0)) && (
        <CardContent className="space-y-3 border-t border-border/40 pt-4">
          {products && products.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-primary">Подобрано из каталога</p>
              <ul className="space-y-2">
                {products.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-sm"
                  >
                    <div className="font-medium leading-snug">{p.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-[10px]">
                        {p.category}
                      </Badge>
                      {p.price != null && (
                        <span>{formatCurrency(p.price)}</span>
                      )}
                      {p.stockAvailable != null && (
                        <span>остаток {p.stockAvailable.toLocaleString("ru-RU")} шт.</span>
                      )}
                      {p.colors && p.colors.length > 0 && (
                        <span>цвета: {p.colors.slice(0, 4).join(", ")}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {setPriceRub != null && setPriceRub > 0 && (
                <p className="text-xs text-muted-foreground">
                  Сумма набора: <span className="font-semibold text-foreground">{formatCurrency(setPriceRub)}</span> за комплект
                </p>
              )}
            </div>
          ) : productNames && productNames.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-primary mb-1">Подобрано из каталога</p>
              <p className="text-sm">{productNames.join(" · ")}</p>
            </div>
          ) : null}
          {catalogStats && catalogStats.totalInDb != null && (
            <p className="text-[11px] text-muted-foreground">
              Каталог: {catalogStats.totalInDb} SKU → после фильтров {catalogStats.afterFilters} → в подбор {catalogStats.sentToLlm}
            </p>
          )}
          {explanation && (
            <div>
              <p className="text-xs font-medium text-primary mb-1">Почему такой набор</p>
              <p className="text-sm text-muted-foreground leading-relaxed">{explanation}</p>
            </div>
          )}
          {usedFallback && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Использован локальный подбор — LLM был недоступен.
            </p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
