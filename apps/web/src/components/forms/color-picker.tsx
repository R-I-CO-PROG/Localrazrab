"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface ColorPickerProps {
  colors: string[];
  onAdd: (color: string) => void;
  onRemove: (color: string) => void;
}

/** 20 базовых цветов палитры. Храним hex для совместимости с бэкендом. */
export const BASE_PALETTE: Array<{ id: string; label: string; hex: string }> = [
  { id: "white", label: "Белый", hex: "#FFFFFF" },
  { id: "black", label: "Чёрный", hex: "#1A1A1A" },
  { id: "gray", label: "Серый", hex: "#9CA3AF" },
  { id: "red", label: "Красный", hex: "#EF4444" },
  { id: "maroon", label: "Бордовый", hex: "#9F1239" },
  { id: "pink", label: "Розовый", hex: "#EC4899" },
  { id: "orange", label: "Оранжевый", hex: "#F97316" },
  { id: "yellow", label: "Жёлтый", hex: "#EAB308" },
  { id: "lime", label: "Лаймовый", hex: "#84CC16" },
  { id: "green", label: "Зелёный", hex: "#22C55E" },
  { id: "emerald", label: "Изумрудный", hex: "#059669" },
  { id: "teal", label: "Бирюзовый", hex: "#14B8A6" },
  { id: "sky", label: "Голубой", hex: "#06B6D4" },
  { id: "blue", label: "Синий", hex: "#3B82F6" },
  { id: "navy", label: "Тёмно-синий", hex: "#1E3A8A" },
  { id: "purple", label: "Фиолетовый", hex: "#7C3AED" },
  { id: "lilac", label: "Сиреневый", hex: "#C4B5FD" },
  { id: "brown", label: "Коричневый", hex: "#92400E" },
  { id: "beige", label: "Бежевый", hex: "#E7D5B8" },
  { id: "gold", label: "Золотой", hex: "#D4AF37" },
];

export function ColorPicker({ colors, onAdd, onRemove }: ColorPickerProps) {
  const selected = new Set(colors.map((c) => c.toUpperCase()));

  const toggle = (hex: string) => {
    if (selected.has(hex.toUpperCase())) onRemove(hex);
    else onAdd(hex);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {BASE_PALETTE.map((color) => {
        const isSelected = selected.has(color.hex.toUpperCase());
        const isLight = ["#FFFFFF", "#E7D5B8", "#EAB308", "#84CC16", "#C4B5FD"].includes(
          color.hex
        );
        return (
          <button
            key={color.id}
            type="button"
            onClick={() => toggle(color.hex)}
            title={color.label}
            aria-label={color.label}
            aria-pressed={isSelected}
            className={cn(
              "relative flex h-6 w-6 items-center justify-center rounded-full border shadow-sm transition-all hover:scale-110",
              isSelected
                ? "border-primary ring-2 ring-primary ring-offset-1 ring-offset-background"
                : "border-border/60"
            )}
            style={{ backgroundColor: color.hex }}
          >
            {isSelected && (
              <Check
                className={cn("h-3.5 w-3.5", isLight ? "text-black" : "text-white")}
                strokeWidth={3}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
