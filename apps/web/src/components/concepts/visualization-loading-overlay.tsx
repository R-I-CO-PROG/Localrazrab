"use client";

import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  progress: number;
  statusLabel: string;
  className?: string;
};

export function VisualizationLoadingOverlay({ progress, statusLabel, className }: Props) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={cn(
        "absolute inset-0 z-10 flex flex-col items-center justify-center gap-6 rounded-xl",
        "bg-background/90 backdrop-blur-md",
        className,
      )}
    >
      <div className="relative flex h-16 w-16 items-center justify-center">
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-primary/20"
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        />
        <Sparkles className="h-7 w-7 text-primary" />
      </div>

      <div className="w-full max-w-xs space-y-3 px-4 text-center sm:px-6">
        <p className="break-words text-sm font-medium text-foreground">{statusLabel}</p>
        <p className="text-xs text-muted-foreground">Готовим визуализацию, которую можно показывать…</p>

        <div className="h-2 overflow-hidden rounded-full bg-secondary">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary/80 to-primary"
            initial={{ width: "0%" }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        <div className="flex items-center justify-center gap-2 text-xs tabular-nums text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          {pct}%
        </div>
      </div>
    </motion.div>
  );
}
