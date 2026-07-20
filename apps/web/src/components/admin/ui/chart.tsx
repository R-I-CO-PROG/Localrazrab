"use client";

import { useId } from "react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { formatNumber } from "@/lib/utils";

// Cohesive cockpit chart palette — accent green leads, the rest are reserved
// for genuine categories. Hex (canvas/recharts can't read CSS vars).
export const SERIES = {
  green: "#34D17F",
  cyan: "#38BDF8",
  amber: "#FBBF24",
  violet: "#A78BFA",
  teal: "#2DD4BF",
  rose: "#FB7185",
  slate: "#64748B",
};

export const PALETTE = [
  SERIES.green,
  SERIES.cyan,
  SERIES.amber,
  SERIES.violet,
  SERIES.teal,
  SERIES.rose,
];

export const axisProps = {
  tickLine: false,
  axisLine: false,
  fontSize: 11,
  stroke: "hsl(var(--muted-foreground))",
} as const;

export const gridProps = {
  strokeDasharray: "2 4",
  stroke: "hsl(var(--border))",
  strokeOpacity: 0.8,
} as const;

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  fill?: string;
}

export function ChartTooltip({
  active,
  payload,
  label,
  nameMap,
  unit,
  dateLabel,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string | number;
  nameMap?: Record<string, string>;
  unit?: string;
  dateLabel?: boolean;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-popover px-3 py-2 shadow-xl">
      {label !== undefined && label !== "" && (
        <p className="mono mb-1.5 text-[10.5px] uppercase tracking-wider text-muted-foreground">
          {dateLabel ? formatAxisDate(String(label)) : String(label)}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => {
          const key = String(p.name ?? "");
          const name = nameMap?.[key] ?? key;
          return (
            <div key={i} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: p.color ?? p.fill }}
              />
              {name && <span className="text-muted-foreground">{name}</span>}
              <span className="num ml-auto pl-3 font-semibold">
                {formatNumber(Number(p.value))}
                {unit ?? ""}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function formatAxisDate(iso: string): string {
  return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

export function Sparkline({
  data,
  color,
  dataKey = "count",
  height = 48,
}: {
  data: { date: string; count: number }[];
  color: string;
  dataKey?: string;
  height?: number;
}) {
  const id = useId().replace(/:/g, "");
  if (!data || data.length < 2) return <div style={{ height }} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={2}
          fill={`url(#spark-${id})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
