import { cn } from "@/lib/utils";

export function Panel({
  eyebrow,
  title,
  icon,
  stats,
  actions,
  children,
  className,
  bodyClassName,
}: {
  eyebrow?: string;
  title?: string;
  icon?: React.ReactNode;
  stats?: { label: string; value: string }[];
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const hasHeader = title || eyebrow || stats || actions;
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-border bg-card",
        className
      )}
    >
      {hasHeader && (
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-secondary/60 text-primary">
                {icon}
              </span>
            )}
            <div className="leading-tight">
              {eyebrow && (
                <p className="mono text-[10.5px] uppercase tracking-[0.18em] text-muted-foreground">
                  {eyebrow}
                </p>
              )}
              {title && (
                <h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2>
              )}
            </div>
          </div>
          {stats && stats.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
              {stats.map((s) => (
                <div key={s.label} className="text-right">
                  <p className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                  <p className="num font-display text-lg font-semibold">{s.value}</p>
                </div>
              ))}
            </div>
          )}
          {actions}
        </header>
      )}
      <div className={cn("p-5 sm:p-6", bodyClassName)}>{children}</div>
    </section>
  );
}

export function ChartLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mono mb-3 text-[11px] uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

export function EmptyChart({
  text = "Нет данных за период",
  h = 260,
}: {
  text?: string;
  h?: number;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground"
      style={{ height: h }}
    >
      {text}
    </div>
  );
}
