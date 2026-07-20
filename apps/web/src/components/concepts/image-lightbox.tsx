"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type LightboxImage = { src: string; alt: string };

interface ImageLightboxProps {
  images: LightboxImage[];
  index: number;
  open: boolean;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
}

export function ImageLightbox({
  images,
  index,
  open,
  onClose,
  onIndexChange,
}: ImageLightboxProps) {
  const [mounted, setMounted] = useState(false);
  const current = images[index];
  const hasMultiple = images.length > 1;

  useEffect(() => setMounted(true), []);

  const goPrev = useCallback(() => {
    if (!hasMultiple || !onIndexChange) return;
    onIndexChange((index - 1 + images.length) % images.length);
  }, [hasMultiple, onIndexChange, index, images.length]);

  const goNext = useCallback(() => {
    if (!hasMultiple || !onIndexChange) return;
    onIndexChange((index + 1) % images.length);
  }, [hasMultiple, onIndexChange, index, images.length]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, goPrev, goNext]);

  return (
    <>
      {mounted &&
        createPortal(
          <AnimatePresence>
            {open && current && (
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label={current.alt}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 z-[200] flex items-center justify-center p-4 sm:p-8"
                onClick={onClose}
              >
                <motion.div
                  aria-hidden
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 bg-black/25 backdrop-blur-sm"
                />

                <motion.div
                  initial={{ opacity: 0, scale: 0.96, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, y: 4 }}
                  transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  className="relative z-10 flex max-h-[92vh] w-full max-w-5xl flex-col items-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="mb-3 flex w-full items-center justify-between gap-3 px-1">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{current.alt}</p>
                      {hasMultiple && (
                        <p className="text-xs text-muted-foreground">
                          {index + 1} из {images.length}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="h-10 w-10 shrink-0 rounded-full border border-border/60 bg-background/90 shadow-md hover:bg-background"
                      onClick={onClose}
                      aria-label="Закрыть"
                    >
                      <X className="h-5 w-5" />
                    </Button>
                  </div>

                  <div className="relative flex w-full flex-1 items-center justify-center">
                    {hasMultiple && onIndexChange && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute left-0 z-20 hidden h-11 w-11 rounded-full border border-border/60 bg-background/90 shadow-md sm:flex"
                        onClick={goPrev}
                        aria-label="Предыдущее фото"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                    )}

                    <div className="relative max-h-[78vh] w-full overflow-hidden rounded-2xl border border-border/40 bg-background shadow-2xl">
                      <div className="relative flex min-h-[200px] w-full items-center justify-center p-2 sm:p-4">
                        <Image
                          src={current.src}
                          alt={current.alt}
                          width={1600}
                          height={1600}
                          className="max-h-[72vh] w-auto max-w-full object-contain"
                          unoptimized
                          priority
                        />
                      </div>
                    </div>

                    {hasMultiple && onIndexChange && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon"
                        className="absolute right-0 z-20 hidden h-11 w-11 rounded-full border border-border/60 bg-background/90 shadow-md sm:flex"
                        onClick={goNext}
                        aria-label="Следующее фото"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    )}
                  </div>

                  {hasMultiple && onIndexChange && (
                    <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
                      {images.map((img, i) => (
                        <button
                          key={`${img.src}-${i}`}
                          type="button"
                          onClick={() => onIndexChange(i)}
                          className={cn(
                            "relative h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 transition-all",
                            i === index
                              ? "border-primary ring-2 ring-primary/30"
                              : "border-border/50 opacity-70 hover:opacity-100",
                          )}
                          aria-label={img.alt}
                        >
                          <Image src={img.src} alt="" fill className="object-cover" unoptimized />
                        </button>
                      ))}
                    </div>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

interface ZoomableImageTriggerProps {
  src: string;
  alt: string;
  onOpen: () => void;
  className?: string;
  children: React.ReactNode;
}

export function ZoomableImageTrigger({
  onOpen,
  className,
  children,
  alt,
}: ZoomableImageTriggerProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group relative block w-full cursor-zoom-in overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        className,
      )}
      aria-label={`Открыть фото: ${alt}`}
    >
      {children}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/20 group-hover:opacity-100">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg backdrop-blur-sm">
          <ZoomIn className="h-5 w-5" />
        </span>
      </div>
    </button>
  );
}
