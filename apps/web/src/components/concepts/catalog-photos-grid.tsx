"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Package } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { ZoomableImageTrigger } from "@/components/concepts/image-lightbox";
import { cn } from "@/lib/utils";
import { displayCatalogImageSrc } from "@/lib/product-image";
import type { ConceptItem } from "@/lib/types";

interface CatalogPhotosGridProps {
  items: ConceptItem[];
  label?: string;
  layout?: "grid" | "showcase";
  onImageClick?: (index: number, items: ConceptItem[]) => void;
  /** В showcase: подпись над миниатюрами (по умолчанию скрыта) */
  showThumbnailLabel?: boolean;
}

export function CatalogPhotosGrid({
  items,
  label = "Фото товаров из каталога",
  layout = "grid",
  onImageClick,
  showThumbnailLabel = false,
}: CatalogPhotosGridProps) {
  const withPhoto = items.filter((it) => it.imageUrl);
  const photoSrc = (url: string) => displayCatalogImageSrc(url);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [items.map((it) => it.id ?? it.name).join("|")]);

  if (withPhoto.length === 0) {
    return (
      <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
        <Package className="h-12 w-12 opacity-30" />
        <p className="text-sm">Добавьте товары в набор — здесь появятся фото из каталога</p>
      </div>
    );
  }

  const activeItem = withPhoto[Math.min(activeIndex, withPhoto.length - 1)];

  if (layout === "showcase") {
    return (
      <div className="flex h-full flex-col">
        <div className="relative min-h-0 flex-1 bg-background/50">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeItem.id ?? activeItem.name}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0"
            >
              {onImageClick ? (
                <ZoomableImageTrigger
                  src={photoSrc(activeItem.imageUrl!)}
                  alt={activeItem.name}
                  onOpen={() =>
                    onImageClick(
                      withPhoto.findIndex((it) => (it.id ?? it.name) === (activeItem.id ?? activeItem.name)),
                      withPhoto,
                    )
                  }
                  className="absolute inset-0 h-full w-full cursor-zoom-in"
                >
                  <div className="relative h-full w-full">
                    <Image
                      src={photoSrc(activeItem.imageUrl!)}
                      alt={activeItem.name}
                      fill
                      className="object-contain p-2"
                      sizes="(max-width: 1024px) 100vw, 512px"
                      unoptimized
                    />
                  </div>
                </ZoomableImageTrigger>
              ) : (
                <Image
                  src={photoSrc(activeItem.imageUrl!)}
                  alt={activeItem.name}
                  fill
                  className="object-contain p-2"
                  sizes="(max-width: 1024px) 100vw, 512px"
                  unoptimized
                />
              )}
            </motion.div>
          </AnimatePresence>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 via-background/50 to-transparent px-3 pb-2 pt-8">
            <p className="line-clamp-1 text-xs font-semibold text-foreground">{activeItem.name}</p>
            {activeItem.description && (
              <p className="mt-0.5 line-clamp-1 text-[10px] text-muted-foreground">{activeItem.description}</p>
            )}
          </div>
        </div>

        {withPhoto.length > 1 && (
          <div className="flex shrink-0 items-center gap-1.5 border-t border-border/40 bg-secondary/10 p-2">
            {showThumbnailLabel && (
              <p className="mr-1 shrink-0 text-[10px] text-muted-foreground">{label}</p>
            )}
            <div className="flex min-w-0 flex-1 items-center gap-1.5">
              {withPhoto.map((item, i) => (
                <button
                  key={item.id ?? item.name}
                  type="button"
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => setActiveIndex(i)}
                  className={cn(
                    "relative min-w-0 flex-1 overflow-hidden rounded-lg border bg-background transition-colors aspect-square max-h-12",
                    activeIndex === i
                      ? "border-primary ring-2 ring-primary/40"
                      : "border-border/60 hover:border-primary/50",
                  )}
                >
                  <Image
                    src={photoSrc(item.imageUrl!)}
                    alt={item.name}
                    fill
                    className="object-contain p-0.5"
                    sizes="64px"
                    unoptimized
                  />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const cols =
    withPhoto.length === 1 ? "grid-cols-1" : withPhoto.length <= 4 ? "grid-cols-2" : "grid-cols-3";

  return (
    <div className="flex h-full flex-col p-3">
      <p className="mb-2 text-xs font-medium text-muted-foreground">{label}</p>
      <div className={`grid flex-1 gap-2 ${cols}`}>
        <AnimatePresence mode="popLayout">
          {withPhoto.map((item, index) => {
            const cell = (
              <>
                <Image
                  src={photoSrc(item.imageUrl!)}
                  alt={item.name}
                  fill
                  className="object-contain p-3"
                  sizes="(max-width: 512px) 50vw, 256px"
                  unoptimized
                />
                <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent px-2 pb-2 pt-6">
                  <p className="line-clamp-2 text-[10px] font-medium leading-tight">{item.name}</p>
                </div>
              </>
            );

            return (
              <motion.div
                key={item.id ?? item.name}
                layout
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.88 }}
                transition={{ duration: 0.25 }}
                className="relative min-h-[120px] overflow-hidden rounded-lg border border-border/40 bg-background/80"
              >
                {onImageClick ? (
                  <ZoomableImageTrigger
                  src={photoSrc(item.imageUrl!)}
                    alt={item.name}
                    onOpen={() => onImageClick(index, withPhoto)}
                    className="absolute inset-0 h-full w-full cursor-zoom-in"
                  >
                    <div className="relative h-full w-full">{cell}</div>
                  </ZoomableImageTrigger>
                ) : (
                  cell
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
