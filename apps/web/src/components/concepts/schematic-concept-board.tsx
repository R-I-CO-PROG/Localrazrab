"use client";

import {
  BookOpen,
  Coffee,
  Gift,
  Package,
  Pen,
  Shirt,
  ShoppingBag,
  Trophy,
  Umbrella,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { GeneratedConcept } from "@/lib/types";
import { buildSchematicElements, productTypeLabel } from "@/lib/creative-schematic.util";

interface SchematicConceptBoardProps {
  concept: GeneratedConcept;
  colors?: string[];
  className?: string;
  compact?: boolean;
}

const ICON_BY_TYPE: Record<string, LucideIcon> = {
  pen: Pen,
  notebook: BookOpen,
  mug: Coffee,
  cup: Coffee,
  tshirt: Shirt,
  shirt: Shirt,
  bag: ShoppingBag,
  backpack: ShoppingBag,
  thermos: Coffee,
  bottle: Coffee,
  hoodie: Shirt,
  cap: Shirt,
  hat: Shirt,
  umbrella: Umbrella,
  ball: Trophy,
  apron: UtensilsCrossed,
  pot: UtensilsCrossed,
  dish: UtensilsCrossed,
  plate: UtensilsCrossed,
  spoon: UtensilsCrossed,
  other: Gift,
};

function layoutClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count === 2) return "grid-cols-2";
  if (count === 3) return "grid-cols-3";
  if (count <= 6) return "grid-cols-3";
  return "grid-cols-4";
}

function resolveIcon(type: string): LucideIcon {
  const key = type.trim().toLowerCase();
  return ICON_BY_TYPE[key] ?? Package;
}

export function SchematicConceptBoard({
  concept,
  colors = [],
  className,
  compact = false,
}: SchematicConceptBoardProps) {
  const elements = buildSchematicElements(concept, colors);
  const palette = colors.filter(Boolean);

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-to-br from-background via-background to-secondary/30 p-4 shadow-sm sm:p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
            Схема концепции
          </p>
          {!compact && (
            <h3 className="mt-1 text-lg font-semibold leading-tight">{concept.name}</h3>
          )}
        </div>
        <span className="shrink-0 rounded-full border border-dashed border-primary/40 bg-primary/5 px-2 py-0.5 text-[10px] text-primary">
          Эскиз
        </span>
      </div>

      {!compact && concept.description && (
        <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">{concept.description}</p>
      )}

      <div className={cn("grid gap-2.5", layoutClass(elements.length))}>
        {elements.map((el) => {
          const Icon = resolveIcon(el.productType);
          return (
            <div
              key={el.id}
              className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border border-border/50 bg-background/90 p-3 text-center shadow-sm"
            >
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 shadow-inner"
                style={{
                  backgroundColor: `${el.accentColor}22`,
                  color: el.accentColor,
                  boxShadow: `inset 0 0 0 1px ${el.accentColor}44`,
                }}
              >
                <Icon className="h-6 w-6" strokeWidth={1.75} />
              </div>
              <p className="line-clamp-2 text-xs font-medium leading-snug">{el.label}</p>
              <p className="text-[10px] text-muted-foreground">{productTypeLabel(el.productType)}</p>
            </div>
          );
        })}
      </div>

      {palette.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/40 pt-3">
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Палитра брифа
          </span>
          <div className="flex flex-wrap gap-1.5">
            {palette.slice(0, 6).map((c) => (
              <span
                key={c}
                className="h-5 w-5 rounded-full border border-border/60 shadow-sm"
                style={{ backgroundColor: c }}
                title={c}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
