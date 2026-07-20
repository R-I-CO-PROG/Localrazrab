"use client";

import { cn } from "@/lib/utils";

interface ProductCountRangeProps {
  min: number;
  max: number;
  absoluteMin?: number;
  absoluteMax?: number;
  onChange: (min: number, max: number) => void;
  className?: string;
}

export function ProductCountRange({
  min,
  max,
  absoluteMin = 1,
  absoluteMax = 10,
  onChange,
  className,
}: ProductCountRangeProps) {
  const safeMin = Math.max(absoluteMin, Math.min(min, absoluteMax));
  const safeMax = Math.max(safeMin, Math.min(max, absoluteMax));

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">От</span>
        <span className="font-semibold tabular-nums">
          {safeMin}–{safeMax} товаров
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Минимум</label>
          <input
            type="range"
            min={absoluteMin}
            max={absoluteMax}
            value={safeMin}
            onChange={(e) => {
              const nextMin = Number(e.target.value);
              onChange(nextMin, Math.max(nextMin, safeMax));
            }}
            className="w-full accent-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Максимум</label>
          <input
            type="range"
            min={absoluteMin}
            max={absoluteMax}
            value={safeMax}
            onChange={(e) => {
              const nextMax = Number(e.target.value);
              onChange(Math.min(safeMin, nextMax), nextMax);
            }}
            className="w-full accent-primary"
          />
        </div>
      </div>
    </div>
  );
}
