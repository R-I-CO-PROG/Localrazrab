import { Prisma } from "@prisma/client";
import type {
  CreditAction,
  PlanType,
  UserRole,
  RequestStatus,
  AgentRunStatus,
  AgentRoute,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { resolveAdminUserIds } from "@/lib/admin";

// --- Periods ---------------------------------------------------------------

export type AnalyticsPeriod = "7d" | "30d" | "90d" | "all";

export const ANALYTICS_PERIODS: AnalyticsPeriod[] = ["7d", "30d", "90d", "all"];

type Bucket = "day" | "week";

export interface ResolvedPeriod {
  period: AnalyticsPeriod;
  since: Date | null;
  bucket: Bucket;
}

export function isAnalyticsPeriod(value: unknown): value is AnalyticsPeriod {
  return typeof value === "string" && (ANALYTICS_PERIODS as string[]).includes(value);
}

/** Превращает пресет периода в диапазон дат и шаг агрегации. now передаётся для тестируемости. */
export function resolvePeriod(
  period: AnalyticsPeriod,
  now: Date = new Date()
): ResolvedPeriod {
  if (period === "all") {
    return { period, since: null, bucket: "week" };
  }
  const days = period === "7d" ? 7 : period === "30d" ? 30 : 90;
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { period, since, bucket: "day" };
}

// --- Response shape --------------------------------------------------------

export interface TimePoint {
  date: string; // ISO
  count: number;
}

export interface UsersSection {
  total: number;
  active: number;
  blocked: number;
  newInPeriod: number;
  signupsSeries: TimePoint[];
  byPlan: { plan: PlanType; count: number }[];
  byRole: { role: UserRole; count: number }[];
}

export interface RequestsSection {
  total: number;
  inPeriod: number;
  conversionRate: number; // done / inPeriod (0..1)
  series: TimePoint[];
  byStatus: { status: RequestStatus; count: number }[];
  topCategories: { category: string; count: number }[];
}

export interface GenerationSection {
  runsInPeriod: number;
  done: number;
  failed: number;
  successRate: number; // done / (done + failed)
  avgDurationSec: number | null;
  medianDurationSec: number | null;
  byRoute: { route: AgentRoute | "unknown"; count: number }[];
  series: TimePoint[];
}

export interface CreditsSeriesPoint {
  date: string;
  [action: string]: string | number;
}

export interface CreditsSection {
  series: CreditsSeriesPoint[];
  spendActions: CreditAction[];
  byAction: { action: CreditAction; total: number }[];
  /** Начисления баланса (amount > 0) по типам — покупки/гранты. */
  topUps: { action: CreditAction; total: number }[];
  topSpenders: { userId: string; email: string; spent: number }[];
  adminGrantedTotal: number;
  totalSpent: number;
  totalToppedUp: number;
}

export interface AnalyticsResponse {
  period: AnalyticsPeriod;
  generatedAt: string;
  users: UsersSection;
  requests: RequestsSection;
  generation: GenerationSection;
  credits: CreditsSection;
}

// --- Raw helpers -----------------------------------------------------------

const TABLES = {
  user: '"user"',
  request: '"Request"',
  agentRun: '"AgentRun"',
} as const;

type SeriesTable = keyof typeof TABLES;

async function timeSeries(
  table: SeriesTable,
  { since, bucket }: ResolvedPeriod
): Promise<TimePoint[]> {
  const where = since
    ? Prisma.sql`WHERE "createdAt" >= ${since}`
    : Prisma.empty;
  const rows = await prisma.$queryRaw<{ bucket: Date; count: bigint }[]>(Prisma.sql`
    SELECT date_trunc(${bucket}, "createdAt") AS bucket, count(*)::bigint AS count
    FROM ${Prisma.raw(TABLES[table])}
    ${where}
    GROUP BY 1
    ORDER BY 1
  `);
  return rows.map((r) => ({ date: r.bucket.toISOString(), count: Number(r.count) }));
}

// --- Sections --------------------------------------------------------------

async function buildUsers(
  rp: ResolvedPeriod,
  now: Date,
  adminIds: string[],
): Promise<UsersSection> {
  // Исключаем админ-аккаунты из всех агрегатов пользователей.
  const notAdmin: Prisma.UserWhereInput = adminIds.length ? { id: { notIn: adminIds } } : {};
  const [total, blocked, active, newInPeriod, byPlanRaw, byRoleRaw, series] =
    await Promise.all([
      prisma.user.count({ where: notAdmin }),
      prisma.user.count({ where: { ...notAdmin, blocked: true } }),
      prisma.user.count({ where: { ...notAdmin, sessions: { some: { expiresAt: { gt: now } } } } }),
      rp.since
        ? prisma.user.count({ where: { ...notAdmin, createdAt: { gte: rp.since } } })
        : prisma.user.count({ where: notAdmin }),
      prisma.user.groupBy({ by: ["plan"], where: notAdmin, _count: { _all: true } }),
      prisma.user.groupBy({ by: ["role"], where: notAdmin, _count: { _all: true } }),
      timeSeries("user", rp),
    ]);

  return {
    total,
    active,
    blocked,
    newInPeriod,
    signupsSeries: series,
    byPlan: byPlanRaw.map((r) => ({ plan: r.plan, count: r._count._all })),
    byRole: byRoleRaw.map((r) => ({ role: r.role, count: r._count._all })),
  };
}

async function buildRequests(rp: ResolvedPeriod): Promise<RequestsSection> {
  const periodWhere = rp.since ? { createdAt: { gte: rp.since } } : {};
  const [total, inPeriod, doneInPeriod, byStatusRaw, topCategoriesRaw, series] =
    await Promise.all([
      prisma.request.count(),
      prisma.request.count({ where: periodWhere }),
      prisma.request.count({ where: { ...periodWhere, status: "done" } }),
      prisma.request.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.request.groupBy({
        by: ["category"],
        _count: { _all: true },
        orderBy: { _count: { category: "desc" } },
        take: 8,
      }),
      timeSeries("request", rp),
    ]);

  return {
    total,
    inPeriod,
    conversionRate: inPeriod > 0 ? doneInPeriod / inPeriod : 0,
    series,
    byStatus: byStatusRaw.map((r) => ({ status: r.status, count: r._count._all })),
    topCategories: topCategoriesRaw.map((r) => ({
      category: r.category,
      count: r._count._all,
    })),
  };
}

async function buildGeneration(rp: ResolvedPeriod): Promise<GenerationSection> {
  const periodWhere = rp.since ? { createdAt: { gte: rp.since } } : {};
  const durationWhere = rp.since
    ? Prisma.sql`AND "createdAt" >= ${rp.since}`
    : Prisma.empty;

  const [runsInPeriod, done, failed, byRouteRaw, series, durationRows] =
    await Promise.all([
      prisma.agentRun.count({ where: periodWhere }),
      prisma.agentRun.count({ where: { ...periodWhere, status: "done" } }),
      prisma.agentRun.count({ where: { ...periodWhere, status: "failed" } }),
      prisma.agentRun.groupBy({ by: ["route"], _count: { _all: true } }),
      timeSeries("agentRun", rp),
      prisma.$queryRaw<{ avg: number | null; median: number | null }[]>(Prisma.sql`
        SELECT
          avg(extract(epoch FROM ("finishedAt" - "startedAt")))::float8 AS avg,
          percentile_cont(0.5) WITHIN GROUP (
            ORDER BY extract(epoch FROM ("finishedAt" - "startedAt"))
          )::float8 AS median
        FROM "AgentRun"
        WHERE "finishedAt" IS NOT NULL AND "startedAt" IS NOT NULL
        ${durationWhere}
      `),
    ]);

  const duration = durationRows[0] ?? { avg: null, median: null };

  return {
    runsInPeriod,
    done,
    failed,
    successRate: done + failed > 0 ? done / (done + failed) : 0,
    avgDurationSec: duration.avg ?? null,
    medianDurationSec: duration.median ?? null,
    byRoute: byRouteRaw.map((r) => ({
      route: (r.route ?? "unknown") as AgentRoute | "unknown",
      count: r._count._all,
    })),
    series,
  };
}

async function buildCredits(rp: ResolvedPeriod, adminIds: string[]): Promise<CreditsSection> {
  const sinceClause = rp.since
    ? Prisma.sql`AND "createdAt" >= ${rp.since}`
    : Prisma.empty;
  // В JOIN с таблицей "user" колонка "createdAt" есть в обеих таблицах — квалифицируем.
  const sinceClauseCl = rp.since
    ? Prisma.sql`AND cl."createdAt" >= ${rp.since}`
    : Prisma.empty;
  // Исключаем активность админ-аккаунтов из кредитной аналитики.
  const notAdmin = adminIds.length
    ? Prisma.sql`AND "userId" NOT IN (${Prisma.join(adminIds)})`
    : Prisma.empty;
  const notAdminCl = adminIds.length
    ? Prisma.sql`AND cl."userId" NOT IN (${Prisma.join(adminIds)})`
    : Prisma.empty;
  const periodWhere = rp.since ? { createdAt: { gte: rp.since } } : {};
  const notAdminWhere = adminIds.length ? { userId: { notIn: adminIds } } : {};

  const [seriesRows, byActionRaw, topSpendersRows, adminAgg, topUpsRaw] = await Promise.all([
    prisma.$queryRaw<{ bucket: Date; action: CreditAction; spent: bigint }[]>(
      Prisma.sql`
        SELECT date_trunc(${rp.bucket}, "createdAt") AS bucket, action, sum(-amount)::bigint AS spent
        FROM "CreditLog"
        WHERE amount < 0 ${sinceClause} ${notAdmin}
        GROUP BY 1, 2
        ORDER BY 1
      `
    ),
    prisma.creditLog.groupBy({
      by: ["action"],
      _sum: { amount: true },
      where: { amount: { lt: 0 }, ...periodWhere, ...notAdminWhere },
    }),
    prisma.$queryRaw<{ userId: string; email: string; spent: bigint }[]>(Prisma.sql`
      SELECT cl."userId" AS "userId", u.email AS email, sum(-cl.amount)::bigint AS spent
      FROM "CreditLog" cl
      JOIN "user" u ON u.id = cl."userId"
      WHERE cl.amount < 0 ${sinceClauseCl} ${notAdminCl}
      GROUP BY 1, 2
      ORDER BY spent DESC
      LIMIT 10
    `),
    prisma.creditLog.aggregate({
      _sum: { amount: true },
      where: { action: "ADMIN_GRANT", amount: { gt: 0 }, ...periodWhere },
    }),
    // Начисления баланса (amount > 0), по типам — покупки / гранты / бонусы.
    prisma.creditLog.groupBy({
      by: ["action"],
      _sum: { amount: true },
      where: { amount: { gt: 0 }, ...periodWhere, ...notAdminWhere },
    }),
  ]);

  // Pivot series into { date, <action>: spent }
  const spendActionsSet = new Set<CreditAction>();
  const byDate = new Map<string, CreditsSeriesPoint>();
  for (const row of seriesRows) {
    spendActionsSet.add(row.action);
    const key = row.bucket.toISOString();
    const point = byDate.get(key) ?? { date: key };
    point[row.action] = Number(row.spent);
    byDate.set(key, point);
  }
  const spendActions = [...spendActionsSet];
  const series = [...byDate.values()].map((point) => {
    for (const action of spendActions) {
      if (point[action] === undefined) point[action] = 0;
    }
    return point;
  });

  const byAction = byActionRaw
    .map((r) => ({ action: r.action, total: -(r._sum.amount ?? 0) }))
    .sort((a, b) => b.total - a.total);
  const totalSpent = byAction.reduce((sum, r) => sum + r.total, 0);

  const topUps = topUpsRaw
    .map((r) => ({ action: r.action, total: r._sum.amount ?? 0 }))
    .sort((a, b) => b.total - a.total);
  const totalToppedUp = topUps.reduce((sum, r) => sum + r.total, 0);

  return {
    series,
    spendActions,
    byAction,
    topUps,
    topSpenders: topSpendersRows.map((r) => ({
      userId: r.userId,
      email: r.email,
      spent: Number(r.spent),
    })),
    adminGrantedTotal: adminAgg._sum.amount ?? 0,
    totalSpent,
    totalToppedUp,
  };
}

// --- Entry point -----------------------------------------------------------

export async function buildAnalytics(
  period: AnalyticsPeriod,
  now: Date = new Date()
): Promise<AnalyticsResponse> {
  const rp = resolvePeriod(period, now);
  const adminIds = await resolveAdminUserIds();
  const [users, requests, generation, credits] = await Promise.all([
    buildUsers(rp, now, adminIds),
    buildRequests(rp),
    buildGeneration(rp),
    buildCredits(rp, adminIds),
  ]);

  return {
    period,
    generatedAt: now.toISOString(),
    users,
    requests,
    generation,
    credits,
  };
}
