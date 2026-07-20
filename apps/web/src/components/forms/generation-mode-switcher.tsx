"use client";

import type { ElementType } from "react";
import { motion } from "framer-motion";
import { LayoutGrid, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GenerationMode } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";

interface GenerationModeSwitcherProps {
  mode: GenerationMode;
  onChange: (mode: GenerationMode) => void;
}

const MODES: {
  id: GenerationMode;
  label: string;
  shortLabel: string;
  icon: ElementType;
  hint: string;
}[] = [
  {
    id: "catalog",
    label: "Генерация по каталогу",
    shortLabel: "Каталог",
    icon: LayoutGrid,
    hint: "Проверенные позиции из каталога",
  },
  {
    id: "creative",
    label: "Maximum Creative",
    shortLabel: "Creative",
    icon: Sparkles,
    hint: "Смелые нестандартные идеи",
  },
];

export function GenerationModeSwitcher({
  mode,
  onChange,
}: GenerationModeSwitcherProps) {
  const activeIndex = mode === "catalog" ? 0 : 1;

  return (
    <Card className="border-2 border-border/60 bg-card/80">
      <CardContent className="p-5 sm:p-6">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Режим генерации
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Два разных подхода — выберите один перед заполнением формы
          </p>
        </div>

        <div className="relative grid w-full grid-cols-2 rounded-xl border border-border bg-secondary/40 p-1.5">
          <motion.div
            className="absolute top-1.5 bottom-1.5 rounded-lg bg-primary shadow-glow-sm"
            initial={false}
            animate={{
              left: activeIndex === 0 ? "6px" : "calc(50% + 2px)",
              width: "calc(50% - 8px)",
            }}
            transition={{ type: "spring", stiffness: 400, damping: 32 }}
          />

          {MODES.map(({ id, label, shortLabel, icon: Icon, hint }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChange(id)}
                className={cn(
                  "relative z-10 flex w-full flex-col items-center gap-1.5 rounded-lg px-3 py-4 text-center transition-colors sm:flex-row sm:justify-center sm:gap-3 sm:py-3.5",
                  active
                    ? "text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground/80"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <div className="min-w-0">
                  <span
                    className={cn(
                      "block text-sm leading-tight sm:hidden",
                      active ? "font-semibold" : "font-medium"
                    )}
                  >
                    {shortLabel}
                  </span>
                  <span
                    className={cn(
                      "hidden text-sm sm:block",
                      active ? "font-semibold" : "font-medium"
                    )}
                  >
                    {label}
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 hidden text-[11px] leading-snug sm:block",
                      active ? "text-primary-foreground/80" : "text-muted-foreground/70"
                    )}
                  >
                    {hint}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export const GENERATION_MODE_DESCRIPTIONS: Record<GenerationMode, string> = {
  catalog:
    "Подбор из каталога сувенирной продукции: проверенные позиции, точный бюджет и предсказуемый состав наборов.",
  creative:
    "Maximum Creative не ограничен каталогами — AI предлагает нестандартные, креативные и смелые идеи без привязки к типовым позициям.",
};
