"use client";

import { cn } from "@/lib/utils";
import type { ConceptPreviewProps } from "./conceptPreview.types";
import {
  DEFAULT_PREVIEW_ITEMS,
  inferHeroItem,
  inferLayout,
  normalizePalette,
  pickDisplayItems,
} from "./conceptPreview.utils";
import { ConceptItemIcon } from "./itemIcons";
import { getItemPlacements, layoutBackdropClass, layoutOverlay } from "./layouts";

export function ConceptPreview({
  title,
  tags = [],
  palette,
  items,
  heroItem,
  layout: layoutProp,
  selected = false,
  size = "md",
  className,
  showLabel = true,
  showPalette = true,
}: ConceptPreviewProps) {
  const resolvedPalette = normalizePalette(palette);
  const accent = resolvedPalette[0] ?? "#8b5cf6";
  const accent2 = resolvedPalette[1] ?? accent;

  const rawItems = items?.length ? items : DEFAULT_PREVIEW_ITEMS;
  const hero = heroItem ?? inferHeroItem(rawItems, title);
  const displayItems = pickDisplayItems(rawItems, hero);
  const layout = layoutProp ?? inferLayout(tags, title ?? "");

  const placements = getItemPlacements(layout, displayItems.length);
  const iconBase = size === "sm" ? 28 : 36;
  const heroScale = size === "sm" ? 1.18 : 1.22;

  return (
    <div
      className={cn(
        "relative flex h-full w-full flex-col overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br",
        layoutBackdropClass(layout),
        selected && "border-primary/50 ring-1 ring-primary/30 shadow-[0_0_24px_-6px_hsl(var(--primary)/0.45)]",
        "group/preview transition-[border-color,box-shadow] duration-300",
        className,
      )}
      title={title}
    >
      {showLabel && (
        <div className="pointer-events-none absolute left-2 top-2 z-20 flex items-center gap-1.5">
          <span className="rounded-md border border-border/50 bg-background/70 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
            Схема
          </span>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 100 100"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden
        >
          {layoutOverlay(layout, accent)}
        </svg>

        {displayItems.map((item, index) => {
          const place = placements[index] ?? placements[0];
          const isHero = item === hero;
          const px = iconBase * place.scale * (isHero ? heroScale : 1);

          return (
            <div
              key={`${item}-${index}`}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 transition-transform duration-300",
                "group-hover/preview:scale-[1.03]",
                isHero && "z-10",
              )}
              style={{
                left: `${place.x}%`,
                top: `${place.y}%`,
                transform: `translate(-50%, -50%) rotate(${place.rotation ?? 0}deg)`,
              }}
            >
              <div
                className={cn(
                  "rounded-xl border bg-background/40 p-1 backdrop-blur-[2px] transition-shadow duration-300",
                  isHero
                    ? "border-primary/40 shadow-[0_0_18px_-4px_var(--hero-glow)]"
                    : "border-border/40 group-hover/preview:border-border/60",
                )}
                style={
                  {
                    "--hero-glow": accent,
                  } as React.CSSProperties
                }
              >
                <ConceptItemIcon
                  type={item}
                  size={px}
                  stroke={isHero ? accent2 : "hsl(var(--foreground) / 0.72)"}
                  fill={isHero ? `${accent}18` : "rgba(255,255,255,0.03)"}
                  hero={isHero}
                />
              </div>
            </div>
          );
        })}
      </div>

      {showPalette && resolvedPalette.length > 0 && size !== "sm" && (
        <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-t border-border/30 px-2.5 py-1.5">
          {resolvedPalette.slice(0, 5).map((color) => (
            <span
              key={color}
              className="h-2 w-2 rounded-full border border-white/10 shadow-sm"
              style={{ backgroundColor: color }}
              title={color}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export type { ConceptPreviewProps, ConceptPreviewItem, ConceptPreviewLayout } from "./conceptPreview.types";
export { conceptPreviewFromGenerated } from "./conceptPreview.utils";
