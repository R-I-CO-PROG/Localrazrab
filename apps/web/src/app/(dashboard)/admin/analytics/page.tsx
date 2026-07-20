"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  Coins,
  FileText,
  Loader2,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Panel, ChartLabel, EmptyChart } from "@/components/admin/ui/panel";
import { StatCard } from "@/components/admin/ui/stat-card";
import {
  ChartTooltip,
  SERIES,
  PALETTE,
  axisProps,
  gridProps,
  formatAxisDate,
} from "@/components/admin/ui/chart";
import { formatNumber } from "@/lib/utils";
import type { AnalyticsPeriod, AnalyticsResponse } from "@/lib/admin-analytics";

// --- Labels ----------------------------------------------------------------

const STATUS_COLOR: Record<string, string> = {
  draft: SERIES.slate,
  ready: SERIES.violet,
  generating: SERIES.amber,
  done: SERIES.green,
  failed: SERIES.rose,
};

const PERIOD_LABELS: Record<AnalyticsPeriod, string> = {
  "7d": "7 дней",
  "30d": "30 дней",
  "90d": "90 дней",
  all: "Всё время",
};
const PERIODS: AnalyticsPeriod[] = ["7d", "30d", "90d", "all"];

const PLAN_LABELS: Record<string, string> = {
  STARTER: "Starter",
  BUSINESS: "Business",
  ENTERPRISE: "Enterprise",
};
const ROLE_LABELS: Record<string, string> = {
  USER: "Пользователь",
  MANAGER: "Менеджер",
  ADMIN: "Админ",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  ready: "Готов",
  generating: "Генерация",
  done: "Готово",
  failed: "Ошибка",
};
const ROUTE_LABELS: Record<string, string> = {
  DIRECT_PRODUCT: "Прямой подбор",
  IDEATION_PIPELINE: "Концепции",
  unknown: "Не задан",
};
const ACTION_LABELS: Record<string, string> = {
  CONCEPT_GENERATION: "Генерация концепций",
  VISUALIZATION: "Визуализация",
  PDF_EXPORT: "Экспорт PDF",
  PPTX_EXPORT: "Экспорт PPTX",
  DOCX_EXPORT: "Экспорт DOCX",
  ADMIN_GRANT: "Начисление",
};

// --- Formatters ------------------------------------------------------------

function formatDuration(sec: number | null): string {
  if (sec === null || Number.isNaN(sec)) return "—";
  if (sec < 60) return `${sec.toFixed(0)}с`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}м ${s}с`;
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// --- Page ------------------------------------------------------------------

export default function AdminAnalyticsPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [period, setPeriod] = useState<AnalyticsPeriod>("30d");
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    fetch("/api/admin/check")
      .then((r) => r.json())
      .then((d) => setAllowed(!!d.isAdmin))
      .catch(() => setAllowed(false));
  }, []);

  const load = useCallback(async (p: AnalyticsPeriod) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/analytics?period=${p}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось загрузить аналитику");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    load(period);
  }, [allowed, period, load]);

  if (allowed === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Проверка доступа…
      </div>
    );
  }

  if (!allowed) {
    return <NoAccess />;
  }

  const reveal = (i = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, delay: i * 0.05, ease: [0.23, 1, 0.32, 1] as const },
        };

  return (
    <div className="space-y-7">
      <motion.div {...reveal(0)}>
        <PageHeader
          eyebrow="Панель управления"
          title="Аналитика"
          description="Пульс платформы: аудитория, спрос, AI-движок и экономика кредитов."
          actions={
            <>
              <SegmentedControl value={period} onChange={setPeriod} loading={loading} />
              {data && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-primary admin-pulse" />
                  обновлено {formatTime(data.generatedAt)}
                </span>
              )}
            </>
          }
        />
      </motion.div>

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!data && loading && <DashboardSkeleton />}

      {data && (
        <div className="space-y-7">
          <KpiRow data={data} reveal={reveal} />
          <UsersBlock data={data} reveal={reveal} />
          <RequestsBlock data={data} reveal={reveal} />
          <GenerationBlock data={data} reveal={reveal} />
          <CreditsBlock data={data} reveal={reveal} />
        </div>
      )}

      {!data && !loading && !error && (
        <p className="text-sm text-muted-foreground">Нет данных</p>
      )}
    </div>
  );
}

type RevealFn = (i?: number) => Record<string, unknown>;

function NoAccess() {
  return (
    <div className="mx-auto max-w-lg space-y-4 py-20 text-center">
      <Shield className="mx-auto h-12 w-12 text-muted-foreground" />
      <h1 className="font-display text-2xl font-semibold">Нет доступа</h1>
      <p className="text-muted-foreground">Раздел только для администратора.</p>
      <Button asChild variant="outline">
        <Link href="/settings">Назад в настройки</Link>
      </Button>
    </div>
  );
}

// --- Period control --------------------------------------------------------

function SegmentedControl({
  value,
  onChange,
  loading,
}: {
  value: AnalyticsPeriod;
  onChange: (p: AnalyticsPeriod) => void;
  loading: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
      {PERIODS.map((p) => {
        const active = value === p;
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={`relative rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active ? "text-primary" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {active && (
              <motion.span
                layoutId="period-pill"
                className="absolute inset-0 rounded-lg bg-primary/12 ring-1 ring-inset ring-primary/30"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
            <span className="relative z-10">{PERIOD_LABELS[p]}</span>
          </button>
        );
      })}
      <Loader2
        className={`mr-1 h-4 w-4 text-muted-foreground transition-opacity ${
          loading ? "animate-spin opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

// --- KPI -------------------------------------------------------------------

function KpiRow({ data, reveal }: { data: AnalyticsResponse; reveal: RevealFn }) {
  const { users, requests, generation, credits } = data;
  const creditTotalSeries = credits.series.map((pt) => ({
    date: pt.date,
    count: credits.spendActions.reduce((s, a) => s + (Number(pt[a]) || 0), 0),
  }));

  const cards = [
    {
      icon: <Users className="h-4 w-4" />,
      label: "Пользователи",
      value: formatNumber(users.total),
      hint: `+${formatNumber(users.newInPeriod)} за период · ${formatNumber(users.active)} активны`,
      color: SERIES.green,
      spark: users.signupsSeries,
    },
    {
      icon: <FileText className="h-4 w-4" />,
      label: "Заявки за период",
      value: formatNumber(requests.inPeriod),
      hint: `конверсия в готово ${(requests.conversionRate * 100).toFixed(0)}%`,
      color: SERIES.cyan,
      spark: requests.series,
    },
    {
      icon: <Sparkles className="h-4 w-4" />,
      label: "AI-прогоны",
      value: formatNumber(generation.runsInPeriod),
      hint: `успех ${(generation.successRate * 100).toFixed(0)}% · ${formatDuration(generation.avgDurationSec)}`,
      color: SERIES.violet,
      spark: generation.series,
    },
    {
      icon: <Coins className="h-4 w-4" />,
      label: "Кредитов потрачено",
      value: formatNumber(credits.totalSpent),
      hint: `начислено ${formatNumber(credits.adminGrantedTotal)}`,
      color: SERIES.amber,
      spark: creditTotalSeries,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c, i) => (
        <motion.div key={c.label} {...reveal(2 + i)}>
          <StatCard
            label={c.label}
            value={c.value}
            hint={c.hint}
            icon={c.icon}
            accent={c.color}
            spark={c.spark}
          />
        </motion.div>
      ))}
    </div>
  );
}

// --- Donut -----------------------------------------------------------------

function Donut({
  data,
  colors,
  nameMap,
}: {
  data: { key: string; value: number }[];
  colors: string[];
  nameMap: Record<string, string>;
}) {
  const nonEmpty = data.filter((d) => d.value > 0);
  const total = nonEmpty.reduce((s, d) => s + d.value, 0);
  if (nonEmpty.length === 0) return <EmptyChart text="—" h={220} />;
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={nonEmpty}
              dataKey="value"
              nameKey="key"
              innerRadius={56}
              outerRadius={82}
              paddingAngle={2}
              stroke="none"
            >
              {nonEmpty.map((d, i) => (
                <Cell key={d.key} fill={colors[i % colors.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip nameMap={nameMap} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="num font-display text-2xl font-semibold">{formatNumber(total)}</span>
          <span className="mono text-[10px] uppercase tracking-wider text-muted-foreground">
            всего
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {nonEmpty.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2 text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ background: colors[i % colors.length] }}
            />
            <span className="truncate text-muted-foreground">{nameMap[d.key] ?? d.key}</span>
            <span className="num ml-auto font-semibold">{formatNumber(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- Blocks ----------------------------------------------------------------

function UsersBlock({ data, reveal }: { data: AnalyticsResponse; reveal: RevealFn }) {
  const { users } = data;
  return (
    <motion.div {...reveal(6)}>
      <Panel
        eyebrow="Аудитория"
        title="Пользователи и рост"
        icon={<Users className="h-5 w-5" />}
        stats={[
          { label: "всего", value: formatNumber(users.total) },
          { label: "активны", value: formatNumber(users.active) },
          { label: "заблок.", value: formatNumber(users.blocked) },
        ]}
      >
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <ChartLabel>Регистрации</ChartLabel>
            {users.signupsSeries.length < 2 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={users.signupsSeries}>
                  <defs>
                    <linearGradient id="g-signups" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={SERIES.green} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={SERIES.green} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatAxisDate} {...axisProps} />
                  <YAxis allowDecimals={false} width={28} {...axisProps} />
                  <Tooltip content={<ChartTooltip nameMap={{ count: "Регистраций" }} dateLabel />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={SERIES.green}
                    strokeWidth={2.5}
                    fill="url(#g-signups)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="grid content-start gap-5">
            <div>
              <ChartLabel>По тарифу</ChartLabel>
              <Donut
                data={users.byPlan.map((r) => ({ key: r.plan, value: r.count }))}
                colors={PALETTE}
                nameMap={PLAN_LABELS}
              />
            </div>
            <div>
              <ChartLabel>По роли</ChartLabel>
              <Donut
                data={users.byRole.map((r) => ({ key: r.role, value: r.count }))}
                colors={[SERIES.violet, SERIES.cyan, SERIES.amber]}
                nameMap={ROLE_LABELS}
              />
            </div>
          </div>
        </div>
      </Panel>
    </motion.div>
  );
}

function RequestsBlock({ data, reveal }: { data: AnalyticsResponse; reveal: RevealFn }) {
  const { requests } = data;
  const statusData = requests.byStatus.map((r) => ({
    key: r.status,
    name: STATUS_LABELS[r.status] ?? r.status,
    value: r.count,
  }));
  const categoryData = requests.topCategories.map((r) => ({ name: r.category, value: r.count }));
  return (
    <motion.div {...reveal(7)}>
      <Panel
        eyebrow="Спрос"
        title="Заявки и воронка"
        icon={<FileText className="h-5 w-5" />}
        stats={[
          { label: "всего", value: formatNumber(requests.total) },
          { label: "за период", value: formatNumber(requests.inPeriod) },
          { label: "конверсия", value: `${(requests.conversionRate * 100).toFixed(0)}%` },
        ]}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <ChartLabel>Заявки по дням</ChartLabel>
            {requests.series.length < 2 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={requests.series}>
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatAxisDate} {...axisProps} />
                  <YAxis allowDecimals={false} width={28} {...axisProps} />
                  <Tooltip content={<ChartTooltip nameMap={{ count: "Заявок" }} dateLabel />} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke={SERIES.cyan}
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <ChartLabel>По статусам</ChartLabel>
            {statusData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={statusData}>
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis dataKey="name" {...axisProps} />
                  <YAxis allowDecimals={false} width={28} {...axisProps} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                    content={<ChartTooltip nameMap={{ value: "Заявок" }} />}
                  />
                  <Bar dataKey="value" name="value" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {statusData.map((d) => (
                      <Cell key={d.key} fill={STATUS_COLOR[d.key] ?? SERIES.green} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        {categoryData.length > 0 && (
          <div className="mt-6">
            <ChartLabel>Топ категорий</ChartLabel>
            <ResponsiveContainer width="100%" height={Math.max(180, categoryData.length * 38)}>
              <BarChart data={categoryData} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid {...gridProps} horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...axisProps} />
                <YAxis type="category" dataKey="name" width={150} {...axisProps} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                  content={<ChartTooltip nameMap={{ value: "Заявок" }} />}
                />
                <Bar
                  dataKey="value"
                  name="value"
                  fill={SERIES.cyan}
                  radius={[0, 6, 6, 0]}
                  maxBarSize={26}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Panel>
    </motion.div>
  );
}

function GenerationBlock({ data, reveal }: { data: AnalyticsResponse; reveal: RevealFn }) {
  const { generation } = data;
  return (
    <motion.div {...reveal(8)}>
      <Panel
        eyebrow="AI-движок"
        title="Генерация концепций"
        icon={<Activity className="h-5 w-5" />}
        stats={[
          { label: "прогонов", value: formatNumber(generation.runsInPeriod) },
          { label: "успех", value: `${(generation.successRate * 100).toFixed(0)}%` },
          { label: "медиана", value: formatDuration(generation.medianDurationSec) },
        ]}
      >
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Успешных" value={formatNumber(generation.done)} color={SERIES.green} />
          <MiniStat label="Ошибок" value={formatNumber(generation.failed)} color={SERIES.rose} />
          <MiniStat label="Среднее" value={formatDuration(generation.avgDurationSec)} color={SERIES.cyan} />
          <MiniStat label="Медиана" value={formatDuration(generation.medianDurationSec)} color={SERIES.violet} />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <ChartLabel>Прогоны по дням</ChartLabel>
            {generation.series.length < 2 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={generation.series}>
                  <defs>
                    <linearGradient id="g-runs" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={SERIES.violet} stopOpacity={0.35} />
                      <stop offset="95%" stopColor={SERIES.violet} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatAxisDate} {...axisProps} />
                  <YAxis allowDecimals={false} width={28} {...axisProps} />
                  <Tooltip content={<ChartTooltip nameMap={{ count: "Прогонов" }} dateLabel />} />
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke={SERIES.violet}
                    strokeWidth={2.5}
                    fill="url(#g-runs)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <ChartLabel>По маршруту</ChartLabel>
            <Donut
              data={generation.byRoute.map((r) => ({ key: r.route, value: r.count }))}
              colors={[SERIES.green, SERIES.cyan, SERIES.amber]}
              nameMap={ROUTE_LABELS}
            />
          </div>
        </div>
      </Panel>
    </motion.div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-secondary/30 p-3">
      <span className="absolute left-0 top-0 h-full w-1 rounded-r" style={{ background: color }} />
      <p className="mono pl-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="num font-display pl-1.5 text-lg font-semibold">{value}</p>
    </div>
  );
}

function CreditsBlock({ data, reveal }: { data: AnalyticsResponse; reveal: RevealFn }) {
  const { credits } = data;
  const actionData = credits.byAction.map((r) => ({
    name: ACTION_LABELS[r.action] ?? r.action,
    value: r.total,
  }));
  const maxSpender = credits.topSpenders[0]?.spent ?? 0;
  return (
    <motion.div {...reveal(9)}>
      <Panel
        eyebrow="Экономика"
        title="Кредиты и расход"
        icon={<Coins className="h-5 w-5" />}
        stats={[
          { label: "потрачено", value: formatNumber(credits.totalSpent) },
          { label: "начислено", value: formatNumber(credits.totalToppedUp) },
        ]}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <ChartLabel>Расход по дням (по типам)</ChartLabel>
            {credits.series.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={credits.series}>
                  <CartesianGrid {...gridProps} vertical={false} />
                  <XAxis dataKey="date" tickFormatter={formatAxisDate} {...axisProps} />
                  <YAxis allowDecimals={false} width={28} {...axisProps} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                    content={<ChartTooltip nameMap={ACTION_LABELS} dateLabel />}
                  />
                  {credits.spendActions.map((action, i) => (
                    <Bar
                      key={action}
                      dataKey={action}
                      name={action}
                      stackId="credits"
                      fill={PALETTE[i % PALETTE.length]}
                      radius={i === credits.spendActions.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      maxBarSize={40}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <ChartLabel>По типам действий</ChartLabel>
            {actionData.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={actionData} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid {...gridProps} horizontal={false} />
                  <XAxis type="number" allowDecimals={false} {...axisProps} />
                  <YAxis type="category" dataKey="name" width={150} {...axisProps} />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--primary) / 0.06)" }}
                    content={<ChartTooltip nameMap={{ value: "Кредитов" }} />}
                  />
                  <Bar
                    dataKey="value"
                    name="value"
                    fill={SERIES.amber}
                    radius={[0, 6, 6, 0]}
                    maxBarSize={26}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="mt-6">
          <ChartLabel>Топ-10 по расходу</ChartLabel>
          {credits.topSpenders.length === 0 ? (
            <EmptyChart text="Нет трат за период" h={120} />
          ) : (
            <ul className="space-y-1.5">
              {credits.topSpenders.map((u, i) => (
                <li
                  key={u.userId}
                  className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-border bg-secondary/30 px-3 py-2.5"
                >
                  <span
                    className="absolute inset-y-0 left-0 bg-primary/10"
                    style={{ width: `${maxSpender ? (u.spent / maxSpender) * 100 : 0}%` }}
                  />
                  <span className="mono relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-bold text-secondary-foreground">
                    {i + 1}
                  </span>
                  <span className="mono relative z-10 truncate text-sm">{u.email}</span>
                  <span className="num relative z-10 ml-auto pl-3 font-bold text-primary">
                    {formatNumber(u.spent)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-6">
          <ChartLabel>Начисления баланса (по типам)</ChartLabel>
          {credits.topUps.length === 0 ? (
            <EmptyChart text="Нет начислений за период" h={120} />
          ) : (
            <ul className="space-y-1.5">
              {credits.topUps.map((r) => (
                <li
                  key={r.action}
                  className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-3 py-2.5"
                >
                  <span className="mono truncate text-sm">
                    {ACTION_LABELS[r.action] ?? r.action}
                  </span>
                  <span className="num ml-auto pl-3 font-bold text-emerald-500">
                    +{formatNumber(r.total)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Panel>
    </motion.div>
  );
}

// --- Skeleton --------------------------------------------------------------

function DashboardSkeleton() {
  return (
    <div className="space-y-7">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[160px] animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="h-[360px] animate-pulse rounded-2xl border border-border bg-card" />
      ))}
    </div>
  );
}
