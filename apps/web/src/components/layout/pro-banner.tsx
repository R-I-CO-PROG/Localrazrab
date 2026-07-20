"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ProBannerProps {
  collapsed?: boolean;
}

export function ProBanner({ collapsed }: ProBannerProps) {
  if (collapsed) {
    return (
      <Link
        href="/settings"
        className="flex items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 p-3 transition-colors hover:from-primary/30"
        title="Переходите на Pro-план"
      >
        <Sparkles className="h-5 w-5 text-primary" />
      </Link>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-primary/20",
        "bg-gradient-to-br from-primary/15 via-primary/8 to-transparent p-4"
      )}
    >
      <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-primary/10 blur-2xl" />
      <div className="relative space-y-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wide text-primary">
            Pro
          </span>
        </div>
        <p className="text-sm font-semibold leading-snug">
          Переходите на Pro-план
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Безлимитные визуализации, экспорт в PPTX и приоритетная поддержка
        </p>
        <Button asChild size="sm" className="w-full">
          <Link href="/settings">
            Узнать больше
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </motion.div>
  );
}
