import type { ReactNode } from "react";
import type { ConceptPreviewLayout, ItemPlacement } from "./conceptPreview.types";

const LAYOUTS: Record<ConceptPreviewLayout, ItemPlacement[]> = {
  premium_grid: [
    { x: 50, y: 38, scale: 1.15, rotation: 0 },
    { x: 28, y: 58, scale: 0.92, rotation: -4 },
    { x: 72, y: 58, scale: 0.92, rotation: 4 },
    { x: 34, y: 78, scale: 0.85, rotation: 2 },
    { x: 66, y: 78, scale: 0.85, rotation: -2 },
  ],
  minimal_flatlay: [
    { x: 22, y: 42, scale: 0.88, rotation: -8 },
    { x: 50, y: 36, scale: 1.05, rotation: 0 },
    { x: 78, y: 44, scale: 0.88, rotation: 8 },
    { x: 36, y: 72, scale: 0.82, rotation: -3 },
    { x: 68, y: 74, scale: 0.82, rotation: 3 },
  ],
  mysterious_scan: [
    { x: 50, y: 40, scale: 1.2, rotation: 0 },
    { x: 26, y: 62, scale: 0.86, rotation: -6 },
    { x: 74, y: 62, scale: 0.86, rotation: 6 },
    { x: 38, y: 82, scale: 0.78, rotation: 0 },
    { x: 62, y: 82, scale: 0.78, rotation: 0 },
  ],
  tech_blueprint: [
    { x: 50, y: 34, scale: 1.1, rotation: 0 },
    { x: 24, y: 52, scale: 0.9, rotation: 0 },
    { x: 76, y: 52, scale: 0.9, rotation: 0 },
    { x: 32, y: 76, scale: 0.84, rotation: 0 },
    { x: 68, y: 76, scale: 0.84, rotation: 0 },
  ],
  eco_craft: [
    { x: 48, y: 38, scale: 1.05, rotation: -5 },
    { x: 24, y: 56, scale: 0.9, rotation: 8 },
    { x: 74, y: 54, scale: 0.88, rotation: -7 },
    { x: 40, y: 78, scale: 0.84, rotation: 4 },
    { x: 64, y: 80, scale: 0.82, rotation: -3 },
  ],
};

export function getItemPlacements(layout: ConceptPreviewLayout, count: number): ItemPlacement[] {
  const base = LAYOUTS[layout] ?? LAYOUTS.premium_grid;
  return base.slice(0, Math.max(1, Math.min(5, count)));
}

export function layoutBackdropClass(layout: ConceptPreviewLayout): string {
  switch (layout) {
    case "mysterious_scan":
      return "from-zinc-950 via-zinc-900/95 to-violet-950/40";
    case "tech_blueprint":
      return "from-slate-950 via-slate-900 to-cyan-950/30";
    case "eco_craft":
      return "from-emerald-950/40 via-background to-stone-900/50";
    case "minimal_flatlay":
      return "from-background via-background to-secondary/20";
    default:
      return "from-background via-background to-primary/5";
  }
}

export function layoutOverlay(layout: ConceptPreviewLayout, accent: string): ReactNode {
  if (layout === "tech_blueprint") {
    return (
      <>
        <defs>
          <pattern id="cp-grid" width="12" height="12" patternUnits="userSpaceOnUse">
            <path
              d="M12 0H0V12"
              fill="none"
              stroke="currentColor"
              strokeWidth="0.35"
              className="text-primary/15"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cp-grid)" />
        <text x="8" y="14" className="fill-primary/25 text-[7px] font-mono">
          SCHEMATIC
        </text>
        <text x="8" y="96%" className="fill-primary/20 text-[6px] font-mono">
          REF ONLY
        </text>
      </>
    );
  }
  if (layout === "mysterious_scan") {
    return (
      <>
        <defs>
          <linearGradient id="cp-scan" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.08" />
            <stop offset="50%" stopColor="transparent" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.12" />
          </linearGradient>
        </defs>
        <rect width="100%" height="100%" fill="url(#cp-scan)" />
        {[20, 40, 60, 80].map((y) => (
          <line
            key={y}
            x1="0"
            y1={`${y}%`}
            x2="100%"
            y2={`${y}%`}
            stroke={accent}
            strokeOpacity={0.06}
            strokeWidth="1"
          />
        ))}
      </>
    );
  }
  if (layout === "eco_craft") {
    return (
      <ellipse
        cx="50%"
        cy="55%"
        rx="38%"
        ry="28%"
        fill={accent}
        fillOpacity={0.06}
        stroke={accent}
        strokeOpacity={0.12}
      />
    );
  }
  if (layout === "minimal_flatlay") {
    return (
      <rect
        x="12%"
        y="18%"
        width="76%"
        height="68%"
        rx="8"
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.08}
        className="text-foreground"
      />
    );
  }
  return (
    <rect
      x="10%"
      y="16%"
      width="80%"
      height="72%"
      rx="10"
      fill="none"
      stroke={accent}
      strokeOpacity={0.1}
      strokeDasharray="4 6"
    />
  );
}
