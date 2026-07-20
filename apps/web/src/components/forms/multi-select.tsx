"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MultiSelectProps {
  options: readonly string[];
  selected: string[];
  onToggle: (item: string) => void;
  onAddCustom?: (item: string) => void;
  variant?: "default" | "danger";
  customPlaceholder?: string;
}

export function MultiSelect({
  options,
  selected,
  onToggle,
  onAddCustom,
  variant = "default",
  customPlaceholder = "Свой вариант...",
}: MultiSelectProps) {
  const [customValue, setCustomValue] = useState("");

  const presetSet = new Set<string>(options);
  const customSelected = selected.filter((item) => !presetSet.has(item));

  const handleAddCustom = () => {
    const trimmed = customValue.trim();
    if (!trimmed || !onAddCustom) return;
    onAddCustom(trimmed);
    setCustomValue("");
  };

  const allOptions = [
    ...options,
    ...customSelected.filter((c) => !options.includes(c as (typeof options)[number])),
  ];

  return (
    <div className="min-w-0 w-full space-y-3 overflow-hidden">
      <div className="flex min-w-0 w-full flex-wrap gap-2">
        {allOptions.map((option) => {
          const isSelected = selected.includes(option);
          const isCustom = !presetSet.has(option);
          const isLong = option.length > 24;
          return (
            <motion.button
              key={option}
              type="button"
              whileTap={{ scale: 0.95 }}
              onClick={() => onToggle(option)}
              title={option}
              className={cn(
                "flex min-w-0 items-start gap-1.5 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-all duration-200",
                isLong ? "w-full max-w-full" : "max-w-full",
                isSelected
                  ? variant === "danger"
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-secondary/30 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                isCustom && !isSelected && "border-dashed"
              )}
            >
              {isSelected && <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span className="min-w-0 flex-1 break-all [overflow-wrap:anywhere] leading-snug">
                {option}
              </span>
            </motion.button>
          );
        })}
      </div>

      {onAddCustom && (
        <div className="grid w-full min-w-0 max-w-full grid-cols-[minmax(0,1fr)_2.5rem] items-center gap-2 overflow-hidden">
          <Input
            placeholder={customPlaceholder}
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && (e.preventDefault(), handleAddCustom())
            }
            className="min-w-0 w-full max-w-full focus-visible:ring-offset-0"
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 focus-visible:ring-offset-0"
            onClick={handleAddCustom}
            disabled={!customValue.trim()}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
