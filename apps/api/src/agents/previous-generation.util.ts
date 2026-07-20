import { productVariantKey } from '../providers/llm/catalog-variant.util';
import type { CatalogProduct } from '../providers/llm/catalog.util';

/** Накопленная история показанных пользователю генераций по одной задаче */
export interface GenerationHistory {
  productIds: string[];
  /** Ключи SKU (без цветовых вариантов) — для блокировки при регенерации */
  productVariantKeys?: string[];
  conceptTitles: string[];
  themeAxes: string[];
  /** Сколько раз уже была успешная выдача до текущего запуска */
  generationCount: number;
}

type ConceptOutputRow = {
  title?: string;
  themeAxis?: string;
  productIds?: string[];
  catalogProducts?: Array<{ id?: string; name?: string; externalId?: string; sourceId?: string }>;
};

function variantKeyFromConceptProduct(
  p: NonNullable<ConceptOutputRow['catalogProducts']>[number],
): string | null {
  const name = typeof p?.name === 'string' ? p.name.trim() : '';
  if (!name) return null;
  return productVariantKey({
    id: typeof p?.id === 'string' ? p.id : '',
    name,
    externalId: typeof p?.externalId === 'string' ? p.externalId : undefined,
    sourceId: typeof p?.sourceId === 'string' ? p.sourceId : undefined,
  } as CatalogProduct);
}

export function extractFromConceptsOutput(conceptsOutput: unknown): {
  productIds: string[];
  productVariantKeys: string[];
  conceptTitles: string[];
  themeAxes: string[];
} {
  const productIds = new Set<string>();
  const productVariantKeys = new Set<string>();
  const conceptTitles: string[] = [];
  const themeAxes: string[] = [];

  if (!Array.isArray(conceptsOutput)) {
    return { productIds: [], productVariantKeys: [], conceptTitles, themeAxes };
  }

  for (const raw of conceptsOutput) {
    if (!raw || typeof raw !== 'object') continue;
    const row = raw as ConceptOutputRow;
    const title = String(row.title ?? '').trim();
    if (title) conceptTitles.push(title);
    const axis = String(row.themeAxis ?? '').trim();
    if (axis) themeAxes.push(axis);
    for (const id of row.productIds ?? []) {
      if (typeof id === 'string' && id.trim()) productIds.add(id.trim());
    }
    for (const p of row.catalogProducts ?? []) {
      const id = typeof p?.id === 'string' ? p.id.trim() : '';
      if (id) productIds.add(id);
      const vk = variantKeyFromConceptProduct(p);
      if (vk) productVariantKeys.add(vk);
    }
  }

  return {
    productIds: [...productIds],
    productVariantKeys: [...productVariantKeys],
    conceptTitles,
    themeAxes,
  };
}

export function readGenerationHistory(routerOutput: unknown): GenerationHistory | null {
  if (!routerOutput || typeof routerOutput !== 'object') return null;
  const gh = (routerOutput as { generationHistory?: GenerationHistory }).generationHistory;
  if (!gh || typeof gh !== 'object') return null;
  return {
    productIds: Array.isArray(gh.productIds) ? gh.productIds.filter(Boolean) : [],
    productVariantKeys: Array.isArray(gh.productVariantKeys)
      ? gh.productVariantKeys.filter(Boolean)
      : [],
    conceptTitles: Array.isArray(gh.conceptTitles) ? gh.conceptTitles.filter(Boolean) : [],
    themeAxes: Array.isArray(gh.themeAxes) ? gh.themeAxes.filter(Boolean) : [],
    generationCount: typeof gh.generationCount === 'number' ? gh.generationCount : 0,
  };
}

export function mergeGenerationHistory(
  existing: GenerationHistory | null,
  latest: {
    productIds: string[];
    productVariantKeys?: string[];
    conceptTitles: string[];
    themeAxes: string[];
  },
): GenerationHistory {
  return {
    productIds: [...new Set([...(existing?.productIds ?? []), ...latest.productIds])],
    productVariantKeys: [
      ...new Set([
        ...(existing?.productVariantKeys ?? []),
        ...(latest.productVariantKeys ?? []),
      ]),
    ],
    conceptTitles: [...new Set([...(existing?.conceptTitles ?? []), ...latest.conceptTitles])],
    themeAxes: [...new Set([...(existing?.themeAxes ?? []), ...latest.themeAxes])],
    generationCount: (existing?.generationCount ?? 0) + 1,
  };
}

export function buildPreviousResultsPayload(history: GenerationHistory | null | undefined) {
  if (!history || history.generationCount <= 0) return null;
  return {
    product_ids: history.productIds,
    concept_titles: history.conceptTitles,
    theme_axes: history.themeAxes,
    previous_generation_count: history.generationCount,
  };
}

export function normalizeConceptKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function isSimilarConceptTitle(a: string, b: string): boolean {
  const na = normalizeConceptKey(a);
  const nb = normalizeConceptKey(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = na.split(/\s+/).filter((t) => t.length >= 3);
  const tb = new Set(nb.split(/\s+/).filter((t) => t.length >= 3));
  if (!ta.length || !tb.size) return false;
  const overlap = ta.filter((t) => tb.has(t)).length;
  return overlap / Math.max(ta.length, tb.size) >= 0.7;
}
