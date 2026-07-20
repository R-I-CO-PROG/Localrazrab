/**
 * admin-tester.ts — прогон подбора для /admin/tester.
 *
 * Порт сути из локального ночного тестера (mercai-tester/night/night-server.mjs):
 * гоняет бриф через прод-пайплайн NestJS (теми же HTTP-эндпоинтами, что фронт),
 * проверяет результат rule-правилами + LLM-судьёй, считает балл и пишет в Prisma
 * (модель TesterRun). Без локальных файлов, авто-фиксера и управления процессом.
 */

import { prisma } from "@/lib/prisma";
import { openRouterChatJson, isOpenRouterEnabled } from "@/lib/openrouter-client";
import type { AgentRunState } from "@/lib/agent-types";

// ── Конфиг NestJS API (как в suvenir-server.ts) ─────────────────────────────
const API_URL =
  process.env.SUVENIR_API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const API_SECRET = process.env.API_SECRET_KEY?.trim() ?? "";
const JUDGE_MODEL = process.env.TESTER_JUDGE_MODEL || "google/gemini-2.5-flash";
const POLL_SECONDS = Number(process.env.TESTER_POLL_SECONDS || 120);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Типы ─────────────────────────────────────────────────────────────────────
export interface Brief {
  prompt: string;
  budgetMin: number;
  budgetMax: number;
  minProductsPerSet: number;
  maxProductsPerSet: number;
  quantity?: number;
  colors?: string[];
  allowedItems?: string[];
  forbidden?: string[];
}

export interface RunProduct {
  id: string | null;
  name: string;
  category: string;
  subcategory: string | null;
  price: number | null;
  color: string | null;
  url: string | null;
  image: string | null;
}

export interface RunConcept {
  title: string;
  boldness?: number;
  composition: string;
  sum: number;
  products: RunProduct[];
}

export type Severity = "high" | "med" | "low";

export interface Problem {
  sev: Severity;
  cat: string;
  text: string;
  set?: string;
  src: "rule" | "llm";
}

export interface JudgeResult {
  score?: number;
  summary?: string;
  problems?: Array<{ sev: Severity; cat: string; set?: string; text: string }>;
  error?: string;
}

export interface RunResult {
  ts: string;
  ok: boolean;
  brief: Brief;
  id?: string;
  elapsed?: number;
  status?: string;
  concepts?: RunConcept[];
  judge?: JudgeResult | null;
  score?: number;
  problems?: Problem[];
  error?: string;
}

// ── Пул брифов (как в night-server) ───────────────────────────────────────────
export const BRIEFS: Brief[] = [
  { prompt: "подарки для IT-команды разработчиков, 20 человек", budgetMin: 800, budgetMax: 3000, minProductsPerSet: 3, maxProductsPerSet: 5, allowedItems: ["Термосы и бутылки", "Электроника"], forbidden: ["Одежда"] },
  { prompt: "новогодние подарки клиентам банка, премиум", budgetMin: 3000, budgetMax: 8000, minProductsPerSet: 3, maxProductsPerSet: 5, colors: ["тёмно-синий", "серебро"], allowedItems: ["Кошельки и монетницы", "Термосы и бутылки"] },
  { prompt: "эко-наборы для конференции по устойчивому развитию", budgetMin: 500, budgetMax: 2000, minProductsPerSet: 3, maxProductsPerSet: 4, forbidden: ["Электроника"] },
  { prompt: "welcome pack для новых сотрудников стартапа", budgetMin: 1000, budgetMax: 3500, minProductsPerSet: 3, maxProductsPerSet: 5 },
  { prompt: "подарки болельщикам на спортивный корпоратив", budgetMin: 700, budgetMax: 2500, minProductsPerSet: 3, maxProductsPerSet: 5 },
  { prompt: "тёплые зимние наборы для сотрудников на удалёнке", budgetMin: 1200, budgetMax: 4000, minProductsPerSet: 3, maxProductsPerSet: 5 },
  { prompt: "подарки врачам на день медицинского работника", budgetMin: 800, budgetMax: 3000, minProductsPerSet: 3, maxProductsPerSet: 4 },
  { prompt: "яркие наборы для студенческого фестиваля", budgetMin: 400, budgetMax: 1500, minProductsPerSet: 3, maxProductsPerSet: 4 },
  { prompt: "подарки инвесторам на закрытие раунда, luxury", budgetMin: 5000, budgetMax: 15000, minProductsPerSet: 3, maxProductsPerSet: 5 },
  { prompt: "наборы для пикника и активного отдыха компании", budgetMin: 1000, budgetMax: 3500, minProductsPerSet: 3, maxProductsPerSet: 5 },
  { prompt: "подарки на 8 марта женщинам-коллегам", budgetMin: 700, budgetMax: 2500, minProductsPerSet: 3, maxProductsPerSet: 4 },
  { prompt: "мерч для участников хакатона, технологичный стиль", budgetMin: 600, budgetMax: 2000, minProductsPerSet: 3, maxProductsPerSet: 5 },
  { prompt: "подарочные наборы партнёрам логистической компании", budgetMin: 1500, budgetMax: 4500, minProductsPerSet: 3, maxProductsPerSet: 5 },
  { prompt: "наборы для онбординга менеджеров по продажам", budgetMin: 1000, budgetMax: 3000, minProductsPerSet: 3, maxProductsPerSet: 5 },
  { prompt: "эко-подарки для детского образовательного проекта", budgetMin: 500, budgetMax: 1800, minProductsPerSet: 3, maxProductsPerSet: 4 },
  { prompt: "премиальные наборы для топ-менеджмента к юбилею", budgetMin: 4000, budgetMax: 10000, minProductsPerSet: 3, maxProductsPerSet: 5, colors: ["чёрный", "золото"] },
  { prompt: "подарки для команды дизайнеров, креативно", budgetMin: 900, budgetMax: 3000, minProductsPerSet: 3, maxProductsPerSet: 5 },
  { prompt: "наборы для выставки, недорого, много участников", budgetMin: 300, budgetMax: 1000, minProductsPerSet: 3, maxProductsPerSet: 4 },
  { prompt: "подарки для автодилерского центра клиентам", budgetMin: 1500, budgetMax: 5000, minProductsPerSet: 3, maxProductsPerSet: 5 },
  { prompt: "фитнес-наборы для wellness-программы сотрудников", budgetMin: 1000, budgetMax: 3500, minProductsPerSet: 3, maxProductsPerSet: 5 },
];

// ── Минимальный HTTP-клиент к NestJS ──────────────────────────────────────────
function apiHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(API_SECRET ? { "X-API-Key": API_SECRET } : {}),
  };
}

interface MFetchResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
  text: string;
}

async function mfetch(
  method: string,
  path: string,
  body?: unknown,
  { timeoutMs = 25000, retries = 2 }: { timeoutMs?: number; retries?: number } = {},
): Promise<MFetchResult> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${API_URL}${path}`, {
        method,
        headers: apiHeaders(),
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      const text = await res.text();
      let data: Record<string, unknown> | null = null;
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        /* не-JSON ответ — оставляем data=null */
      }
      return { ok: res.ok, status: res.status, data, text };
    } catch (e) {
      lastErr = e;
      await sleep(800 * (attempt + 1));
    }
  }
  throw lastErr;
}

const DONE = ["awaiting_idea_selection", "idea_selected", "completed", "done", "success", "finished", "ready"];

interface FullRequest {
  id: string;
  status: string;
  elapsed: number;
  request: { agentRun?: AgentRunState | null } & Record<string, unknown>;
}

async function runBriefOnMercai(brief: Brief): Promise<FullRequest> {
  const create = await mfetch("POST", "/requests", { userPrompt: brief.prompt, prompt: brief.prompt });
  const id = create.data?.id as string | undefined;
  if (!id) throw new Error(`create failed: ${create.status} ${create.text?.slice(0, 120)}`);

  await mfetch("PATCH", `/requests/${id}`, {
    userPrompt: brief.prompt,
    quantity: brief.quantity ?? 20,
    budgetMin: brief.budgetMin,
    budgetMax: brief.budgetMax,
    colors: brief.colors ?? [],
    allowedItems: brief.allowedItems ?? [],
    forbiddenItems: brief.forbidden ?? [],
    minProductsPerSet: brief.minProductsPerSet,
    maxProductsPerSet: brief.maxProductsPerSet,
    useProductCountLimit: true,
    aiStyle: "catalog",
    mode: "concepts",
  });
  await mfetch("POST", `/requests/${id}/submit`, {});

  const t0 = Date.now();
  await mfetch("POST", `/requests/${id}/agent-run`, { aiStyle: "catalog", mode: "concepts", debug: true });

  const deadline = Date.now() + POLL_SECONDS * 1000;
  let status = "running";
  while (Date.now() < deadline) {
    await sleep(3000);
    const poll = await mfetch("GET", `/requests/${id}/agent-run`);
    status = (poll.data?.status as string) || status;
    if (DONE.includes(status)) break;
    if (status === "failed") {
      throw new Error(`agent-run failed: ${String(poll.data?.error ?? "")}`.slice(0, 200));
    }
  }
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const full = await mfetch("GET", `/requests/${id}`);
  return { id, status, elapsed, request: (full.data ?? {}) as FullRequest["request"] };
}

// ── Извлечение концепций ──────────────────────────────────────────────────────
function extractConcepts(request: FullRequest["request"]): RunConcept[] {
  const agentRun = request?.agentRun;
  const ideatorOutput = (agentRun?.ideatorOutput ?? {}) as {
    ideas?: Array<{ title: string; boldness?: number }>;
  };
  const ideas = ideatorOutput.ideas ?? [];
  const bmap = new Map(ideas.map((i) => [i.title, i.boldness]));
  const cs = agentRun?.conceptsOutput ?? [];
  return cs.map((c) => {
    // Каст к гибкой форме: набор полей catalogProducts отличается между версиями.
    const rawProducts = (c.catalogProducts ?? []) as Array<{
      id?: string | null;
      name?: string;
      category?: string;
      subcategory?: string | null;
      price?: number | null;
      colors?: string[];
      targetColor?: string | null;
      catalogImageUrl?: string | null;
      imageUrl?: string | null;
      sourceUrl?: string | null;
    }>;
    const products: RunProduct[] = rawProducts.map((p) => ({
      id: p.id ?? null,
      name: p.name ?? "",
      category: p.category ?? "",
      subcategory: p.subcategory ?? null,
      price: p.price ?? null,
      color: p.targetColor ?? (Array.isArray(p.colors) ? p.colors[0] : null) ?? null,
      url: p.sourceUrl ?? null,
      image: p.catalogImageUrl ?? p.imageUrl ?? null,
    }));
    return {
      title: c.title,
      boldness: bmap.get(c.title),
      composition: c.narrative || c.description || "",
      sum: products.reduce((s, p) => s + (Number(p.price) || 0), 0),
      products,
    };
  });
}

// ── Rule-проверки (объективные) ───────────────────────────────────────────────
type RuleProblem = Omit<Problem, "src">;

function ruleChecks(brief: Brief, concepts: RunConcept[]): RuleProblem[] {
  const problems: RuleProblem[] = [];
  if (concepts.length === 0) {
    problems.push({ sev: "high", cat: "empty", text: "Не сгенерировано ни одной концепции" });
    return problems;
  }
  if (concepts.length < 5) {
    problems.push({ sev: "med", cat: "count", text: `Концепций ${concepts.length}, ожидалось 5` });
  }

  // распределение boldness 1+3+1
  const dist: Record<number, number> = { 0: 0, 1: 0, 2: 0 };
  concepts.forEach((c) => {
    if (c.boldness != null && c.boldness in dist) dist[c.boldness]++;
  });
  if (dist[0] < 1) problems.push({ sev: "med", cat: "boldness", text: `Нет стандартного набора (boldness 0). Распределение: ${JSON.stringify(dist)}` });
  if (dist[2] < 1) problems.push({ sev: "med", cat: "boldness", text: `Нет смелого набора (boldness 2). Распределение: ${JSON.stringify(dist)}` });

  const allSkus: Array<string | null> = [];
  concepts.forEach((c, i) => {
    const n = c.products.length;
    if (n === 0) problems.push({ sev: "high", cat: "empty-set", text: `Набор #${i + 1} «${c.title}» пустой` });
    else if (n < (brief.minProductsPerSet || 3)) problems.push({ sev: "med", cat: "count", text: `Набор #${i + 1} «${c.title}»: ${n} товаров (< ${brief.minProductsPerSet})` });

    const sum = c.products.reduce((s, p) => s + (Number(p.price) || 0), 0);
    if (brief.budgetMax && sum > brief.budgetMax * 1.15) {
      problems.push({ sev: "med", cat: "budget", text: `Набор #${i + 1} «${c.title}»: сумма ${Math.round(sum)}₽ > бюджета ${brief.budgetMax}₽` });
    }

    const cats = c.products.map((p) => p.category);
    const dup = cats.filter((x, idx) => x && cats.indexOf(x) !== idx);
    if (dup.length) problems.push({ sev: "low", cat: "role-dup", text: `Набор #${i + 1} «${c.title}»: повтор категории ${[...new Set(dup)].join(", ")}` });

    c.products.forEach((p) => allSkus.push(p.id));
  });

  // дубли SKU между наборами
  const dupSku = allSkus.filter((x, idx) => x && allSkus.indexOf(x) !== idx);
  if (dupSku.length) problems.push({ sev: "high", cat: "sku-dup", text: `Повтор одного товара в разных наборах (${[...new Set(dupSku)].length} SKU)` });

  // дубли базы товара (даже другого цвета)
  const baseRe = /\b(черн\w*|бел\w*|сер\w*|красн\w*|син\w*|голуб\w*|зелен\w*|желт\w*|оранж\w*|розов\w*|фиолет\w*|коричн\w*|бежев\w*|прозрачн\w*|серебр\w*|золот\w*)\b/giu;
  const baseKey = (s: string) =>
    String(s || "")
      .toLowerCase()
      .replace(baseRe, " ")
      .replace(/[«»"(),.\/+\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  const bases: string[] = [];
  for (const c of concepts) for (const p of c.products) bases.push(baseKey(p.name));
  const dupBase = bases.filter((x, idx) => x && bases.indexOf(x) !== idx);
  if (dupBase.length) problems.push({ sev: "high", cat: "base-dup", text: `Повтор товара (даже др. цвета) в концепции: ${[...new Set(dupBase)].length}` });

  // СТРУКТУРНАЯ ПОХОЖЕСТЬ наборов: «в каждом есть из чего пить + рюкзак + ручка» = клоны.
  // Грубые функциональные семейства по имени; считаем (а) семейство в ≥4 из 5 наборов,
  // (б) попарную Jaccard-похожесть сигнатур семейств.
  const FAMILY_RULES: Array<[string, RegExp]> = [
    ["drink", /круж|термос|термокруж|бутыл|стакан|tumbler|фляж/i],
    ["carry", /рюкзак|сумк|шоппер|портфел|несессер|авоськ/i],
    ["write", /ручк|карандаш|роллер|перьев/i],
    ["paper", /блокнот|ежедневник|планинг|тетрад/i],
    ["power", /повербанк|аккумулятор|заряд|power\s*bank/i],
    ["usb", /флеш|usb.*накопит|флэш/i],
    ["textile", /плед|полотенц|подушк|носк|шарф/i],
    ["light", /ночник|светильник|ламп|фонар/i],
    ["umbrella", /зонт/i],
    ["audio", /колонк|наушник/i],
  ];
  const famOf = (name: string): string | null =>
    FAMILY_RULES.find(([, re]) => re.test(name))?.[0] ?? null;
  if (concepts.length >= 3) {
    const sigs = concepts.map(
      (c) => new Set(c.products.map((p) => famOf(p.name)).filter(Boolean) as string[]),
    );
    // (а) семейство в ≥4 наборах
    const famCount = new Map<string, number>();
    for (const s of sigs) for (const f of s) famCount.set(f, (famCount.get(f) ?? 0) + 1);
    const overused = [...famCount.entries()].filter(([, n]) => n >= 4).map(([f]) => f);
    if (overused.length) {
      problems.push({
        sev: overused.length >= 2 ? "high" : "med",
        cat: "similarity",
        text: `Однотипный костяк: семейств${overused.length > 1 ? "а" : "о"} [${overused.join(", ")}] в ${Math.max(...overused.map((f) => famCount.get(f) ?? 0))} из ${concepts.length} наборов — концепции не различаются структурно`,
      });
    }
    // (б) средняя попарная Jaccard-похожесть сигнатур
    let simSum = 0;
    let pairs = 0;
    for (let a = 0; a < sigs.length; a++)
      for (let b = a + 1; b < sigs.length; b++) {
        const inter = [...sigs[a]].filter((f) => sigs[b].has(f)).length;
        const uni = new Set([...sigs[a], ...sigs[b]]).size || 1;
        simSum += inter / uni;
        pairs++;
      }
    const avgSim = pairs ? simSum / pairs : 0;
    if (avgSim >= 0.6) {
      problems.push({
        sev: "med",
        cat: "similarity",
        text: `Наборы структурно похожи (ср. пересечение семейств ${(avgSim * 100).toFixed(0)}%) — нужны в корне разные концепции`,
      });
    }
  }

  // запрещённые категории
  const forb = (brief.forbidden ?? []).map((s) => String(s).toLowerCase());
  if (forb.length) {
    const hits: string[] = [];
    for (const c of concepts)
      for (const p of c.products) {
        const hay = `${p.category} ${p.subcategory ?? ""} ${p.name}`.toLowerCase();
        if (forb.some((f) => f.length >= 3 && hay.includes(f))) hits.push(p.name);
      }
    if (hits.length) problems.push({ sev: "high", cat: "forbidden-cat", text: `Запрещённые категории в наборах: ${hits.slice(0, 3).join("; ")}` });
  }

  // нужные категории должны использоваться
  const allow = (brief.allowedItems ?? []).map((s) => String(s).toLowerCase());
  if (allow.length) {
    let used = 0;
    for (const c of concepts)
      for (const p of c.products) {
        const hay = `${p.category} ${p.subcategory ?? ""} ${p.name}`.toLowerCase();
        if (allow.some((a) => a.length >= 3 && hay.includes(a))) used++;
      }
    if (used === 0) problems.push({ sev: "high", cat: "allowed-ignored", text: `Польз. категории (${allow.join(", ")}) НЕ использованы ни в одном наборе` });
  }

  return problems;
}

// ── LLM-судья ──────────────────────────────────────────────────────────────────
const JUDGE_SYSTEM = `Ты — опытный менеджер по корпоративным подаркам с 10-летним стажем, который ВСЕГДА держит в голове бриф клиента.
Тебе дают бриф и 5 готовых наборов с реальными товарами. Оцени КАК ЭКСПЕРТ, который сам бы это собирал.

Верни ТОЛЬКО валидный JSON (без markdown):
{"score": 0-100, "summary": "...", "problems": [{"sev":"high|med|low","cat":"relevance|coherence|product-choice|budget|variety|repetition","set":"номер или 'все'","text":"конкретно что не так и почему"}]}

Критерии (думай как профи):
- relevance: товары реально подходят ИМЕННО под этот бриф (аудитория, повод, отрасль)? Не «общий офисный шаблон».
- product-choice: для каждой роли выбран САМЫЙ подходящий товар из возможных, а не случайный?
- coherence: товары внутри набора сочетаются в одну историю (не «рандомная свалка»)?
- variety: 5 наборов реально разные (1 стандартный, 3 интересных, 1 смелый), а не клоны?
- budget: укладывается в бюджет, нет дешёвки в премиуме и наоборот.
- repetition: нет навязчивых повторов между наборами.

score: 90+ = как от лучшего менеджера; 70-89 = хорошо, мелочи; 50-69 = заметные проблемы; <50 = плохо.
Будь придирчивым и КОНКРЕТНЫМ — называй товары и наборы.`;

async function judgeWithLlm(brief: Brief, concepts: RunConcept[]): Promise<JudgeResult | null> {
  if (!isOpenRouterEnabled()) return null;
  const payload = {
    brief: { задача: brief.prompt, бюджет_набора: `${brief.budgetMin}-${brief.budgetMax}₽`, цвета: brief.colors ?? [] },
    наборы: concepts.map((c, i) => ({
      номер: i + 1,
      название: c.title,
      смелость: c.boldness,
      товары: c.products.map((p) => `${p.name} (${p.category}, ${p.price}₽)`),
    })),
  };
  try {
    const content = await openRouterChatJson({
      systemPrompt: JUDGE_SYSTEM,
      userMessage: JSON.stringify(payload),
      model: JUDGE_MODEL,
      temperature: 0.3,
      maxTokens: 1500,
    });
    const clean = content.replace(/```json\s*|\s*```/g, "").trim();
    const m = clean.match(/\{[\s\S]*\}/);
    return m ? (JSON.parse(m[0]) as JudgeResult) : null;
  } catch (e) {
    return { error: String(e).slice(0, 120) };
  }
}

// ── Один прогон ────────────────────────────────────────────────────────────────
async function doOneRun(brief: Brief): Promise<RunResult> {
  const result: RunResult = { ts: new Date().toISOString(), brief, ok: false };
  try {
    const run = await runBriefOnMercai(brief);
    const concepts = extractConcepts(run.request);
    const rules = ruleChecks(brief, concepts);
    const judge = await judgeWithLlm(brief, concepts);
    const judgeScore = typeof judge?.score === "number" ? judge.score : null;
    const penalty = rules.reduce((s, p) => s + (p.sev === "high" ? 12 : p.sev === "med" ? 6 : 2), 0);
    const score = judgeScore != null ? Math.max(0, judgeScore - penalty) : Math.max(0, 75 - penalty);
    const problems: Problem[] = [
      ...rules.map((p) => ({ ...p, src: "rule" as const })),
      ...((judge?.problems ?? []).map((p) => ({ ...p, src: "llm" as const }))),
    ];
    Object.assign(result, {
      ok: true,
      id: run.id,
      elapsed: run.elapsed,
      status: run.status,
      concepts,
      judge,
      score,
      problems,
    });
  } catch (e) {
    result.ok = false;
    result.error = String(e instanceof Error ? e.message : e).slice(0, 300);
  }
  return result;
}

async function persist(result: RunResult): Promise<void> {
  await prisma.testerRun.create({
    data: {
      ok: result.ok,
      score: result.score ?? null,
      elapsedSec: result.elapsed ?? null,
      prompt: result.brief.prompt,
      problemCount: result.problems?.length ?? 0,
      error: result.error ?? null,
      result: result as unknown as object,
    },
  });
}

// ── Запуск батча (с защитой от параллельного запуска) ────────────────────────
let running = false;

export function isRunning(): boolean {
  return running;
}

export const MAX_BATCH = 2;

export interface BatchSummary {
  ran: number;
  ok: number;
  failed: number;
  avgScore: number | null;
  results: Array<{ ok: boolean; score: number | null; prompt: string; problemCount: number; error?: string }>;
}

/** Запускает count прогонов (count уже должен быть в [1, MAX_BATCH]) последовательно. */
export async function runBatch(count: number): Promise<BatchSummary> {
  running = true;
  const results: RunResult[] = [];
  try {
    for (let i = 0; i < count; i++) {
      const brief = BRIEFS[Math.floor(((i + 1) / (count + 1)) * BRIEFS.length) % BRIEFS.length];
      const r = await doOneRun(brief);
      await persist(r);
      results.push(r);
    }
  } finally {
    running = false;
  }
  const ok = results.filter((r) => r.ok);
  const avg = ok.length ? Math.round(ok.reduce((s, r) => s + (r.score ?? 0), 0) / ok.length) : null;
  return {
    ran: results.length,
    ok: ok.length,
    failed: results.length - ok.length,
    avgScore: avg,
    results: results.map((r) => ({
      ok: r.ok,
      score: r.score ?? null,
      prompt: r.brief.prompt,
      problemCount: r.problems?.length ?? 0,
      error: r.error,
    })),
  };
}

// ── Агрегаты для дашборда ──────────────────────────────────────────────────────
const RECENT_LIMIT = 50;
const AGG_LIMIT = 500;

export interface TesterState {
  generatedAt: string;
  running: boolean;
  judgeEnabled: boolean;
  totals: { runs: number; okRuns: number; failRuns: number; avgScore: number; problemsTotal: number; avgElapsed: number };
  sevCounts: Record<Severity, number>;
  byCategory: Array<{ cat: string; count: number }>;
  scoreTrend: Array<{ date: string; count: number }>;
  recent: Array<{
    id: string;
    ts: string;
    ok: boolean;
    score: number | null;
    elapsed: number | null;
    prompt: string;
    problemCount: number;
    summary: string;
  }>;
}

export interface RunDetail {
  id: string;
  ts: string;
  ok: boolean;
  score: number | null;
  elapsed: number | null;
  prompt: string;
  brief: Brief | null;
  concepts: RunConcept[];
  problems: Problem[];
  judge: JudgeResult | null;
  error: string | null;
}

export async function buildState(): Promise<TesterState> {
  const rows = await prisma.testerRun.findMany({
    orderBy: { createdAt: "desc" },
    take: AGG_LIMIT,
  });

  const ok = rows.filter((r) => r.ok);
  const scoreSum = ok.reduce((s, r) => s + (r.score ?? 0), 0);
  const elapsedSum = ok.reduce((s, r) => s + (r.elapsedSec ?? 0), 0);

  const sevCounts: Record<Severity, number> = { high: 0, med: 0, low: 0 };
  const catMap = new Map<string, number>();
  for (const r of ok) {
    const res = r.result as unknown as RunResult;
    for (const p of res?.problems ?? []) {
      if (p.sev in sevCounts) sevCounts[p.sev]++;
      catMap.set(p.cat, (catMap.get(p.cat) ?? 0) + 1);
    }
  }
  const problemsTotal = sevCounts.high + sevCounts.med + sevCounts.low;
  const byCategory = [...catMap.entries()]
    .map(([cat, count]) => ({ cat, count }))
    .sort((a, b) => b.count - a.count);

  // тренд баллов — последние 60 успешных в хронологическом порядке
  const scoreTrend = [...ok]
    .reverse()
    .slice(-60)
    .map((r) => ({ date: r.createdAt.toISOString(), count: r.score ?? 0 }));

  const recent = rows.slice(0, RECENT_LIMIT).map((r) => {
    const res = r.result as unknown as RunResult;
    return {
      id: r.id,
      ts: r.createdAt.toISOString(),
      ok: r.ok,
      score: r.score,
      elapsed: r.elapsedSec,
      prompt: r.prompt,
      problemCount: r.problemCount,
      summary: res?.judge?.summary ?? r.error ?? "",
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    running,
    judgeEnabled: isOpenRouterEnabled(),
    totals: {
      runs: rows.length,
      okRuns: ok.length,
      failRuns: rows.length - ok.length,
      avgScore: ok.length ? Math.round(scoreSum / ok.length) : 0,
      problemsTotal,
      avgElapsed: ok.length ? Math.round(elapsedSum / ok.length) : 0,
    },
    sevCounts,
    byCategory,
    scoreTrend,
    recent,
  };
}

export async function getRunDetail(id: string): Promise<RunDetail | null> {
  const row = await prisma.testerRun.findUnique({ where: { id } });
  if (!row) return null;
  const res = row.result as unknown as RunResult;
  return {
    id: row.id,
    ts: row.createdAt.toISOString(),
    ok: row.ok,
    score: row.score,
    elapsed: row.elapsedSec,
    prompt: row.prompt,
    brief: res?.brief ?? null,
    concepts: res?.concepts ?? [],
    problems: res?.problems ?? [],
    judge: res?.judge ?? null,
    error: row.error,
  };
}
