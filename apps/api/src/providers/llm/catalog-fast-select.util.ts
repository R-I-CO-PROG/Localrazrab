import type { CatalogIdeatorIdea, CriticOutput, CriticTopIdea } from '../../agents/contracts';
import type { AgentBriefContext } from '../../agents/brief-context.util';
import { pickDiverseCatalogIdeas } from './catalog-concept-diversity.util';
import { detectMandatoryConceptTypesFromBrief } from './concept-diversity.util';
import {
  isSimilarConceptTitle,
  normalizeConceptKey,
  type GenerationHistory,
} from '../../agents/previous-generation.util';

function normalizeText(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е');
}

function slotNotesMatchBrandColor(notes: string, color: string): boolean {
  const notesNorm = normalizeText(notes);
  const colorNorm = normalizeText(color).trim();
  if (!colorNorm || colorNorm.length < 2) return false;
  if (notesNorm.includes(colorNorm)) return true;
  if (colorNorm.startsWith('#') && notesNorm.includes(colorNorm.slice(1))) return true;
  return false;
}

function scoreBrandColorSlots(idea: CatalogIdeatorIdea, brandColors: string[]): number {
  if (!brandColors.length || !idea.productSlots?.length) return 0;
  let bonus = 0;
  for (const slot of idea.productSlots) {
    const notes = slot.notes?.trim();
    if (!notes) continue;
    for (const color of brandColors) {
      if (slotNotesMatchBrandColor(notes, color)) {
        bonus += 12;
        break;
      }
    }
  }
  return bonus;
}

function scoreCatalogIdeaForBrief(
  idea: CatalogIdeatorIdea,
  brief: AgentBriefContext,
  mandatoryTypes: string[],
  brandColors: string[],
): number {
  const briefText = normalizeText(brief.userQuery ?? '');
  const blob = normalizeText(
    `${idea.title} ${idea.composition} ${idea.style} ${idea.whyItFits ?? ''} ${idea.themeAxis ?? ''}`,
  );
  let score = 50;

  const tokens = briefText.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 4);
  for (const token of tokens) {
    if (blob.includes(token)) score += 4;
  }

  if (idea.productSlots?.length) {
    const slotTypes = new Set(idea.productSlots.map((s) => s.type));
    for (const mt of mandatoryTypes) {
      if (slotTypes.has(mt)) score += 25;
    }
    score += Math.min(idea.productSlots.length, 8) * 2;
  }

  score += scoreBrandColorSlots(idea, brandColors);

  // Материал ВСЕГО набора («полностью кожаный») — жёсткое требование (см. requiredMaterial в
  // AgentBriefContext). Реальный фильтр товаров — в neuralSelector; здесь — бонус/штраф, чтобы
  // идеи, УЖЕ упоминающие материал в тексте (Ideator должен был отразить его в notes по промпту),
  // ранжировались выше идей, которые его проигнорировали.
  const requiredMaterial = brief.requiredMaterial?.trim().toLowerCase();
  if (requiredMaterial) {
    if (blob.includes(requiredMaterial)) score += 30;
    else score -= 20;
  }

  if (idea.whyItFits?.trim()) score += 8;
  if (idea.themeAxis?.trim()) score += 5;

  const forbidden = (brief.forbiddenItems ?? []).map((s) => s.toLowerCase());
  for (const f of forbidden) {
    if (f.length > 2 && blob.includes(f)) score -= 40;
  }

  return score;
}

function ideaHasMandatoryType(
  title: string,
  mandatoryType: string,
  byTitle: Map<string, CatalogIdeatorIdea>,
): boolean {
  const full = byTitle.get(title);
  return Boolean(full?.productSlots?.some((s) => s.type === mandatoryType));
}

function enforceMandatoryTypeCoverage<T extends { title: string; score: number }>(
  top: T[],
  ranked: T[],
  byTitle: Map<string, CatalogIdeatorIdea>,
  mandatoryTypes: string[],
  limit: number,
): T[] {
  const result = [...top];
  const inTop = () => new Set(result.map((t) => t.title));
  const minCoverage = Math.min(3, limit);

  const countWithType = (items: T[], mandatoryType: string) =>
    items.filter((item) => ideaHasMandatoryType(item.title, mandatoryType, byTitle)).length;

  for (const mandatoryType of mandatoryTypes) {
    let coverage = countWithType(result, mandatoryType);
    if (coverage >= minCoverage) continue;

    const topSet = inTop();
    const candidates = ranked.filter(
      (r) =>
        !topSet.has(r.title) &&
        ideaHasMandatoryType(r.title, mandatoryType, byTitle),
    );

    for (const candidate of candidates) {
      if (coverage >= minCoverage) break;

      const lacking = result
        .map((item, idx) => ({ item, idx }))
        .filter(({ item }) => !ideaHasMandatoryType(item.title, mandatoryType, byTitle));

      if (!lacking.length) break;

      const worst = lacking.reduce((a, b) => (a.item.score <= b.item.score ? a : b));
      if (candidate.score <= worst.item.score) continue;

      result[worst.idx] = candidate;
      coverage = countWithType(result, mandatoryType);
    }
  }

  return result;
}

/**
 * Желаемое распределение по смелости (boldness) для N концепций.
 * Базовое требование: 1 стандартный (0) + N-2 интересных (1) + 1 смелый (2).
 * Для N=5 → {0:1, 1:3, 2:1}. Для N<3 — без распределения (просто топ).
 */
function boldnessQuota(limit: number): { 0: number; 1: number; 2: number } | null {
  if (limit < 3) return null;
  return { 0: 1, 1: limit - 2, 2: 1 };
}

/**
 * Из уже-разнообразного пула (score-ordered, дедуп) собирает спред по boldness.
 *
 * ВАЖНО: вниз по пайплайну реально показываются только первые `displayCount`
 * наборов (CATALOG_TARGET_CONCEPTS), а возвращаем мы `limit` (CRITIC_TOP_N — буфер
 * на отсев). Поэтому распределение 1 стандарт + (displayCount-2) интересных + 1 смелый
 * строится на ПЕРВЫЕ `displayCount` позиций, а остаток идёт буфером в конце.
 */
function selectByBoldnessSpread<T extends { title: string; score: number }>(
  pool: T[],
  byTitle: Map<string, CatalogIdeatorIdea>,
  limit: number,
  displayCount: number,
): T[] {
  const quota = boldnessQuota(displayCount);
  if (!quota || pool.length <= displayCount) return pool.slice(0, limit);

  const boldnessOf = (item: T): 0 | 1 | 2 => {
    const raw = byTitle.get(item.title)?.boldness;
    const n = Math.max(0, Math.min(2, Math.round(Number(raw ?? 1))));
    return (Number.isFinite(n) ? n : 1) as 0 | 1 | 2;
  };

  const buckets: Record<0 | 1 | 2, T[]> = { 0: [], 1: [], 2: [] };
  for (const item of pool) buckets[boldnessOf(item)].push(item);

  const primary: T[] = [];
  const usedTitles = new Set<string>();
  const take = (item: T, into: T[]) => {
    if (usedTitles.has(item.title)) return;
    into.push(item);
    usedTitles.add(item.title);
  };

  // 1) Заполняем квоты по уровням для ПОКАЗЫВАЕМЫХ наборов (пул отсортирован по score).
  for (const level of [0, 1, 2] as const) {
    let need = quota[level];
    for (const item of buckets[level]) {
      if (need <= 0) break;
      if (usedTitles.has(item.title)) continue;
      take(item, primary);
      need--;
    }
  }
  // 2) Недобор квоты (например, не было смелых) — добираем лучшими по score.
  if (primary.length < displayCount) {
    for (const item of pool) {
      if (primary.length >= displayCount) break;
      take(item, primary);
    }
  }

  // 3) Порядок показываемых: стандартные → интересные → смелый («отдельно», в конце),
  //    но все они внутри первых displayCount — значит гарантированно дойдут до показа.
  const order: Record<0 | 1 | 2, number> = { 0: 0, 1: 1, 2: 2 };
  primary.sort((a, b) => order[boldnessOf(a)] - order[boldnessOf(b)] || b.score - a.score);

  // 4) Буфер на отсев — остаток пула по score, добиваем до limit.
  const buffer: T[] = [];
  for (const item of pool) {
    if (primary.length + buffer.length >= limit) break;
    take(item, buffer);
  }
  return [...primary, ...buffer];
}

/** Быстрый отбор top-N без второго LLM-вызова (Critic). */
export function pickTopCatalogIdeasLocally(
  ideas: CatalogIdeatorIdea[],
  brief: AgentBriefContext,
  limit: number,
  generationHistory?: GenerationHistory | null,
  displayCount: number = limit,
): CriticOutput {
  const mandatoryTypes = detectMandatoryConceptTypesFromBrief(brief.userQuery ?? '');
  const brandColors = brief.colors ?? [];
  const byTitle = new Map(ideas.map((i) => [i.title, i]));
  const blockedTitles = generationHistory?.conceptTitles ?? [];
  const blockedAxes = new Set(
    (generationHistory?.themeAxes ?? []).map((a) => normalizeConceptKey(a)),
  );

  const ranked = ideas
    .map((idea) => {
      let score = scoreCatalogIdeaForBrief(idea, brief, mandatoryTypes, brandColors);
      if (blockedTitles.some((t) => isSimilarConceptTitle(t, idea.title))) score -= 250;
      const axis = normalizeConceptKey(idea.themeAxis ?? '');
      if (axis && blockedAxes.has(axis)) score -= 120;
      return {
        title: idea.title,
        score,
        briefFitScore: score,
        conceptSummary: [idea.composition, idea.whyItFits].filter(Boolean).join(' ').slice(0, 500),
        reasons: [idea.whyItFits || 'Соответствует брифу и структуре набора'],
        risks: [] as string[],
        suggestedEdits: [] as string[],
      };
    })
    .sort((a, b) => b.score - a.score);

  // Берём разнообразный пул крупнее лимита, чтобы из него собрать спред по boldness.
  const diversePool = pickDiverseCatalogIdeas(
    ranked,
    byTitle,
    Math.max(limit * 3, limit + 6),
    generationHistory,
  );
  const spread = selectByBoldnessSpread(diversePool, byTitle, limit, displayCount);
  const covered = enforceMandatoryTypeCoverage(spread, ranked, byTitle, mandatoryTypes, limit);
  // Покрытие обязательных типов может выбить смелый/стандартный набор из показываемых —
  // восстанавливаем якоря в пределах первых displayCount, чтобы итог гарантированно был
  // 1 стандарт + … + 1 смелый. Источник кандидатов — полный ranked (а не diversePool):
  // фильтр разнообразия мог отбросить смелые идеи с похожим набором типов.
  const top = ensureBoldnessAnchors(covered, ranked, byTitle, displayCount);
  return { topIdeas: top as CriticTopIdea[] };
}

/**
 * Гарантирует, что среди ПОКАЗЫВАЕМЫХ (первых `displayCount`) наборов есть ≥1
 * стандартный (boldness 0) и ≥1 смелый (boldness 2). Если их выбило покрытие
 * обязательных типов — возвращаем, заменяя самый слабый «интересный» (boldness 1).
 * Буфер за пределами displayCount не трогаем (он лишь резерв на отсев).
 */
function ensureBoldnessAnchors<T extends { title: string; score: number }>(
  top: T[],
  pool: T[],
  byTitle: Map<string, CatalogIdeatorIdea>,
  displayCount: number,
): T[] {
  if (displayCount < 3) return top;
  const boldnessOf = (item: T): 0 | 1 | 2 => {
    const n = Math.max(0, Math.min(2, Math.round(Number(byTitle.get(item.title)?.boldness ?? 1))));
    return (Number.isFinite(n) ? n : 1) as 0 | 1 | 2;
  };
  const shown = top.slice(0, displayCount);
  const buffer = top.slice(displayCount);
  const allTitles = new Set(top.map((t) => t.title));

  const restore = (level: 0 | 2) => {
    if (shown.some((t) => boldnessOf(t) === level)) return;
    const candidate = pool
      .filter((p) => boldnessOf(p) === level && !allTitles.has(p.title))
      .sort((a, b) => b.score - a.score)[0];
    if (!candidate) return;
    // Заменяем самый слабый «интересный» (boldness 1) среди показываемых.
    const replaceable = shown
      .map((item, idx) => ({ item, idx, b: boldnessOf(item) }))
      .filter(({ b }) => b === 1);
    const pickList = replaceable.length
      ? replaceable
      : shown
          .map((item, idx) => ({ item, idx, b: boldnessOf(item) }))
          .filter(({ b }) => shown.filter((r) => boldnessOf(r) === b).length > 1);
    if (!pickList.length) return;
    const worst = pickList.reduce((a, b) => (a.item.score <= b.item.score ? a : b));
    allTitles.add(candidate.title);
    allTitles.delete(shown[worst.idx]!.title);
    shown[worst.idx] = candidate;
  };

  restore(0);
  restore(2);

  // Порядок показываемых: стандартные → интересные → смелый («отдельно», в конце).
  const order: Record<0 | 1 | 2, number> = { 0: 0, 1: 1, 2: 2 };
  shown.sort((a, b) => order[boldnessOf(a)] - order[boldnessOf(b)] || b.score - a.score);
  return [...shown, ...buffer];
}
