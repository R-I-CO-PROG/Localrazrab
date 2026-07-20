import { Sparkline } from "./chart";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
  spark,
  className,
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  /** hex accent for the icon chip + sparkline */
  accent?: string;
  spark?: { date: string; count: number }[];
  className?: string;
}) {
  const tint = accent ?? "hsl(var(--primary))";
  return (
    <div
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-border bg-card transition-colors hover:border-primary/40",
        className
      )}
    >
      <div className="p-5 pb-3">
        <div className="flex items-center justify-between gap-3">
          <span className="mono text-[10.5px] uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </span>
          {icon && (
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg"
              style={{ background: `${tint}1f`, color: tint }}
            >
              {icon}
            </span>
          )}
        </div>
        <p className="num font-display mt-3 text-[2.5rem] font-semibold leading-none tracking-tight">
          {value}
        </p>
        {hint && <p className="mt-2.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-auto">
          <Sparkline data={spark} color={tint} />
        </div>
      )}
    </div>
  );
}
