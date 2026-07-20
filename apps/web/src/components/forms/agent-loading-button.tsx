"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { Loader2, Sparkles } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = ButtonProps & {
  loading?: boolean;
  progress?: number;
  statusLabel?: string;
  statusComment?: string;
  idleIcon?: ReactNode;
  idleLabel: string;
};

export function AgentLoadingButton({
  loading,
  progress = 0,
  statusLabel,
  statusComment,
  idleIcon,
  idleLabel,
  className,
  disabled,
  ...props
}: Props) {
  const pct = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <Button
      size="lg"
      className={cn(
        "relative w-full overflow-hidden transition-all",
        loading ? "h-auto min-h-14 flex-col gap-2.5 py-4" : "h-14 gap-2",
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <div className="flex w-full items-center justify-center gap-2 text-base font-medium">
            <Loader2 className="h-5 w-5 shrink-0 animate-spin" />
            <span className="min-w-0 break-words text-center leading-snug sm:text-left">
              {statusLabel ?? "Работаем…"}
            </span>
          </div>

          {statusComment ? (
            <p className="w-full break-words px-1 text-center text-xs font-normal leading-relaxed text-primary-foreground/80">
              {statusComment}
            </p>
          ) : null}

          <div className="w-full space-y-1.5 px-1">
            <div className="h-1.5 overflow-hidden rounded-full bg-primary-foreground/20">
              <motion.div
                className="h-full rounded-full bg-primary-foreground/90"
                initial={{ width: "0%" }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              />
            </div>
            <p className="text-center text-[11px] tabular-nums text-primary-foreground/70">{pct}%</p>
          </div>
        </>
      ) : (
        <>
          {idleIcon ?? <Sparkles className="h-5 w-5" />}
          {idleLabel}
        </>
      )}
    </Button>
  );
}
