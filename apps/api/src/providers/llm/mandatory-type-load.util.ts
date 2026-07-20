import type { CatalogProduct } from './catalog.util';
import {
  CONCEPT_TYPE_DEFINITIONS,
  detectConceptProductType,
  detectMandatoryConceptTypesFromBrief,
  mandatoryTypeAliases,
} from './concept-diversity.util';

/**
 * Обязательные типы брифа, которых НЕТ среди загруженных кандидатов.
 * SQL-загрузка среза (price ≤ бюджет, stock ≥ тираж, случайный offset бакетов)
 * может не притащить ни одного SKU типа («проектор» за 3254 ₽ при бюджете 2000) —
 * тогда тип надо дозагрузить из БД точечно, иначе никакая логика ниже не поможет.
 */
export function missingMandatoryTypes(
  candidates: CatalogProduct[],
  brief: string,
): string[] {
  const mandatory = detectMandatoryConceptTypesFromBrief(brief);
  if (!mandatory.length) return [];
  const presentTypes = new Set(candidates.map((p) => detectConceptProductType(p)));
  return mandatory.filter(
    (slug) => !mandatoryTypeAliases(slug).some((alias) => presentTypes.has(alias)),
  );
}

/** Поисковый термин для точечной дозагрузки типа из БД (labelRu таксономии). */
export function mandatoryTypeSearchTerm(slug: string): string {
  return CONCEPT_TYPE_DEFINITIONS.find((d) => d.slug === slug)?.labelRu ?? slug.replace(/_/g, ' ');
}

/**
 * Влить дозагруженные SKU типа в кандидатов: только нужного типа, без дублей
 * и блэклиста, лучшие по остатку первыми, с разумным капом.
 */
export function mergeMandatoryTypeCandidates(
  candidates: CatalogProduct[],
  loaded: CatalogProduct[],
  slug: string,
  blacklistedProductIds: string[] = [],
  cap = 24,
): CatalogProduct[] {
  const have = new Set(candidates.map((p) => p.id));
  const blacklist = new Set(blacklistedProductIds);
  const aliases = mandatoryTypeAliases(slug);
  const typed = loaded
    .filter((p) => !have.has(p.id) && !blacklist.has(p.id))
    .filter((p) => aliases.includes(detectConceptProductType(p)))
    .sort((a, b) => (b.stockAvailable ?? 0) - (a.stockAvailable ?? 0))
    .slice(0, cap);
  return typed.length ? [...candidates, ...typed] : candidates;
}

/**
 * ЕДИНЫЙ КАНАЛ РЕЗЕРВА обязательных типов. Вместо разрозненных льгот `|| isMandatoryType`
 * в каждом гейте фильтра: гоняем все гейты по обычному каталогу, а в КОНЦЕ гарантируем,
 * что каждый обязательный тип брифа представлен в пуле (до perType валидных SKU), долив
 * из валидного среза baseCatalog. Один резерв вместо N исключений — новые фильтры не
 * должны помнить про mandatory. `validBaseCatalog` — уже отфильтрованный по картинке/цене.
 */
export function reserveMandatoryCandidates(
  filtered: CatalogProduct[],
  validBaseCatalog: CatalogProduct[],
  brief: string,
  blacklistedProductIds: string[] = [],
  perType = 8,
): CatalogProduct[] {
  const mandatory = detectMandatoryConceptTypesFromBrief(brief);
  if (!mandatory.length) return filtered;

  let out = filtered;
  for (const slug of mandatory) {
    const aliases = mandatoryTypeAliases(slug);
    const presentCount = out.filter((p) =>
      aliases.includes(detectConceptProductType(p)),
    ).length;
    const need = perType - presentCount;
    if (need <= 0) continue; // тип уже достаточно представлен
    out = mergeMandatoryTypeCandidates(out, validBaseCatalog, slug, blacklistedProductIds, need);
  }
  return out;
}
