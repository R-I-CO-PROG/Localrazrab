"use client";

import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BRAND_STYLE_LABELS, type BrandPaletteSettings } from "@/lib/brand-palette";
import { cn } from "@/lib/utils";

interface BrandPalettePanelProps {
  palette: BrandPaletteSettings;
  onColorChange: (index: number, color: string) => void;
  onRemoveColor: (color: string) => void;
  onReset: () => void;
  onApplyFromBrand?: () => void;
  className?: string;
}

export function BrandPalettePanel({
  palette,
  onColorChange,
  onRemoveColor,
  onReset,
  onApplyFromBrand,
  className,
}: BrandPalettePanelProps) {
  const hasDetected = palette.detectedColors.length > 0;
  const activeColors = palette.activeColors.length > 0 ? palette.activeColors : [];

  return (
    <div className={cn("space-y-3 rounded-xl border border-border bg-secondary/20 p-4", className)}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Цвета бренда</p>
          <p className="text-xs text-muted-foreground">
            {activeColors.length === 0
              ? "Цвета не выбраны — добавьте вручную или из логотипа/брендбука"
              : `Стиль: ${BRAND_STYLE_LABELS[palette.activeStyle]}${
                  palette.manualOverride && hasDetected ? " · есть ручные правки" : ""
                }`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onApplyFromBrand && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5"
              disabled={!hasDetected}
              onClick={onApplyFromBrand}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Из логотипа/брендбука
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onReset}
            disabled={activeColors.length === 0}
          >
            Убрать все цвета
          </Button>
        </div>
      </div>

      {activeColors.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {activeColors.map((color, index) => (
            <div
              key={`${color}-${index}`}
              className="group relative flex items-center gap-2 rounded-lg border border-border bg-card px-2 py-1.5 pr-7"
            >
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => onColorChange(index, e.target.value.toUpperCase())}
                  className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent p-0"
                  aria-label={`Цвет ${index + 1}`}
                />
                <span className="font-mono text-[10px] text-muted-foreground">{color}</span>
              </label>
              <button
                type="button"
                onClick={() => onRemoveColor(color)}
                className="absolute right-1 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-destructive/10 text-destructive opacity-0 transition-opacity group-hover:opacity-100 hover:bg-destructive/20"
                aria-label={`Удалить цвет ${color}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Палитра пуста — генерация пойдёт без ограничения по цветам.</p>
      )}

      {hasDetected && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Распознано из файла (применяется по кнопке выше)</p>
          <div className="flex flex-wrap gap-1.5">
            {palette.detectedColors.map((color) => (
              <Badge key={color} variant="secondary" className="gap-1.5 text-[10px]">
                <span
                  className="inline-block h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: color }}
                />
                {color}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
