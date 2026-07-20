"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, LayoutGrid, ListTree, Loader2, Package } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  WITHOUT_SUBCATEGORY,
  WITHOUT_SUBSUBCATEGORY,
  parseCatalogSubcategory,
  parseCatalogSubsubcategory,
} from "@/lib/catalog-taxonomy";

interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  price: number | null;
  stockAvailable: number;
  silhouetteImageUrl: string;
  sourceId: string | null;
  sourceUrl: string | null;
  description: string | null;
}

interface ProductsListResponse {
  items?: CatalogProduct[];
  products?: CatalogProduct[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
}

interface ProductsStatsResponse {
  total: number;
  categories: { name: string; count: number }[];
}

interface CategoryMapNode {
  category: string;
  sku: number;
  subcategories: {
    subcategory: string;
    sku: number;
    subsubcategories: { subsubcategory: string; sku: number }[];
  }[];
}

interface CategoryMapPayload {
  totalProducts: number;
  tree: CategoryMapNode[];
}

type ViewMode = "grid" | "grouped";

const PAGE_SIZE = 24;

function ProductCard({ product }: { product: CatalogProduct }) {
  const sub = parseCatalogSubcategory(product.subcategory);
  const subsub = parseCatalogSubsubcategory(product.subcategory, product.sourceUrl);

  return (
    <Card className="overflow-hidden">
      <div className="aspect-square bg-muted/40 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={product.silhouetteImageUrl}
          alt={product.name}
          className="h-full w-full object-contain"
          loading="lazy"
        />
      </div>
      <CardContent className="space-y-1 p-3">
        <p className="line-clamp-2 text-sm font-medium">{product.name}</p>
        <div className="flex flex-wrap gap-1">
          <Badge variant="secondary" className="text-[10px]">
            {product.category}
          </Badge>
          {sub !== WITHOUT_SUBCATEGORY && (
            <Badge variant="outline" className="text-[10px]">
              {sub}
            </Badge>
          )}
          {subsub !== WITHOUT_SUBSUBCATEGORY && (
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              {subsub}
            </Badge>
          )}
          {product.sourceId && (
            <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">
              {product.sourceId}
            </Badge>
          )}
          {product.price != null && (
            <Badge variant="outline" className="text-[10px]">
              {Math.round(product.price)} ₽
            </Badge>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">Остаток: {product.stockAvailable}</p>
      </CardContent>
    </Card>
  );
}

function parseProductsResponse(data: ProductsListResponse): {
  items: CatalogProduct[];
  total: number;
  page: number;
  totalPages: number;
} {
  const items = Array.isArray(data)
    ? data
    : data.items ?? data.products ?? [];
  const total = Array.isArray(data) ? data.length : (data.total ?? items.length);
  const page = Array.isArray(data) ? 1 : (data.page ?? 1);
  const totalPages = Array.isArray(data)
    ? Math.max(1, Math.ceil(total / PAGE_SIZE))
    : (data.totalPages ?? Math.max(1, Math.ceil(total / PAGE_SIZE)));
  return { items, total, page, totalPages };
}

/** API на VPS фильтрует по category OR subcategory contains — передаём самый узкий уровень */
function apiCategoryFilter(category: string, subcategory: string, subsubcategory: string): string {
  if (subsubcategory) return subsubcategory;
  if (subcategory) return subcategory;
  return category;
}

export function LogicCatalogPanel() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [statsCategories, setStatsCategories] = useState<{ name: string; count: number }[]>([]);
  const [categoryMap, setCategoryMap] = useState<CategoryMapNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [subsubcategory, setSubsubcategory] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [statsRes, mapRes] = await Promise.all([
          fetch("/api/backend/products/stats"),
          fetch("/api/admin/catalog-category-map"),
        ]);
        if (statsRes.ok) {
          const stats = (await statsRes.json()) as ProductsStatsResponse;
          if (!cancelled) {
            setStatsCategories(stats.categories ?? []);
            if (!category && !subcategory && !subsubcategory && !search.trim()) {
              setTotalProducts(stats.total ?? 0);
            }
          }
        }
        if (mapRes.ok) {
          const map = (await mapRes.json()) as CategoryMapPayload;
          if (!cancelled) setCategoryMap(map.tree ?? []);
        }
      } catch {
        /* optional enrichment */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [category, subcategory, subsubcategory, search]);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (search.trim()) params.set("search", search.trim());
      const catFilter = apiCategoryFilter(category, subcategory, subsubcategory);
      if (catFilter) params.set("category", catFilter);

      const res = await fetch(`/api/backend/products?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ProductsListResponse;
      const parsed = parseProductsResponse(data);
      setProducts(parsed.items);
      setTotalProducts(parsed.total);
      setTotalPages(parsed.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось загрузить каталог");
      setProducts([]);
      setTotalProducts(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, search, category, subcategory, subsubcategory]);

  useEffect(() => {
    const timer = setTimeout(() => loadProducts(), search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [loadProducts, search]);

  const categories = useMemo(() => {
    if (statsCategories.length > 0) {
      return statsCategories
        .map((c) => [c.name, c.count] as [string, number])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
    }
    return categoryMap
      .map((c) => [c.category, c.sku] as [string, number])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  }, [statsCategories, categoryMap]);

  const subcategories = useMemo(() => {
    const node = categoryMap.find((c) => c.category === category);
    if (node) {
      return node.subcategories
        .map((s) => [s.subcategory, s.sku] as [string, number])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
    }
    const counts = new Map<string, number>();
    for (const p of products) {
      if (category && p.category !== category) continue;
      const label = parseCatalogSubcategory(p.subcategory);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  }, [categoryMap, category, products]);

  const subsubcategories = useMemo(() => {
    const node = categoryMap.find((c) => c.category === category);
    const subNode = node?.subcategories.find((s) => s.subcategory === subcategory);
    if (subNode) {
      return subNode.subsubcategories
        .map((s) => [s.subsubcategory, s.sku] as [string, number])
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
    }
    const counts = new Map<string, number>();
    for (const p of products) {
      if (category && p.category !== category) continue;
      if (subcategory && parseCatalogSubcategory(p.subcategory) !== subcategory) continue;
      const label = parseCatalogSubsubcategory(p.subcategory, p.sourceUrl);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ru"));
  }, [categoryMap, category, subcategory, products]);

  const grouped = useMemo(() => {
    const byCategory = new Map<string, Map<string, Map<string, CatalogProduct[]>>>();
    for (const p of products) {
      const cat = p.category;
      const sub = parseCatalogSubcategory(p.subcategory);
      const subsub = parseCatalogSubsubcategory(p.subcategory, p.sourceUrl);
      if (!byCategory.has(cat)) byCategory.set(cat, new Map());
      const subMap = byCategory.get(cat)!;
      if (!subMap.has(sub)) subMap.set(sub, new Map());
      const subsubMap = subMap.get(sub)!;
      if (!subsubMap.has(subsub)) subsubMap.set(subsub, []);
      subsubMap.get(subsub)!.push(p);
    }
    return [...byCategory.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], "ru"))
      .map(([cat, subMap]) => ({
        category: cat,
        subcategories: [...subMap.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], "ru"))
          .map(([sub, subsubMap]) => ({
            subcategory: sub,
            subsubcategories: [...subsubMap.entries()]
              .sort((a, b) => a[0].localeCompare(b[0], "ru"))
              .map(([subsub, items]) => ({ subsubcategory: subsub, items })),
          })),
      }));
  }, [products]);

  const breadcrumb = useMemo(() => {
    if (!category && !subcategory && !subsubcategory) return null;
    const parts: string[] = [];
    if (category) parts.push(category);
    if (subcategory) parts.push(subcategory);
    if (subsubcategory) parts.push(subsubcategory);
    return parts;
  }, [category, subcategory, subsubcategory]);

  function handleCategoryChange(value: string) {
    setCategory(value === "all" ? "" : value);
    setSubcategory("");
    setSubsubcategory("");
    setPage(1);
  }

  function handleSubcategoryChange(value: string) {
    setSubcategory(value === "all" ? "" : value);
    setSubsubcategory("");
    setPage(1);
  }

  function handleSubsubcategoryChange(value: string) {
    setSubsubcategory(value === "all" ? "" : value);
    setPage(1);
  }

  function resetFilters() {
    setCategory("");
    setSubcategory("");
    setSubsubcategory("");
    setPage(1);
  }

  const filteredCount = totalProducts;
  const catalogTotal =
    statsCategories.reduce((n, c) => n + c.count, 0) ||
    categoryMap.reduce((n, c) => n + c.sku, 0) ||
    totalProducts;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Каталог IMBA в PostgreSQL · {catalogTotal.toLocaleString("ru-RU")} SKU · фильтр: категория
        → подкатегория → подподкатегория
      </p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="h-4 w-4" />
            Навигация по каталогу
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-3 xl:flex-row xl:flex-wrap">
            <Input
              placeholder="Поиск по названию…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="xl:max-w-xs"
            />
            <Select value={category || "all"} onValueChange={handleCategoryChange}>
              <SelectTrigger className="xl:w-60">
                <SelectValue placeholder="1. Категория" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">Все категории ({catalogTotal.toLocaleString("ru-RU")})</SelectItem>
                {categories.map(([cat, count]) => (
                  <SelectItem key={cat} value={cat}>
                    {cat} ({count.toLocaleString("ru-RU")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={subcategory || "all"}
              onValueChange={handleSubcategoryChange}
              disabled={!category && subcategories.length === 0}
            >
              <SelectTrigger className="xl:w-60">
                <SelectValue placeholder="2. Подкатегория" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">
                  {category ? "Все подкатегории" : "Сначала выберите категорию"}
                </SelectItem>
                {subcategories.map(([sub, count]) => (
                  <SelectItem key={sub} value={sub}>
                    {sub} ({count.toLocaleString("ru-RU")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={subsubcategory || "all"}
              onValueChange={handleSubsubcategoryChange}
              disabled={!subcategory && subsubcategories.length === 0}
            >
              <SelectTrigger className="xl:w-60">
                <SelectValue placeholder="3. Подподкатегория" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all">
                  {subcategory ? "Все подподкатегории" : "Сначала выберите подкатегорию"}
                </SelectItem>
                {subsubcategories.map(([subsub, count]) => (
                  <SelectItem key={subsub} value={subsub}>
                    {subsub} ({count.toLocaleString("ru-RU")})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(category || subcategory || subsubcategory) && (
              <Button type="button" variant="ghost" size="sm" onClick={resetFilters}>
                Сбросить
              </Button>
            )}
          </div>

          {breadcrumb && (
            <div className="flex flex-wrap items-center gap-1 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Путь:</span>
              {breadcrumb.map((part, i) => (
                <span key={`${part}-${i}`} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className={i === breadcrumb.length - 1 ? "font-medium" : ""}>{part}</span>
                </span>
              ))}
              <span className="ml-2 text-muted-foreground">
                · {filteredCount.toLocaleString("ru-RU")} SKU
              </span>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={viewMode === "grid" ? "default" : "outline"}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="mr-1 h-4 w-4" />
              Сетка
            </Button>
            <Button
              type="button"
              size="sm"
              variant={viewMode === "grouped" ? "default" : "outline"}
              onClick={() => setViewMode("grouped")}
            >
              <ListTree className="mr-1 h-4 w-4" />
              По категориям
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Загрузка…
        </div>
      ) : error ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      ) : viewMode === "grouped" ? (
        <>
          <p className="text-sm text-muted-foreground">
            {filteredCount.toLocaleString("ru-RU")} товаров · страница {page} (показано{" "}
            {products.length} на странице)
          </p>
          <div className="space-y-8">
            {grouped.map((group) => (
              <section key={group.category} className="space-y-4">
                <h3 className="border-b pb-2 text-lg font-semibold">{group.category}</h3>
                {group.subcategories.map((sub) => (
                  <div key={`${group.category}-${sub.subcategory}`} className="space-y-3 pl-2">
                    <h4 className="text-sm font-medium text-muted-foreground">{sub.subcategory}</h4>
                    {sub.subsubcategories.map((ss) => (
                      <div
                        key={`${group.category}-${sub.subcategory}-${ss.subsubcategory}`}
                        className="space-y-2 pl-3"
                      >
                        <h5 className="text-xs font-medium text-muted-foreground/80">
                          {ss.subsubcategory} ({ss.items.length})
                        </h5>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                          {ss.items.map((p) => (
                            <ProductCard key={p.id} product={p} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </section>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Показано {products.length} из {filteredCount.toLocaleString("ru-RU")} (страница {page}{" "}
            / {totalPages.toLocaleString("ru-RU")})
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                ←
              </Button>
              <span className="text-sm text-muted-foreground">
                {page} / {totalPages.toLocaleString("ru-RU")}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                →
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
