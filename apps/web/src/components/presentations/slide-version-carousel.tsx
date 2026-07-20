"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SlideVariant } from "@/lib/presentation-ai/types";
import { slideVariantPreviewUrl } from "@/lib/presentation-ai/map-slide-variant-url";

interface SlideVersionCarouselProps {
  variants: SlideVariant[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  className?: string;
  disabled?: boolean;
}

export function SlideVersionCarousel({
  variants,
  activeIndex,
  onIndexChange,
  className,
  disabled = false,
}: SlideVersionCarouselProps) {
  const current = variants[activeIndex];
  const hasMultiple = variants.length > 1;
  const previewUrl = current ? slideVariantPreviewUrl(current) : undefined;

  if (!current) return null;

  const goPrev = () => {
    if (disabled) return;
    onIndexChange((activeIndex - 1 + variants.length) % variants.length);
  };

  const goNext = () => {
    if (disabled) return;
    onIndexChange((activeIndex + 1) % variants.length);
  };

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
          {previewUrl ? (
            <img
              key={previewUrl}
              src={previewUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-contain object-center"
            />
          ) : (
            <div className="absolute inset-0 bg-white" />
          )}
        </motion.div>
      </AnimatePresence>

      {hasMultiple && (
        <>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute left-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 text-white shadow-md hover:bg-black/70"
            onClick={goPrev}
            disabled={disabled}
            aria-label="Предыдущая версия"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute right-3 top-1/2 z-10 h-9 w-9 -translate-y-1/2 rounded-full border border-white/20 bg-black/50 text-white shadow-md hover:bg-black/70"
            onClick={goNext}
            disabled={disabled}
            aria-label="Следующая версия"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-xs text-white shadow-md backdrop-blur-sm">
            <span className="font-medium">
              {activeIndex + 1} / {variants.length}
            </span>
            {current.refinementPrompt && (
              <span className="max-w-[180px] truncate text-white/70">
                · {current.refinementPrompt}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
