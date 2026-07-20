"use client";

import { useState, useEffect } from "react";
import { Plus, Search, PackageOpen } from "lucide-react";
import type { CatalogProduct } from "@/lib/suvenir-types";
import { assetUrl } from "@/lib/asset-url";
import { productImageUrl } from "@/lib/product-image";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  products: CatalogProduct[];
  selectedIds: string[];
  onAdd: (productId: string) => void;
  disabled?: boolean;
};

export function ProductCatalog({ products, selectedIds, onAdd, disabled }: Props) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [filtered, setFiltered] = useState<CatalogProduct[]>(products);
  const categories = [...new Set(products.map((p) => p.category))].sort();

  useEffect(() => {
    let list = products;
    if (category) list = list.filter((p) => p.category === category);
    if (search) list = list.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
    setFiltered(list);
  }, [products, search, category]);

  if (products.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border p-8 text-center">
        <PackageOpen className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium">Каталог загружается…</p>
        <p className="mt-1 text-xs text-muted-foreground">Проверьте, что API запущен на :3001</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Поиск по каталогу…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={category || "__all__"} onValueChange={(v) => setCategory(v === "__all__" ? "" : v)}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Категория" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Все категории</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-xl border border-border/50 p-6 text-center text-sm text-muted-foreground">
          Ничего не найдено
        </p>
      ) : (
        <div className="grid max-h-80 grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map((product) => {
            const added = selectedIds.includes(product.id);
            return (
              <div
                key={product.id}
                className={`relative flex flex-col rounded-xl border p-2 transition-all ${
                  added ? "border-primary/40 bg-primary/5 ring-1 ring-primary/20" : "border-border/60 hover:border-primary/30"
                }`}
              >
                {added && (
                  <span className="absolute left-2 top-2 z-10 rounded bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    В наборе
                  </span>
                )}
                <div className="mb-2 aspect-square overflow-hidden rounded-lg bg-muted">
                  <img
                    src={assetUrl(productImageUrl(product))}
                    alt={product.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="flex-1 px-1 text-center text-xs font-medium leading-tight">{product.name}</span>
                <Button
                  type="button"
                  variant={added ? "secondary" : "outline"}
                  size="sm"
                  disabled={disabled || added}
                  onClick={() => onAdd(product.id)}
                  className="mt-2 h-8 w-full gap-1 text-xs"
                >
                  <Plus className="h-3 w-3" />
                  {added ? "Добавлен" : "Добавить"}
                </Button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
