"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Gauge,
  Infinity as InfinityIcon,
  Loader2,
  Play,
  Shield,
  Timer,
  X,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/admin/ui/page-header";
import { Panel, ChartLabel, EmptyChart } from "@/components/admin/ui/panel";
import { StatCard } from "@/components/admin/ui/stat-card";
import { ChartTooltip, SERIES, axisProps, gridProps, formatAxisDate } from "@/components/admin/ui/chart";
import { formatNumber } from "@/lib/utils";
import type { TesterState, RunDetail, Severity } from "@/lib/admin-tester";

// --- Labels ----------------------------------------------------------------

const SEV_LABEL: Record<Severity, string> = { high: "Высокая", med: "Средняя", low: "Низкая" };
const SEV_COLOR: Record<Severity, string> = { high: SERIES.rose, med: SERIES.amber, low: SERIES.slate };

function scoreColor(score: number | null): string {
  if (score == null) return SERIES.slate;
  if (score >= 85) return SERIES.green;
  if (score >= 70) return SERIES.cyan;
  if (score >= 50) return SERIES.amber;
  return SERIES.rose;
}

function formatDuration(sec: number | null): string {
  if (sec == null || Number.isNaN(sec)) return "—";
  if (sec < 60) return `${sec.toFixed(0)}с`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}м ${s}с`;
}
function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}
function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- Page ------------------------------------------------------------------

export default function AdminTesterPage() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [data, setData] = useState<TesterState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningCount, setRunningCount] = useState<number | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    fetch("/api/admin/check")
      .then((r) => r.json())
      .then((d) => setAllowed(!!d.isAdmin))
      .catch(() => setAllowed(false));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tester");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Не удалось загрузить данные тестера");
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
    load();
  }, [allowed, load]);

  const run = useCallback(
    async (count: number) => {
      if (runningCount != null) return;
      setRunningCount(count);
      setError(null);
      try {
        const res = await fetch("/api/admin/tester", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Ошибка прогона");
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Ошибка прогона");
      } finally {
        setRunningCount(null);
      }
    },
    [runningCount, load],
  );

  if (allowed === null) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Проверка доступа…
      </div>
    );
  }
  if (!allowed) return <NoAccess />;

  const reveal = (i = 0) =>
    reduce
      ? {}
      : {
          initial: { opacity: 0, y: 12 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.4, delay: i * 0.05, ease: [0.23, 1, 0.32, 1] as const },
        };

  const busy = runningCount != null;

  return (
    <div className="space-y-7">
      <motion.div {...reveal(0)}>
        <PageHeader
          eyebrow="Контроль качества"
          title="Тестер подбора"
          description="Гоняет брифы через прод-пайплайн и оценивает наборы LLM-судьёй и объективными правилами. Запуск ограничен 1–2 прогонами, чтобы не нагружать сервер."
          actions={
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <RunControls busy={busy} runningCount={runningCount} onRun={run} disabled={loading} />
              {data && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-full bg-primary admin-pulse" />
                  обновлено {formatTime(data.generatedAt)}
                </span>
              )}
            </div>
          }
        />
      </motion.div>

      {busy && (
        <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-sm">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary" />
          <span>
            Идёт прогон ({runningCount}) — генерация концепций и оценка судьёй. Это занимает десятки секунд, не закрывайте страницу.
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {!data && loading && <Skeleton />}

      {data && (
        <div className="space-y-7">
          <KpiRow data={data} reveal={reveal} />
          <div className="grid gap-7 xl:grid-cols-[1.5fr_1fr]">
            <TrendBlock data={data} reveal={reveal} />
            <SeverityBlock data={data} reveal={reveal} />
          </div>
          <RecentBlock data={data} reveal={reveal} onOpen={setOpenId} />
          <div className="grid gap-7 lg:grid-cols-[1.3fr_1fr]">
            <CategoriesBlock data={data} reveal={reveal} />
            <HealthBlock data={data} reveal={reveal} />
          </div>
        </div>
      )}

      <AnimatePresence>{openId && <RunModal id={openId} onClose={() => setOpenId(null)} />}</AnimatePresence>
    </div>
  );
}

// --- Run controls ----------------------------------------------------------

function RunControls({
  busy,
  runningCount,
  onRun,
  disabled,
}: {
  busy: boolean;
  runningCount: number | null;
  onRun: (n: number) => void;
  disabled: boolean;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-card p-1">
      {[1, 2].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onRun(n)}
          disabled={busy || disabled}
          className="relative flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-primary/12 hover:text-primary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-foreground"
        >
          {runningCount === n ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {n} прогон{n > 1 ? "а" : ""}
        </button>
      ))}
      <span
        title="Отключено, чтобы не нагружать сервер"
        className="flex cursor-not-allowed items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium text-muted-foreground opacity-50"
        aria-disabled="true"
      >
        <InfinityIcon className="h-4 w-4" />
        бесконечно
      </span>
    </div>
  );
}

// --- KPI -------------------------------------------------------------------

type RevealFn = (i?: number) => Record<string, unknown>;

function KpiRow({ data, reveal }: { data: TesterState; reveal: RevealFn }) {
  const t = data.totals;
  const cards = [
    { icon: <Activity className="h-4 w-4" />, label: "Прогонов", value: formatNumber(t.runs), hint: `успешных ${formatNumber(t.okRuns)} · ошибок ${formatNumber(t.failRuns)}`, color: SERIES.cyan, spark: data.scoreTrend },
    { icon: <Gauge className="h-4 w-4" />, label: "Средний балл", value: `${t.avgScore}`, hint: "из 100", color: scoreColor(t.avgScore), spark: data.scoreTrend },
    { icon: <AlertTriangle className="h-4 w-4" />, label: "Проблем найдено", value: formatNumber(t.problemsTotal), hint: `high ${data.sevCounts.high} · med ${data.sevCounts.med} · low ${data.sevCounts.low}`, color: SERIES.amber },
    { icon: <Timer className="h-4 w-4" />, label: "Ср. время", value: formatDuration(t.avgElapsed), hint: "на прогон", color: SERIES.violet },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c, i) => (
        <motion.div key={c.label} {...reveal(1 + i)}>
          <StatCard label={c.label} value={c.value} hint={c.hint} icon={c.icon} accent={c.color} spark={c.spark} />
        </motion.div>
      ))}
    </div>
  );
}

// --- Trend -----------------------------------------------------------------

function TrendBlock({ data, reveal }: { data: TesterState; reveal: RevealFn }) {
  return (
    <motion.div {...reveal(5)}>
      <Panel eyebrow="Качество" title="Тренд баллов" icon={<Gauge className="h-5 w-5" />}>
        <ChartLabel>Балл по прогонам</ChartLabel>
        {data.scoreTrend.length < 2 ? (
          <EmptyChart text="Мало данных — запустите прогон" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data.scoreTrend}>
              <defs>
                <linearGradient id="g-score" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={SERIES.green} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={SERIES.green} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatAxisDate} {...axisProps} />
              <YAxis domain={[0, 100]} width={28} {...axisProps} />
              <Tooltip content={<ChartTooltip nameMap={{ count: "Балл" }} dateLabel />} />
              <Area type="monotone" dataKey="count" stroke={SERIES.green} strokeWidth={2.5} fill="url(#g-score)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </motion.div>
  );
}

// --- Severity --------------------------------------------------------------

function SeverityBlock({ data, reveal }: { data: TesterState; reveal: RevealFn }) {
  const sev = (["high", "med", "low"] as Severity[]).map((k) => ({ key: k, name: SEV_LABEL[k], value: data.sevCounts[k] }));
  const total = sev.reduce((s, d) => s + d.value, 0);
  return (
    <motion.div {...reveal(6)}>
      <Panel eyebrow="Серьёзность" title="Проблемы" icon={<AlertTriangle className="h-5 w-5" />}>
        {total === 0 ? (
          <EmptyChart text="Проблем не найдено" />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={sev}>
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="name" {...axisProps} />
              <YAxis allowDecimals={false} width={28} {...axisProps} />
              <Tooltip cursor={{ fill: "hsl(var(--primary) / 0.06)" }} content={<ChartTooltip nameMap={{ value: "Проблем" }} />} />
              <Bar dataKey="value" name="value" radius={[6, 6, 0, 0]} maxBarSize={64}>
                {sev.map((d) => (
                  <Cell key={d.key} fill={SEV_COLOR[d.key]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>
    </motion.div>
  );
}

// --- Recent ----------------------------------------------------------------

function RecentBlock({ data, reveal, onOpen }: { data: TesterState; reveal: RevealFn; onOpen: (id: string) => void }) {
  return (
    <motion.div {...reveal(7)}>
      <Panel
        eyebrow="Журнал"
        title="Последние прогоны"
        icon={<Activity className="h-5 w-5" />}
        stats={[{ label: "показано", value: `${data.recent.length}` }]}
        bodyClassName="p-0"
      >
        {data.recent.length === 0 ? (
          <div className="p-6">
            <EmptyChart text="Прогонов ещё не было — запустите 1–2" h={120} />
          </div>
        ) : (
          <div className="divide-y divide-border">
            {data.recent.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpen(r.id)}
                className="flex w-full items-center gap-4 px-5 py-3 text-left transition-colors hover:bg-secondary/40 sm:px-6"
              >
                <span
                  className="num flex h-9 w-12 shrink-0 items-center justify-center rounded-lg text-sm font-bold"
                  style={{ background: `${scoreColor(r.score)}1f`, color: scoreColor(r.score) }}
                >
                  {r.ok ? r.score : "ERR"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.prompt}</p>
                  <p className="truncate text-xs text-muted-foreground">{r.summary || "—"}</p>
                </div>
                <div className="hidden shrink-0 text-right sm:block">
                  <p className="mono text-[11px] uppercase tracking-wider text-muted-foreground">
                    {r.problemCount} проблем
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDuration(r.elapsed)} · {formatDateTime(r.ts)}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Panel>
    </motion.div>
  );
}

// --- Categories ------------------------------------------------------------

function CategoriesBlock({ data, reveal }: { data: TesterState; reveal: RevealFn }) {
  const cats = data.byCategory.slice(0, 12);
  const max = Math.max(1, ...cats.map((c) => c.count));
  return (
    <motion.div {...reveal(8)}>
      <Panel eyebrow="Где болит" title="Проблемы по категориям" icon={<AlertTriangle className="h-5 w-5" />}>
        {cats.length === 0 ? (
          <EmptyChart text="Нет данных" h={120} />
        ) : (
          <ul className="space-y-2">
            {cats.map((c) => (
              <li key={c.cat} className="flex items-center gap-3 text-sm">
                <span className="mono w-36 shrink-0 truncate text-xs text-muted-foreground">{c.cat}</span>
                <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-primary/70"
                    style={{ width: `${(c.count / max) * 100}%` }}
                  />
                </span>
                <span className="num w-8 shrink-0 text-right font-semibold">{c.count}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </motion.div>
  );
}

// --- Health ----------------------------------------------------------------

function HealthBlock({ data, reveal }: { data: TesterState; reveal: RevealFn }) {
  const items = [
    { label: "LLM-судья", ok: data.judgeEnabled, on: "настроен", off: "нет ключа OpenRouter" },
    { label: "Статус", ok: !data.running, on: "свободен", off: "идёт прогон" },
  ];
  return (
    <motion.div {...reveal(9)}>
      <Panel eyebrow="Здоровье" title="Состояние" icon={<Activity className="h-5 w-5" />}>
        <ul className="space-y-2.5">
          {items.map((it) => (
            <li key={it.label} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/30 px-4 py-3">
              {it.ok ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" style={{ color: SERIES.green }} />
              ) : (
                <AlertTriangle className="h-5 w-5 shrink-0" style={{ color: SERIES.amber }} />
              )}
              <span className="text-sm font-medium">{it.label}</span>
              <span className="ml-auto text-xs text-muted-foreground">{it.ok ? it.on : it.off}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </motion.div>
  );
}

// --- Modal -----------------------------------------------------------------

function RunModal({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/admin/tester?id=${encodeURIComponent(id)}`)
      .then((r) => r.json().then((j) => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!alive) return;
        if (!ok) setError(j.error ?? "Не удалось загрузить прогон");
        else setDetail(j);
      })
      .catch((e) => alive && setError(String(e)))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [id]);

  return (
    <motion.div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-8"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <motion.div
        className="relative w-full max-w-3xl rounded-2xl border border-border bg-card shadow-2xl"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.98 }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {loading && (
          <div className="flex h-48 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Загрузка…
          </div>
        )}
        {error && <div className="p-6 text-sm text-destructive">{error}</div>}

        {detail && (
          <div className="max-h-[80vh] overflow-y-auto p-6">
            <div className="mb-4 flex items-start gap-3 pr-8">
              <span
                className="num flex h-12 w-16 shrink-0 items-center justify-center rounded-xl text-lg font-bold"
                style={{ background: `${scoreColor(detail.score)}1f`, color: scoreColor(detail.score) }}
              >
                {detail.ok ? detail.score : "ERR"}
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-xl font-semibold leading-tight">{detail.prompt}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {detail.brief ? `бюджет ${detail.brief.budgetMin}–${detail.brief.budgetMax}₽ · ` : ""}
                  {formatDuration(detail.elapsed)} · {formatDateTime(detail.ts)}
                </p>
              </div>
            </div>

            {detail.error && (
              <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {detail.error}
              </div>
            )}

            {detail.judge?.summary && (
              <div className="mb-4 rounded-xl border border-border bg-secondary/30 p-4">
                <ChartLabel>Вердикт судьи</ChartLabel>
                <p className="text-sm leading-relaxed">{detail.judge.summary}</p>
              </div>
            )}

            {detail.problems.length > 0 && (
              <div className="mb-5">
                <ChartLabel>Проблемы ({detail.problems.length})</ChartLabel>
                <ul className="space-y-1.5">
                  {detail.problems.map((p, i) => (
                    <li key={i} className="flex items-start gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                      <span
                        className="mono mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase"
                        style={{ background: `${SEV_COLOR[p.sev]}1f`, color: SEV_COLOR[p.sev] }}
                      >
                        {p.sev}
                      </span>
                      <span className="min-w-0">
                        <span className="mono text-xs text-muted-foreground">
                          {p.cat}/{p.src}
                          {p.set ? ` · набор ${p.set}` : ""}:{" "}
                        </span>
                        {p.text}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {detail.concepts.length > 0 && (
              <div>
                <ChartLabel>Наборы ({detail.concepts.length})</ChartLabel>
                <div className="space-y-3">
                  {detail.concepts.map((c, i) => (
                    <div key={i} className="rounded-xl border border-border bg-secondary/20 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="font-medium">{c.title}</span>
                        {c.boldness != null && (
                          <span className="mono rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                            bold {c.boldness}
                          </span>
                        )}
                        <span className="num ml-auto text-sm font-semibold text-primary">
                          {formatNumber(Math.round(c.sum))}₽
                        </span>
                      </div>
                      <ul className="space-y-1">
                        {c.products.map((p, j) => (
                          <li key={j} className="flex items-center gap-2 text-sm">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                            <span className="min-w-0 truncate">
                              {p.name}
                              <span className="text-muted-foreground"> · {p.category}</span>
                            </span>
                            <span className="num ml-auto shrink-0 text-muted-foreground">
                              {p.price != null ? `${formatNumber(Math.round(p.price))}₽` : "—"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

// --- Misc ------------------------------------------------------------------

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

function Skeleton() {
  return (
    <div className="space-y-7">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[160px] animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
      <div className="grid gap-7 xl:grid-cols-[1.5fr_1fr]">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="h-[360px] animate-pulse rounded-2xl border border-border bg-card" />
        ))}
      </div>
    </div>
  );
}
