"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Plus, Trash2, Sparkles, Check, X, ExternalLink, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { displayCatalogImageSrc } from "@/lib/product-image";
import { ZoomableImageTrigger } from "@/components/concepts/image-lightbox";
import { suggestProductAdd } from "@/lib/suvenir-client";
import { notify } from "@/lib/notify";
import { pickTargetColorFromHint } from "@/lib/catalog-target-color";
import { setHasProductType } from "@/lib/product-type-key";
import { filterBlacklistedProducts } from "@/lib/blacklist-client";
import { addProductToBlacklist } from "@/components/blacklist/blacklist-panel";
import { useProjectStore } from "@/store/project-store";
import type { ConceptItem } from "@/lib/types";

function formatColor(c: string | { name?: string }): string {
  if (typeof c === "string") return c;
  return c?.name ?? "";
}

interface CatalogProductSetEditorProps {
  requestId: string;
  items: ConceptItem[];
  onChange: (items: ConceptItem[]) => void;
  readOnly?: boolean;
  className?: string;
  onPreviewImage?: (src: string, alt: string) => void;
}

type PendingPick = {
  id: string;
  name: string;
  category: string;
  price?: number | null;
  stockAvailable?: number;
  colors?: string[];
  targetColor?: string;
  catalogImageUrl?: string | null;
  silhouetteImageUrl?: string;
  sourceUrl?: string | null;
  reason?: string;
  mismatches?: string[];
};

export function CatalogProductSetEditor({
  requestId,
  items,
  onChange,
  readOnly = false,
  className,
  onPreviewImage,
}: CatalogProductSetEditorProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [addBrief, setAddBrief] = useState("");
  const [searching, setSearching] = useState(false);
  const [pendingOptions, setPendingOptions] = useState<PendingPick[]>([]);
  const blacklistItems = useProjectStore((s) => s.blacklistItems ?? []);

  const total = items.reduce((s, it) => s + (it.price || 0), 0);

  const handleRemove = (id: string | undefined, name: string) => {
    if (readOnly) return;
    onChange(items.filter((it) => (id ? it.id !== id : it.name !== name)));
  };

  const openAdd = () => {
    setAddOpen(true);
    setAddBrief("");
    setPendingOptions([]);
  };

  const cancelAdd = () => {
    setAddOpen(false);
    setAddBrief("");
    setPendingOptions([]);
  };

  const searchProduct = async () => {
    if (!addBrief.trim()) {
      notify.error("Опишите, какой товар добавить");
      return;
    }
    const currentProductIds = items.map((it) => it.id).filter(Boolean) as string[];
    setSearching(true);
    setPendingOptions([]);
    try {
      const result = await suggestProductAdd(requestId, {
        currentProductIds,
        hint: addBrief.trim(),
      });
      const inSet = new Set(items.map((it) => it.id).filter(Boolean));
      const options = filterBlacklistedProducts(
        result.suggestions
          .filter((s) => !inSet.has(s.product.id))
          .filter((s) => !setHasProductType(items, s.product.name, s.product.category))
          .map((s) => ({
            ...s.product,
            reason: s.reason,
            mismatches: s.mismatches,
            targetColor:
              s.targetColor ??
              pickTargetColorFromHint(addBrief, s.product.colors ?? []),
          })),
        blacklistItems,
      );
      if (options.length === 0) {
        notify.info("Подходящих товаров не найдено — попробуйте другой запрос");
        return;
      }
      setPendingOptions(options);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Не удалось подобрать товар");
    } finally {
      setSearching(false);
    }
  };

  const confirmAdd = (pending: PendingPick) => {
    if (setHasProductType(items, pending.name, pending.category)) {
      notify.error("В наборе уже есть товар этого типа — выберите другую категорию");
      return;
    }
    const url = pending.catalogImageUrl
      ? displayCatalogImageSrc(pending.catalogImageUrl)
      : pending.silhouetteImageUrl
        ? displayCatalogImageSrc(pending.silhouetteImageUrl)
        : undefined;
    onChange([
      ...items,
      {
        id: pending.id,
        name: pending.name,
        description: pending.category,
        price: pending.price != null ? Math.round(pending.price) : 0,
        stockAvailable: pending.stockAvailable,
        colors: pending.colors?.map(formatColor).filter(Boolean),
        targetColor: pending.targetColor,
        imageUrl: url,
        sourceUrl: pending.sourceUrl ?? null,
      },
    ]);
    notify.success("Товар добавлен в набор");
    cancelAdd();
  };

  const pendingImageSrc = (p: PendingPick) =>
    displayCatalogImageSrc(p.catalogImageUrl) ||
    displayCatalogImageSrc(p.silhouetteImageUrl) ||
    null;

  return (
    <Card className={cn("h-full min-w-0 overflow-hidden border-border/50", className)}>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base">Состав набора</CardTitle>
        {!readOnly && !addOpen && (
          <Button size="sm" variant="outline" onClick={openAdd} className="gap-1">
            <Plus className="h-4 w-4" />
            Добавить
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        <AnimatePresence mode="wait">
          {addOpen && !readOnly && (
            <motion.div
              key="add-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28 }}
              className="overflow-hidden"
            >
              <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">Новый товар в набор</p>
                  <Button size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={cancelAdd}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Textarea
                  placeholder="Опишите товар: тип, цвет, материал… Например: «серая чашка 300 мл» или «зелёная термокружка для офиса»"
                  value={addBrief}
                  onChange={(e) => setAddBrief(e.target.value.slice(0, 400))}
                  className="min-h-[88px] resize-none bg-background/80"
                  disabled={searching}
                />
                {pendingOptions.length === 0 && (
                  <Button
                    className="w-full gap-2"
                    disabled={searching || !addBrief.trim()}
                    onClick={() => void searchProduct()}
                  >
                    {searching ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Ищем 5 вариантов в каталоге…
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        Подобрать 5 вариантов
                      </>
                    )}
                  </Button>
                )}

                <AnimatePresence>
                  {pendingOptions.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {pendingOptions.length} вариантов по вашему запросу
                        </p>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setPendingOptions([])}
                        >
                          Изменить запрос
                        </Button>
                      </div>
                      {pendingOptions.map((pending) => {
                        const imgUrl = pendingImageSrc(pending);
                        return (
                          <div
                            key={pending.id}
                            className="flex gap-3 rounded-lg border border-border bg-card p-3"
                          >
                            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md bg-secondary/30">
                              {imgUrl ? (
                                <Image
                                  src={imgUrl}
                                  alt={pending.name}
                                  fill
                                  className="object-contain p-1"
                                  unoptimized
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                                  SKU
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1 space-y-1">
                              <p className="text-sm font-medium leading-snug">{pending.name}</p>
                              <Badge variant="outline" className="text-[10px]">
                                {pending.category}
                              </Badge>
                              <div className="flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                                {pending.price != null && (
                                  <span className="font-semibold text-primary">
                                    {formatCurrency(pending.price)}
                                  </span>
                                )}
                                {pending.stockAvailable != null && (
                                  <span>· остаток {formatNumber(pending.stockAvailable)} шт.</span>
                                )}
                              </div>
                              {pending.colors && pending.colors.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {pending.colors.map((c) => (
                                    <Badge
                                      key={formatColor(c)}
                                      variant={
                                        pending.targetColor &&
                                        formatColor(c) === pending.targetColor
                                          ? "default"
                                          : "secondary"
                                      }
                                      className="text-[10px]"
                                    >
                                      {formatColor(c)}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              {pending.reason && (
                                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                                  {pending.reason}
                                </p>
                              )}
                              {pending.mismatches && pending.mismatches.length > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {pending.mismatches.map((note) => (
                                    <Badge
                                      key={note}
                                      variant="outline"
                                      className="border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-normal"
                                    >
                                      {note}
                                    </Badge>
                                  ))}
                                </div>
                              )}
                              <Button
                                size="sm"
                                className="mt-1 gap-1 h-7"
                                onClick={() => confirmAdd(pending)}
                              >
                                <Check className="h-3.5 w-3.5" />
                                В набор
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {items.length === 0 && !addOpen ? (
          <p className="text-sm text-muted-foreground">Нет товаров в наборе</p>
        ) : (
          <AnimatePresence mode="popLayout">
            {items.map((item) => (
              <motion.div
                key={item.id ?? item.name}
                layout
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8, height: 0 }}
                transition={{ duration: 0.2 }}
                className="flex min-w-0 gap-3 rounded-lg border border-border/50 p-3"
              >
                {item.imageUrl ? (
                  onPreviewImage ? (
                    <ZoomableImageTrigger
                      src={displayCatalogImageSrc(item.imageUrl)}
                      alt={item.name}
                      onOpen={() => onPreviewImage(displayCatalogImageSrc(item.imageUrl)!, item.name)}
                      className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-secondary/30"
                    >
                      <Image
                        src={displayCatalogImageSrc(item.imageUrl)}
                        alt={item.name}
                        fill
                        className="object-contain p-1"
                        unoptimized
                      />
                    </ZoomableImageTrigger>
                  ) : (
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-secondary/30">
                      <Image
                        src={displayCatalogImageSrc(item.imageUrl)}
                        alt={item.name}
                        fill
                        className="object-contain p-1"
                        unoptimized
                      />
                    </div>
                  )
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md bg-secondary/30 text-xs text-muted-foreground">
                    SKU
                  </div>
                )}
                <div className="min-w-0 flex-1 overflow-hidden">
                  <p className="break-words font-medium leading-snug">{item.name}</p>
                  {item.description && (
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {item.colors?.map((c) => (
                      <Badge key={formatColor(c)} variant="secondary" className="text-[10px] font-normal">
                        {formatColor(c)}
                      </Badge>
                    ))}
                    {item.stockAvailable != null && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        Остаток: {formatNumber(item.stockAvailable)} шт.
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {item.price > 0 && (
                      <span className="text-sm font-semibold text-primary">
                        {formatCurrency(item.price)}
                      </span>
                    )}
                    {!readOnly && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-amber-600"
                          title="В Black List"
                          onClick={() =>
                            void addProductToBlacklist({ id: item.id, name: item.name })
                          }
                        >
                          <Ban className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => handleRemove(item.id, item.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                  {item.sourceUrl && (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-[11px]"
                    >
                      <a href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3 w-3" />
                        Посмотреть у поставщика
                      </a>
                    </Button>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        )}

        {items.length > 0 && (
          <div className="flex items-center justify-between border-t border-border/50 pt-3 text-sm">
            <span className="text-muted-foreground">Итого за набор</span>
            <span className="font-bold text-primary">{formatCurrency(total)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
