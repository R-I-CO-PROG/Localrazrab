"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ZoomableImageTrigger } from "@/components/concepts/image-lightbox";
import type { ConceptVisualizationVariant } from "@/lib/types";

interface ConceptVisualizationCarouselProps {
  variants: ConceptVisualizationVariant[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  alt: string;
  onOpenLightbox?: (index: number) => void;
  className?: string;
}

export function ConceptVisualizationCarousel({
  variants,
  activeIndex,
  onIndexChange,
  alt,
  onOpenLightbox,
  className,
}: ConceptVisualizationCarouselProps) {
  const current = variants[activeIndex];
  const hasMultiple = variants.length > 1;

  const goPrev = () => onIndexChange((activeIndex - 1 + variants.length) % variants.length);
  const goNext = () => onIndexChange((activeIndex + 1) % variants.length);

  if (!current) return null;

  return (
    <div className={cn("relative h-full w-full", className)}>
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.01 }}
          transition={{ duration: 0.25 }}
          className="absolute inset-0"
        >
          <ZoomableImageTrigger
            src={current.imageUrl}
            alt={alt}
            onOpen={() => onOpenLightbox?.(activeIndex)}
            className="absolute inset-0 h-full w-full cursor-zoom-in"
          >
            <div className="relative h-full w-full">
              <Image
                key={current.imageUrl}
                src={current.imageUrl}
                alt={alt}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 50vw"
                unoptimized
              />
            </div>
          </ZoomableImageTrigger>
        </motion.div>
      </AnimatePresence>

      {hasMultiple && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute left-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full border border-border/60 bg-background/90 shadow-md"
            onClick={goPrev}
            aria-label="Предыдущая версия"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full border border-border/60 bg-background/90 shadow-md"
            onClick={goNext}
            aria-label="Следующая версия"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/50 bg-background/90 px-3 py-1.5 text-xs shadow-md backdrop-blur-sm">
            <span className="font-medium">
              {activeIndex + 1} / {variants.length}
            </span>
            {current.refinementBrief && (
              <span className="max-w-[140px] truncate text-muted-foreground">
                · {current.refinementBrief}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
