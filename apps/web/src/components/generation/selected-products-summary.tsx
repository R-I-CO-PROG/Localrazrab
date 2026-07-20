"use client";

import { X } from "lucide-react";
import type { CatalogProduct } from "@/lib/suvenir-types";
import { assetUrl } from "@/lib/asset-url";
import { productImageUrl } from "@/lib/product-image";
import { Badge } from "@/components/ui/badge";

type Props = {
  products: CatalogProduct[];
  onRemove?: (id: string) => void;
  disabled?: boolean;
};

export function SelectedProductsSummary({ products, onRemove, disabled }: Props) {
  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/30 p-4 text-center">
        <p className="text-sm text-muted-foreground">Пока нет товаров в наборе</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Выберите из каталога или «Подобрать товары из каталога с помощью ИИ»
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {products.map((p) => (
        <Badge key={p.id} variant="secondary" className="gap-2 py-1.5 pl-1 pr-2 text-sm font-normal">
          <img
            src={assetUrl(productImageUrl(p))}
            alt=""
            className="h-7 w-7 rounded object-cover bg-muted"
          />
          <span className="max-w-[140px] truncate">{p.name}</span>
          {onRemove && !disabled && (
            <button type="button" onClick={() => onRemove(p.id)} className="text-muted-foreground hover:text-destructive">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </Badge>
      ))}
    </div>
  );
}
