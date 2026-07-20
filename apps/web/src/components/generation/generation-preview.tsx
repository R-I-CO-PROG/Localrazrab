"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, X } from "lucide-react";
import { notify } from "@/lib/notify";
import type { CatalogProduct, SuvenirAsset, GenerationResultMeta } from "@/lib/suvenir-types";
import { assetUrl } from "@/lib/asset-url";
import { productImageUrl } from "@/lib/product-image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Props = {
  category: string;
  budgetMin?: number;
  budgetMax?: number;
  quantity?: number;
  colors: string[];
  selectedProducts: CatalogProduct[];
  assets: SuvenirAsset[];
  onRemoveProduct?: (id: string) => void;
  status?: string;
  resultImageUrl?: string | null;
  resultMeta?: GenerationResultMeta | null;
  errorMessage?: string | null;
  layout?: "compact" | "hero";
};

function statusLabel(meta?: GenerationResultMeta | null) {
  if (meta?.aiEnhanced) return "AI-визуализация";
  if (meta?.usedAiFallback) return "Черновой вариант";
  if (meta?.isBrandedMockup) return "Черновой вариант";
  return null;
}

export function GenerationPreview({
  category,
  budgetMin,
  budgetMax,
  quantity,
  colors,
  selectedProducts,
  assets,
  onRemoveProduct,
  status,
  resultImageUrl,
  resultMeta,
  errorMessage,
  layout = "compact",
}: Props) {
  const [imageError, setImageError] = useState(false);
  const lastErrorRef = useRef<string | null>(null);
  const imageSrc = resultImageUrl ? assetUrl(resultImageUrl) : null;
  const isHero = layout === "hero";
  const label = statusLabel(resultMeta);

  useEffect(() => setImageError(false), [resultImageUrl]);

  useEffect(() => {
    if (status === "failed" && errorMessage && errorMessage !== lastErrorRef.current) {
      lastErrorRef.current = errorMessage;
      notify.error(errorMessage);
    }
    if (status !== "failed") {
      lastErrorRef.current = null;
    }
  }, [status, errorMessage]);

  if (isHero) {
    return (
      <div className="relative flex min-h-[min(70vh,800px)] flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/80">
        <div className="absolute left-4 top-4 z-10 flex flex-wrap gap-2">
          <Badge variant="secondary">{category || "Концепция"}</Badge>
          {quantity ? <Badge variant="outline">{quantity} шт.</Badge> : null}
          {label && status === "done" && <Badge className="bg-green-600">{label}</Badge>}
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          {imageSrc && !imageError ? (
            <img
              src={imageSrc}
              alt="Результат генерации"
              onError={() => {
                setImageError(true);
                notify.error("Не удалось загрузить изображение результата");
              }}
              className="max-h-full max-w-full object-contain drop-shadow-2xl"
            />
          ) : status === "generating" ? (
            <div className="space-y-4 text-center">
              <Loader2 className="mx-auto h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Собираем финальную сцену…
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Результат появится здесь</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="border-border/50 bg-card/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Параметры</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Категория</span>
            <span className="text-right font-medium">{category || "—"}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Бюджет / ед.</span>
            <span className="font-medium">
              {budgetMin || budgetMax ? `${budgetMin ?? "?"} – ${budgetMax ?? "?"} ₽` : "—"}
            </span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Тираж</span>
            <span>{quantity ? `${quantity} шт.` : "—"}</span>
          </div>
        </CardContent>
      </Card>

      {resultImageUrl && imageSrc ? (
        <Card className="overflow-hidden border-primary/20 bg-card/80">
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm">AI-фото</CardTitle>
            {label && (
              <Badge variant="secondary" className="text-[10px]">
                {label}
              </Badge>
            )}
          </CardHeader>
          <CardContent>
            {imageError ? (
              <p className="text-sm text-muted-foreground">Не удалось загрузить изображение</p>
            ) : (
              <img
                src={imageSrc}
                alt="Концепция"
                className="w-full rounded-lg"
                onError={() => {
                setImageError(true);
                notify.error("Не удалось загрузить изображение результата");
              }}
              />
            )}
          </CardContent>
        </Card>
      ) : status === "generating" ? (
        <Card className="border-border/50 bg-card/80">
          <CardContent className="space-y-3 py-10 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <p className="text-sm font-medium">Собираем финальную сцену…</p>
            <p className="text-xs text-muted-foreground">Настраиваем композицию и брендовые акценты</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50 bg-card/80">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Набор</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedProducts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Добавьте товары из каталога</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {selectedProducts.map((p) => (
                  <div key={p.id} className="relative rounded-lg border border-border/50 p-1">
                    {onRemoveProduct && (
                      <button
                        type="button"
                        onClick={() => onRemoveProduct(p.id)}
                        className="absolute right-0.5 top-0.5 z-10 rounded bg-background/80 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                    <img
                      src={assetUrl(productImageUrl(p))}
                      alt={p.name}
                      className="aspect-square w-full rounded object-cover bg-muted"
                    />
                    <p className="mt-1 line-clamp-2 text-[10px] leading-tight">{p.name}</p>
                  </div>
                ))}
              </div>
            )}
            {!assets.some((a) => a.type === "logo") && selectedProducts.length > 0 && (
              <p className="mt-3 text-xs text-amber-600">Загрузите логотип для брендирования сцены</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
