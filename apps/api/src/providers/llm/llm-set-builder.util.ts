/**
 * llm-set-builder.util.ts — НЕЙРО-ПОДБОР товаров в наборы.
 *
 * Заменяет пост-процесс rule-based + LLM-критик. Для каждого набора нейросеть
 * выбирает товары из шортлиста (категория→подкатегория→товар), учитывая:
 *   • смысл идеи набора и бриф;
 *   • уже выбранные товары набора (когерентность);
 *   • категории пользователя (приоритет) и запрещённые (жёсткое исключение);
 *   • бюджет.
 * Детерминированные ограничения поверх выбора:
 *   • НЕТ повтора категории/роли в одном наборе (стакан+чашка запрещены);
 *   • НЕТ повтора товара (даже другого цвета) в наборе и во ВСЕЙ концепции;
 *   • подбор цвета варианта под бренд после выбора товара.
 *
 * Один компактный LLM-вызов на набор, наборы считаются ПАРАЛЛЕЛЬНО → быстро.
 */
import type { ConfigService } from '@nestjs/config';
import type { CatalogProduct } from './catalog.util';
import { openRouterFetch } from './openrouter-proxy.util';
import { safeJsonParse } from './safe-json-parse.util';
import {
  productVariantKey,
  crossConceptLineKeys,
  pickBestColorVariant,
  isCrossConceptBlocked,
  isCrossConceptLineBlocked,
  registerCrossConceptBlock,
  registerCrossConceptLineKeys,
} from './catalog-variant.util';
import {
  detectConceptProductType,
  typeConflictsInSet,
} from './concept-diversity.util';
import { scoreBriefRelevance, buildBriefRelevanceContext, scoreBriefRelevanceWithContext } from './catalog-brief-relevance.util';
import { resolveCatalogImageUrl } from '../../products/product-image.util';
import { detectProductRole, isCorporateSetFiller } from '../../concept/product-role.util';
import { pickCatalogColorNameForBrand } from './catalog-color-match.util';
import {
  hasValidProductImage,
  displayTypeForCap,
  selectionConstraintsFromFilterInput,
  finalizeConceptSelection,
  buildSetWithRelaxation,
  wouldExceedDisplayTypeCap,
  wouldExceedTextileCatalogCap,
  wouldExceedUniqueRoleFamilyCap,
  minUnitPriceForSet,
  isLowRelevanceJunk,
  type SelectionConstraintsInput,
} from '../../concept/selection-constraints';
import type { CatalogFilterInput } from './catalog-filter.util';
import { indexCatalogByProductType } from './catalog-slot-picker.util';
import { estimateSetTotalPrice, resolveSetBudgetRange } from './set-budget.util';

function previousSetIsAcceptable(
  products: CatalogProduct[],
  brief: string,
  minItems: number,
  budgetMin: number | null,
  budgetPerSet: number | null,
  constraints?: SelectionConstraintsInput,
): boolean {
  if (products.length < minItems) return false;
  if (products.some((p) => isCorporateSetFiller(p, brief))) return false;
  if (products.some((p) => isLowRelevanceJunk(p, brief))) return false;
  const relevanceCtx = buildBriefRelevanceContext(brief, []);
  const minRel = relevanceCtx.flags.tech ? 35 : relevanceCtx.flags.eco ? 18 : 8;
  if (products.some((p) => scoreBriefRelevanceWithContext(p, relevanceCtx) < minRel)) return false;
  if (
    constraints &&
    products.some(
      (p) => !passesSetBuilderQualityGate(p, brief, [], constraints, minRel),
    )
  ) {
    return false;
  }
  const { floor } = resolveSetBudgetRange(budgetMin, budgetPerSet);
  if (floor > 0 && estimateSetTotalPrice(products) < floor * 0.95) return false;
  return true;
}

const OR_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
// Через прокси: с IP хостера Cloudflare отдаёт 403 «Access denied by security policy».

function norm(s: unknown): string {
  return String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function minRelevanceForBrief(brief: string): number {
  const ctx = buildBriefRelevanceContext(brief, []);
  if (ctx.flags.tech) return 42;
  if (ctx.flags.eco) return 22;
  if (/мерч|хакатон|корпоративн\w*\s+подарк|конференц/i.test(ctx.briefNorm)) return 8;
  return -20;
}

/** Единый гейт качества для tryAdd / шортлиста / forceBuildSet — без него в набор попадали мешочки за 74₽. */
function passesSetBuilderQualityGate(
  product: CatalogProduct,
  brief: string,
  brandColors: string[],
  constraints: SelectionConstraintsInput,
  minRelevance = minRelevanceForBrief(brief),
): boolean {
  if (!hasValidProductImage(product)) return false;
  if (isCorporateSetFiller(product, brief)) return false;
  if (isLowRelevanceJunk(product, brief)) return false;
  const relevanceCtx = buildBriefRelevanceContext(brief, brandColors);
  if (scoreBriefRelevanceWithContext(product, relevanceCtx) < minRelevance) return false;
  const minUnit = minUnitPriceForSet(constraints);
  const price = product.price ?? 0;
  if (price > 0 && price < minUnit) return false;
  return true;
}

function filterCatalogForSetBuild(
  catalog: CatalogProduct[],
  brief: string,
  brandColors: string[],
  constraints: SelectionConstraintsInput,
): CatalogProduct[] {
  const filtered = catalog.filter((p) => passesSetBuilderQualityGate(p, brief, brandColors, constraints));
  if (filtered.length >= constraints.minProductsPerSet * 4) return filtered;

  const minRel = minRelevanceForBrief(brief);
  const relaxed = catalog.filter((p) =>
    passesSetBuilderQualityGate(p, brief, brandColors, constraints, Math.min(minRel, 10)),
  );
  if (relaxed.length >= constraints.minProductsPerSet * 3) return relaxed;

  return filtered.length ? filtered : relaxed;
}

/** Категория продукта матчит один из пользовательских токенов (категория/ключевое слово). */
function matchesAny(product: CatalogProduct, tokens: string[]): boolean {
  if (!tokens.length) return false;
  const hay = norm(`${product.category} ${product.subcategory ?? ''} ${product.name}`);
  return tokens.some((t) => {
    const tk = norm(t);
    return tk.length >= 3 && hay.includes(tk);
  });
}

export interface SetBuilderConcept {
  title?: string;
  composition?: string;
  style?: string;
  boldness?: number;
  productIds?: string[];
  catalogProducts?: Array<{ id: string }>;
  [k: string]: unknown;
}

export interface RebuildSetsParams {
  concepts: SetBuilderConcept[];
  pool: CatalogProduct[];
  fullCatalog: CatalogProduct[];
  brief: string;
  brandColors: string[];
  allowedItems: string[];
  forbiddenItems: string[];
  budgetPerSet: number | null;
  budgetMin: number | null;
  minItems: number;
  maxItems: number;
  filterInput?: CatalogFilterInput;
  config: ConfigService;
  logger?: (msg: string) => void;
}

/** Сборка одного шортлиста: приоритет польз. категорий, исключение запрещённых, дедуп по базе. */
function buildShortlist(
  concept: SetBuilderConcept,
  pool: CatalogProduct[],
  brief: string,
  brandColors: string[],
  allowed: string[],
  forbidden: string[],
  blockedIds: Set<string>,
  blockedVariants: Set<string>,
  blockedLineKeys: Set<string>,
  limit = 40,
  poolFallback?: CatalogProduct[],
): CatalogProduct[] {
  const sourcePool =
    pool.length >= limit / 2
      ? pool
      : [...pool, ...(poolFallback ?? []).filter((p) => !pool.some((x) => x.id === p.id))];
  const conceptText = norm(`${concept.title} ${concept.composition} ${concept.style}`);
  const relevanceCtx = buildBriefRelevanceContext(brief, brandColors);
  const minRelevance = relevanceCtx.flags.tech ? 55 : relevanceCtx.flags.eco ? 28 : 12;
  const seenLineKeys = new Set<string>();
  const scored: Array<{ p: CatalogProduct; s: number }> = [];

  for (const p of sourcePool) {
    if (!hasValidProductImage(p)) continue;
    if (isCorporateSetFiller(p, brief)) continue;
    if (scoreBriefRelevanceWithContext(p, relevanceCtx) < minRelevance) continue;
    if (forbidden.length && matchesAny(p, forbidden)) continue;
    if (isCrossConceptBlocked(p, blockedIds, blockedVariants)) continue;
    if (isCrossConceptLineBlocked(p, blockedLineKeys, brief)) continue;
    const lineKeys = crossConceptLineKeys(p, brief);
    if (lineKeys.some((lk) => blockedVariants.has(lk))) continue;
    if (lineKeys.some((lk) => blockedLineKeys.has(lk))) continue;
    if (lineKeys.some((lk) => seenLineKeys.has(lk))) continue;
    for (const lk of lineKeys) seenLineKeys.add(lk);

    let s = scoreBriefRelevanceWithContext(p, relevanceCtx);
    for (const tok of conceptText.split(' ')) {
      if (tok.length >= 4 && norm(`${p.name} ${p.description ?? ''} ${p.subcategory ?? ''}`).includes(tok)) {
        s += 6;
      }
    }
    if (allowed.length && matchesAny(p, allowed)) s += 80;
    scored.push({ p, s });
  }

  scored.sort((a, b) => b.s - a.s);

  const perDisplayType = new Map<string, number>();
  const perCat = new Map<string, number>();
  const out: CatalogProduct[] = [];
  for (const { p } of scored) {
    const cat = norm(p.category);
    const displayType = displayTypeForCap(p);
    const catN = perCat.get(cat) ?? 0;
    const dtN = perDisplayType.get(displayType) ?? 0;
    if (catN >= 3) continue;
    if (dtN >= 2) continue;
    perCat.set(cat, catN + 1);
    perDisplayType.set(displayType, dtN + 1);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

function compactLine(p: CatalogProduct): string {
  const sub = p.subcategory ? `/${p.subcategory}` : '';
  return `[${p.id}] ${p.name} — ${p.category}${sub}, ${Math.round(p.price ?? 0)}₽`;
}

const SYSTEM = `Ты — опытный куратор корпоративных подарков, который ВСЕГДА держит в голове бриф клиента.
Тебе дают идею ОДНОГО набора и список доступных товаров (с категориями). Собери из них лучший набор.

Верни ТОЛЬКО JSON: {"picks":[{"id":"...","reason":"кратко почему"}]}

ЖЁСТКИЕ ПРАВИЛА:
1. Бери товары ТОЛЬКО из предоставленного списка (по их id).
2. Товары должны точно соответствовать брифу и идее набора, и СОЧЕТАТЬСЯ друг с другом в одну историю.
3. НЕ бери два товара одной категории или одной роли (например: стакан и кружка — обе для напитков — НЕЛЬЗЯ; две сумки — НЕЛЬЗЯ).
4. Каждый следующий товар выбирай так, чтобы он дополнял уже выбранные и идею.
5. Уложись в бюджет набора (сумма цен ≤ бюджета, но не сильно дешевле).
6. Выбери ровно нужное число товаров.
7. ЗАПРЕЩЕНО: подарочные мешочки/упаковка, чистящие салфетки, гостевые полотенца — это не содержимое набора.
8. Для IT/хакатона: гаджеты, канцелярия, бутылки, рюкзаки, powerbank — НЕ текстиль и не упаковка.`;

interface LlmPick { id: string; reason?: string }

async function pickForConcept(
  concept: SetBuilderConcept,
  shortlist: CatalogProduct[],
  brief: string,
  count: number,
  budgetPerSet: number | null,
  apiKey: string,
  model: string,
): Promise<LlmPick[]> {
  if (!shortlist.length || !apiKey) return [];
  const user = JSON.stringify({
    идея_набора: { название: concept.title, описание: concept.composition, стиль: concept.style },
    бриф: brief.slice(0, 500),
    бюджет_набора: budgetPerSet ? `${Math.round(budgetPerSet)}₽` : 'не задан',
    нужно_товаров: count,
    доступные_товары: shortlist.map(compactLine),
  });
  try {
    const res = await openRouterFetch(OR_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }],
        temperature: 0.25,
        max_tokens: 900,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(30000),
    });
    const j = safeJsonParse<{ choices?: Array<{ message?: { content?: string } }> }>(
      await res.text(),
      'set-builder',
    );
    let content = j.choices?.[0]?.message?.content || '';
    content = content.replace(/```json\s*|\s*```/g, '').trim();
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return [];
    const parsed = safeJsonParse(m[0], 'set-builder picks') as { picks?: unknown };
    return Array.isArray(parsed.picks) ? parsed.picks : [];
  } catch {
    return [];
  }
}

/** Маппинг CatalogProduct → форма catalogProducts концепции (как в toConcept). */
function mapProduct(p: CatalogProduct, brandColors: string[]) {
  const img = resolveCatalogImageUrl(p);
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    subcategory: (p as { subcategory?: string | null }).subcategory ?? null,
    productType: detectProductRole(p).legacyType,
    price: p.price,
    stockAvailable: p.stockAvailable,
    colors: ((p.colors as unknown[]) ?? [])
      .map((c) => (typeof c === 'string' ? c : (c as { name?: string })?.name ?? ''))
      .filter(Boolean),
    targetColor: pickCatalogColorNameForBrand(p, brandColors),
    catalogImageUrl: img,
    imageUrl: img,
    image: img,
    hasCatalogImage: hasValidProductImage(p),
    sourceUrl: (p as { sourceUrl?: string | null }).sourceUrl ?? null,
  };
}

/**
 * Главная функция: переселектит товары во всех наборах нейросетью + строгие ограничения.
 * Возвращает true, если хотя бы один набор успешно пересобран.
 */
export async function rebuildConceptSetsWithLlm(params: RebuildSetsParams): Promise<boolean> {
  const {
    concepts, pool, fullCatalog, brief, brandColors,
    allowedItems, forbiddenItems, budgetPerSet, minItems, maxItems, config, logger,
  } = params;
  const apiKey = config.get<string>('OPENROUTER_API_KEY', '').trim();
  const model = config.get<string>('CATALOG_SET_BUILDER_MODEL')
    || config.get<string>('OPENROUTER_MODEL_CATALOG_IDEATOR', 'google/gemini-2.5-flash');
  if (!apiKey || !concepts.length) return false;

  const allowed = (allowedItems ?? []).map((s) => String(s)).filter(Boolean);
  const forbidden = (forbiddenItems ?? []).map((s) => String(s)).filter(Boolean);
  const baseSelectionInput = selectionConstraintsFromFilterInput(
    params.filterInput ?? {
      userPrompt: brief,
      colors: brandColors,
      allowedItems,
      forbiddenItems,
      budgetMin: params.budgetMin,
      budgetMax: budgetPerSet,
      budgetPerSet,
    },
    { min: minItems, max: maxItems },
  );

  // Группировка вариантов по базе для подбора цвета.
  const variantGroups = new Map<string, CatalogProduct[]>();
  for (const p of fullCatalog) {
    const vk = productVariantKey(p);
    const g = variantGroups.get(vk) ?? [];
    g.push(p);
    variantGroups.set(vk, g);
  }
  const byId = new Map(pool.map((p) => [p.id, p]));
  const fullById = new Map(fullCatalog.map((p) => [p.id, p]));

  const registerConceptProducts = (products: CatalogProduct[]) => {
    for (const p of products) {
      registerCrossConceptBlock(p, usedIdsGlobal, usedVariantsGlobal);
      registerCrossConceptLineKeys(p, usedLineKeysGlobal, brief);
    }
  };

  const registerConceptCatalogProducts = (catalogProducts: SetBuilderConcept['catalogProducts']) => {
    for (const cp of catalogProducts ?? []) {
      const p = fullById.get(cp.id) ?? byId.get(cp.id);
      if (p) registerConceptProducts([p]);
    }
  };

  const applyConceptProducts = (target: SetBuilderConcept, products: CatalogProduct[]) => {
    const cleaned = products.filter(
      (p) =>
        !isCorporateSetFiller(p, brief) &&
        !isLowRelevanceJunk(p, brief) &&
        passesSetBuilderQualityGate(p, brief, brandColors, baseSelectionInput),
    );
    if (cleaned.length < minItems) return false;
    target.catalogProducts = cleaned.map((p) => mapProduct(p, brandColors)) as never;
    target.productIds = cleaned.map((p) => p.id);
    registerConceptProducts(cleaned);
    anySuccess = true;
    return true;
  };

  const forceBuildSet = (
    concept: SetBuilderConcept,
    initial: CatalogProduct[],
    crossIdsBefore: Set<string>,
    crossVariantsBefore: Set<string>,
    crossLineKeysBefore: Set<string>,
    conceptIndex: number,
    catalogOverride?: CatalogProduct[],
  ): CatalogProduct[] => {
    const rawCatalog =
      catalogOverride ??
      (fullCatalog.length >= minItems * 4 ? fullCatalog.slice(0, 2000) : pool.slice(0, 1200));
    const buildCatalog = filterCatalogForSetBuild(rawCatalog, brief, brandColors, baseSelectionInput);
    const selectionInput = baseSelectionInput;
    const typeIndex = indexCatalogByProductType(buildCatalog.length ? buildCatalog : pool);
    const relaxed = buildSetWithRelaxation(
      {
        constraints: selectionInput,
        options: {
          catalog: buildCatalog,
          filterInput: params.filterInput,
          conceptTitle: concept.title,
          conceptComposition: concept.composition ?? '',
          typeIndex,
          seed: conceptIndex * 53,
          crossConceptBlockedIds: crossIdsBefore,
          crossConceptBlockedVariants: crossVariantsBefore,
          crossConceptBlockedLineKeys: crossLineKeysBefore,
          onWarn: (msg) => logger?.(`set-builder force "${concept.title}": ${msg}`),
        },
        initial,
        targetCount: minItems,
        onLog: (msg) => logger?.(`set-builder force "${concept.title}": ${msg}`),
      },
      buildCatalog,
    );
    return relaxed.products;
  };

  const target = Math.max(minItems, Math.min(maxItems, 5));
  const { floor: budgetFloorGlobal, cap: budgetCapGlobal } = resolveSetBudgetRange(
    params.budgetMin,
    budgetPerSet,
  );

  const usedVariantsGlobal = new Set<string>();
  const usedIdsGlobal = new Set<string>();
  const usedLineKeysGlobal = new Set<string>();

  const registerChosenProduct = (p: CatalogProduct) => {
    registerCrossConceptBlock(p, usedIdsGlobal, usedVariantsGlobal);
    registerCrossConceptLineKeys(p, usedLineKeysGlobal, brief);
  };

  const unregisterChosenProduct = (p: CatalogProduct) => {
    usedIdsGlobal.delete(p.id);
    usedVariantsGlobal.delete(productVariantKey(p));
    for (const lk of crossConceptLineKeys(p, brief)) {
      usedVariantsGlobal.delete(lk);
      usedLineKeysGlobal.delete(lk);
    }
  };

  const fillDeterministicSet = (
    concept: SetBuilderConcept,
    shortlist: CatalogProduct[],
    crossIdsBefore: Set<string>,
    crossVariantsBefore: Set<string>,
    crossLineKeysBefore: Set<string>,
    localUsedIds: Set<string>,
    localUsedVariants: Set<string>,
    localUsedLineKeys: Set<string>,
  ): CatalogProduct[] => {
    const chosen: CatalogProduct[] = [];
    const localTypes = new Set<string>();

    const tryAddLocal = (p: CatalogProduct | undefined): boolean => {
      if (!p) return false;
      if (!passesSetBuilderQualityGate(p, brief, brandColors, baseSelectionInput)) return false;
      if (forbidden.length && matchesAny(p, forbidden)) return false;
      if (
        localUsedIds.has(p.id) ||
        isCrossConceptBlocked(p, crossIdsBefore, crossVariantsBefore) ||
        isCrossConceptLineBlocked(p, crossLineKeysBefore, brief) ||
        isCrossConceptBlocked(p, localUsedIds, localUsedVariants) ||
        isCrossConceptLineBlocked(p, localUsedLineKeys, brief) ||
        chosen.some((x) =>
          crossConceptLineKeys(x, brief).some((lk) => crossConceptLineKeys(p, brief).includes(lk)),
        )
      ) {
        return false;
      }
      if (wouldExceedUniqueRoleFamilyCap(p, chosen)) return false;
      if (wouldExceedDisplayTypeCap(p, chosen)) return false;
      if (wouldExceedTextileCatalogCap(p, chosen, brief)) return false;
      const type = detectConceptProductType(p);
      if (typeConflictsInSet(localTypes, type)) return false;
      const group = variantGroups.get(productVariantKey(p));
      let finalP = p;
      if (group && group.length > 1 && brandColors.length) {
        finalP = pickBestColorVariant(group, brandColors);
      }
      chosen.push(finalP);
      localTypes.add(type);
      registerCrossConceptBlock(finalP, localUsedIds, localUsedVariants);
      registerCrossConceptLineKeys(finalP, localUsedLineKeys, brief);
      return true;
    };

    const sumOf = () => chosen.reduce((s, p) => s + (p.price ?? 0), 0);
    const cap = budgetCapGlobal > 0 ? budgetCapGlobal : Infinity;
    const floor = budgetFloorGlobal > 0 ? budgetFloorGlobal : 0;
    const ranked = [...shortlist, ...pool]
      .filter((p, idx, arr) => arr.findIndex((x) => x.id === p.id) === idx)
      .sort(
        (a, b) =>
          scoreBriefRelevance(b, brief, brandColors) - scoreBriefRelevance(a, brief, brandColors) ||
          (b.price ?? 0) - (a.price ?? 0),
      );

    for (const p of ranked) {
      if (chosen.length >= maxItems) break;
      if ((p.price ?? 0) > cap - sumOf()) continue;
      tryAddLocal(p);
    }
    if (floor > 0 && sumOf() < floor) {
      for (const p of ranked) {
        if (sumOf() >= floor || chosen.length >= maxItems) break;
        if ((p.price ?? 0) > cap - sumOf()) continue;
        tryAddLocal(p);
      }
    }
    return chosen;
  };

  // Последовательная сборка: каждый следующий набор видит SKU предыдущих (variety + no repetition).
  let anySuccess = false;

  for (let i = 0; i < concepts.length; i++) {
    const concept = concepts[i];
    const previousCount = concept.catalogProducts?.length ?? 0;

    // Синхронизация line-key/SKU из уже собранных наборов (Madras/PB030/термос).
    for (let j = 0; j < i; j++) {
      for (const cp of concepts[j].catalogProducts ?? []) {
        const row = cp as { id: string; name?: string; category?: string };
        const p = fullById.get(row.id) ?? byId.get(row.id);
        if (p) {
          registerCrossConceptBlock(p, usedIdsGlobal, usedVariantsGlobal);
          registerCrossConceptLineKeys(p, usedLineKeysGlobal, brief);
        } else if (row.name?.trim()) {
          for (const lk of crossConceptLineKeys(
            {
              id: row.id,
              name: row.name,
              category: row.category ?? '',
              description: '',
            } as CatalogProduct,
            brief,
          )) {
            usedLineKeysGlobal.add(lk);
          }
        }
      }
    }

    const crossIdsBefore = new Set(usedIdsGlobal);
    const crossVariantsBefore = new Set(usedVariantsGlobal);
    const crossLineKeysBefore = new Set(usedLineKeysGlobal);

    const shortlist = buildShortlist(
      concept,
      pool,
      brief,
      brandColors,
      allowed,
      forbidden,
      crossIdsBefore,
      crossVariantsBefore,
      crossLineKeysBefore,
      40,
      fullCatalog,
    );
    const shortById = new Map(shortlist.map((p) => [p.id, p]));

    const llmPicks = await pickForConcept(
      concept,
      shortlist,
      brief,
      target,
      budgetPerSet,
      apiKey,
      model,
    );

    const chosen: CatalogProduct[] = [];
    const localTypes = new Set<string>();

    const tryAdd = (p: CatalogProduct | undefined): boolean => {
      if (!p) return false;
      if (!passesSetBuilderQualityGate(p, brief, brandColors, baseSelectionInput)) return false;
      if (forbidden.length && matchesAny(p, forbidden)) return false;
      if (isCrossConceptBlocked(p, crossIdsBefore, crossVariantsBefore)) return false;
      if (isCrossConceptLineBlocked(p, crossLineKeysBefore, brief)) return false;
      if (isCrossConceptBlocked(p, usedIdsGlobal, usedVariantsGlobal)) return false;
      if (isCrossConceptLineBlocked(p, usedLineKeysGlobal, brief)) return false;
      if (wouldExceedUniqueRoleFamilyCap(p, chosen)) return false;
      if (wouldExceedDisplayTypeCap(p, chosen)) return false;
      if (wouldExceedTextileCatalogCap(p, chosen, brief)) return false;
      const type = detectConceptProductType(p);
      if (typeConflictsInSet(localTypes, type)) return false;
      const group = variantGroups.get(productVariantKey(p));
      let finalP = p;
      if (group && group.length > 1 && brandColors.length) {
        finalP = pickBestColorVariant(group, brandColors);
      }
      if (
        chosen.some((x) =>
          crossConceptLineKeys(x, brief).some((lk) => crossConceptLineKeys(finalP, brief).includes(lk)),
        )
      ) {
        return false;
      }
      chosen.push(finalP);
      localTypes.add(type);
      registerChosenProduct(finalP);
      return true;
    };

    const sumOf = () => chosen.reduce((s, p) => s + (p.price ?? 0), 0);
    const cap = budgetCapGlobal > 0 ? budgetCapGlobal : Infinity;
    const floor = budgetFloorGlobal > 0 ? budgetFloorGlobal : 0;

    for (const pick of llmPicks) {
      if (chosen.length >= maxItems) break;
      const p = shortById.get(pick?.id) || byId.get(pick?.id);
      if (p && (p.price ?? 0) <= cap - sumOf()) tryAdd(p);
    }

    const fillSources = [shortlist, pool];
    if (floor > 0 && sumOf() < floor) {
      for (const src of fillSources) {
        if (sumOf() >= floor || chosen.length >= maxItems) break;
        const cands = [...src].sort(
          (a, b) =>
            scoreBriefRelevance(b, brief, brandColors) - scoreBriefRelevance(a, brief, brandColors) ||
            (b.price ?? 0) - (a.price ?? 0),
        );
        for (const p of cands) {
          if (sumOf() >= floor || chosen.length >= maxItems) break;
          if ((p.price ?? 0) > cap - sumOf()) continue;
          tryAdd(p);
        }
      }
    }
    if (chosen.length < minItems) {
      const ranked = [...pool].sort(
        (a, b) =>
          scoreBriefRelevance(b, brief, brandColors) - scoreBriefRelevance(a, brief, brandColors) ||
          (b.price ?? 0) - (a.price ?? 0),
      );
      for (const p of ranked) {
        if (chosen.length >= minItems) break;
        if ((p.price ?? 0) <= cap - sumOf()) tryAdd(p);
      }
    }
    if (floor > 0 && sumOf() < floor) {
      for (let idx = 0; idx < chosen.length && sumOf() < floor; idx++) {
        const cur = chosen[idx];
        const curType = detectConceptProductType(cur);
        const budgetRoom = cap - (sumOf() - (cur.price ?? 0));
        const repl = [...shortlist, ...pool]
          .filter(
            (p) =>
              detectConceptProductType(p) === curType &&
              (p.price ?? 0) > (cur.price ?? 0) &&
              (p.price ?? 0) <= budgetRoom &&
              !isCrossConceptBlocked(p, crossIdsBefore, crossVariantsBefore) &&
              !isCrossConceptLineBlocked(p, crossLineKeysBefore, brief) &&
              !isCrossConceptBlocked(p, usedIdsGlobal, usedVariantsGlobal) &&
              !isCrossConceptLineBlocked(p, usedLineKeysGlobal, brief) &&
              (!forbidden.length || !matchesAny(p, forbidden)) &&
              passesSetBuilderQualityGate(p, brief, brandColors, baseSelectionInput),
          )
          .sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];
        if (repl) {
          unregisterChosenProduct(cur);
          localTypes.delete(curType);
          const group = variantGroups.get(productVariantKey(repl));
          const finalRepl =
            group && group.length > 1 && brandColors.length
              ? pickBestColorVariant(group, brandColors)
              : repl;
          chosen[idx] = finalRepl;
          localTypes.add(detectConceptProductType(finalRepl));
          registerChosenProduct(finalRepl);
        }
      }
    }

    if (chosen.length < minItems) {
      const localIds = new Set(usedIdsGlobal);
      const localVariants = new Set(usedVariantsGlobal);
      const localLineKeys = new Set(usedLineKeysGlobal);
      const deterministic = fillDeterministicSet(
        concept,
        shortlist,
        crossIdsBefore,
        crossVariantsBefore,
        crossLineKeysBefore,
        localIds,
        localVariants,
        localLineKeys,
      );
      if (deterministic.length > chosen.length) {
        for (const p of chosen) unregisterChosenProduct(p);
        chosen.length = 0;
        for (const p of deterministic) {
          tryAdd(p);
        }
      }
    }

    if (chosen.length >= minItems) {
      const buildCatalog =
        pool.length >= minItems * 8 ? pool : fullCatalog.slice(0, 1200);
      // Пропускаем через единый гейт ограничений (дедуп ролей, filler, min/max, бюджет).
      const selectionInput = selectionConstraintsFromFilterInput(
        params.filterInput ?? {
          userPrompt: brief,
          colors: brandColors,
          allowedItems,
          forbiddenItems,
          budgetMin: params.budgetMin,
          budgetMax: budgetPerSet,
          budgetPerSet,
        },
        { min: minItems, max: maxItems },
      );
      const typeIndex = indexCatalogByProductType(buildCatalog);
      const { products: finalized } = finalizeConceptSelection(chosen, selectionInput, {
        catalog: buildCatalog,
        filterInput: params.filterInput,
        conceptTitle: concept.title,
        conceptComposition: concept.composition ?? '',
        typeIndex,
        seed: i * 29,
        crossConceptBlockedIds: crossIdsBefore,
        crossConceptBlockedVariants: crossVariantsBefore,
        crossConceptBlockedLineKeys: crossLineKeysBefore,
        onWarn: (msg) => logger?.(`set-builder finalize "${concept.title}": ${msg}`),
      });
      let finalChosen = finalized;

      if (finalChosen.length < minItems) {
        const relaxed = buildSetWithRelaxation(
          {
            constraints: selectionInput,
            options: {
              catalog: buildCatalog,
              filterInput: params.filterInput,
              conceptTitle: concept.title,
              conceptComposition: concept.composition ?? '',
              typeIndex,
              seed: i * 31,
              crossConceptBlockedIds: crossIdsBefore,
              crossConceptBlockedVariants: crossVariantsBefore,
              crossConceptBlockedLineKeys: crossLineKeysBefore,
            },
            initial: finalChosen.length ? finalChosen : [],
            targetCount: minItems,
            onLog: (msg) => logger?.(`set-builder relax "${concept.title}": ${msg}`),
          },
          buildCatalog,
        );
        if (relaxed.products.length >= minItems) finalChosen = relaxed.products;
      }

      // Синхронизировать глобальный реестр после finalize (набор мог сменить SKU).
      for (const p of chosen) unregisterChosenProduct(p);
      for (const p of finalChosen) registerChosenProduct(p);

      // бюджет: тримминг превышения cap (срезаем самые дорогие, сохраняя minItems)
      {
        let sum = finalChosen.reduce((s, p) => s + (p.price ?? 0), 0);
        while (sum > cap * 1.02 && finalChosen.length > minItems) {
          finalChosen.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
          const removed = finalChosen.shift();
          if (!removed) break;
          sum = finalChosen.reduce((s, p) => s + (p.price ?? 0), 0);
        }
      }

      const finalSum = estimateSetTotalPrice(finalChosen);
      const meetsCount = finalChosen.length >= minItems;
      const previousMeetsMin = previousCount >= minItems;

      if (!meetsCount) {
        const forced = forceBuildSet(
          concept,
          finalChosen.length ? finalChosen : [],
          crossIdsBefore,
          crossVariantsBefore,
          crossLineKeysBefore,
          i,
        );
        if (forced.length >= minItems) {
          finalChosen = forced;
        }
      }

      if (
        finalChosen.length >= minItems &&
        floor > 0 &&
        estimateSetTotalPrice(finalChosen) < floor * 0.95
      ) {
        const budgetForced = forceBuildSet(
          concept,
          finalChosen,
          crossIdsBefore,
          crossVariantsBefore,
          crossLineKeysBefore,
          i + 300,
          fullCatalog.slice(0, 2000),
        );
        if (
          budgetForced.length >= minItems &&
          estimateSetTotalPrice(budgetForced) >= floor * 0.92
        ) {
          finalChosen = budgetForced;
        }
      }

      const finalSumAfterBudget = estimateSetTotalPrice(finalChosen);
      const finalBudgetOk = floor <= 0 || finalSumAfterBudget >= floor * 0.95;
      const resolvedCount = finalChosen.length >= minItems;

      if (resolvedCount && finalBudgetOk) {
        applyConceptProducts(concept, finalChosen);
        logger?.(
          `set-builder "${concept.title}": ${finalChosen.length} товаров, ${Math.round(finalSumAfterBudget)}₽ (нейро-подбор)`,
        );
      } else if (resolvedCount && !finalBudgetOk) {
        const budgetForced = forceBuildSet(
          concept,
          finalChosen,
          crossIdsBefore,
          crossVariantsBefore,
          crossLineKeysBefore,
          i + 400,
          filterCatalogForSetBuild(
            fullCatalog.slice(0, 2000),
            brief,
            brandColors,
            baseSelectionInput,
          ),
        );
        if (
          budgetForced.length >= minItems &&
          (floor <= 0 || estimateSetTotalPrice(budgetForced) >= floor * 0.92)
        ) {
          applyConceptProducts(concept, budgetForced);
          logger?.(
            `set-builder "${concept.title}": ${budgetForced.length} товаров, ${Math.round(estimateSetTotalPrice(budgetForced))}₽ (budget-rebuild)`,
          );
        } else if (
          finalSumAfterBudget >= floor * 0.85 &&
          !finalChosen.some((p) => isCorporateSetFiller(p, brief))
        ) {
          applyConceptProducts(concept, finalChosen);
          logger?.(
            `set-builder "${concept.title}": ${finalChosen.length} товаров, ${Math.round(finalSumAfterBudget)}₽ (чуть ниже floor)`,
          );
        } else {
          logger?.(
            `set-builder "${concept.title}": ${finalChosen.length} items, ${Math.round(finalSumAfterBudget)}₽ < floor ${floor}₽ — не применяю`,
          );
        }
      } else if (previousMeetsMin) {
        const emergency = forceBuildSet(
          concept,
          [],
          crossIdsBefore,
          crossVariantsBefore,
          crossLineKeysBefore,
          i + 150,
          fullCatalog.slice(0, 2000),
        );
        if (emergency.length >= minItems) {
          applyConceptProducts(concept, emergency);
          logger?.(
            `set-builder "${concept.title}": новый набор слабее — emergency ${emergency.length} items`,
          );
        } else {
          const prevProducts = (concept.catalogProducts ?? [])
            .map((cp) => fullById.get(cp.id) ?? byId.get(cp.id))
            .filter((p): p is CatalogProduct => Boolean(p));
          const hasCrossLineDup = prevProducts.some(
            (p) =>
              isCrossConceptBlocked(p, crossIdsBefore, crossVariantsBefore) ||
              isCrossConceptLineBlocked(p, crossLineKeysBefore, brief),
          );
          if (
            !hasCrossLineDup &&
            !prevProducts.some((p) => isCrossConceptLineBlocked(p, usedLineKeysGlobal, brief)) &&
            previousSetIsAcceptable(
              prevProducts,
              brief,
              minItems,
              params.budgetMin,
              budgetPerSet,
              baseSelectionInput,
            )
          ) {
            registerConceptCatalogProducts(concept.catalogProducts);
            anySuccess = true;
            logger?.(
              `set-builder "${concept.title}": новый набор слабее (${finalChosen.length} items) — оставляю прежние (${previousCount})`,
            );
          } else {
            logger?.(
              `set-builder "${concept.title}": cross-concept конфликт, emergency не собрал min (${emergency.length})`,
            );
          }
        }
      } else {
        const emergency = forceBuildSet(
          concept,
          [],
          crossIdsBefore,
          crossVariantsBefore,
          crossLineKeysBefore,
          i + 100,
        );
        if (emergency.length >= minItems) {
          applyConceptProducts(concept, emergency);
          logger?.(
            `set-builder "${concept.title}": emergency ${emergency.length} товаров, ${Math.round(estimateSetTotalPrice(emergency))}₽`,
          );
        } else {
          logger?.(`set-builder "${concept.title}": не удалось собрать набор (${chosen.length} кандидатов)`);
        }
      }
    } else {
      const emergency = forceBuildSet(
        concept,
        [],
        crossIdsBefore,
        crossVariantsBefore,
        crossLineKeysBefore,
        i + 200,
        fullCatalog.slice(0, 2000),
      );
      if (emergency.length >= minItems) {
        applyConceptProducts(concept, emergency);
        logger?.(
          `set-builder "${concept.title}": fallback ${emergency.length} товаров (LLM не дал picks)`,
        );
      } else if (previousCount >= minItems) {
        const prevProducts = (concept.catalogProducts ?? [])
          .map((cp) => fullById.get(cp.id) ?? byId.get(cp.id))
          .filter((p): p is CatalogProduct => Boolean(p));
        if (
          previousSetIsAcceptable(
            prevProducts,
            brief,
            minItems,
            params.budgetMin,
            budgetPerSet,
            baseSelectionInput,
          )
        ) {
          registerConceptCatalogProducts(concept.catalogProducts);
          anySuccess = true;
          logger?.(`set-builder "${concept.title}": мало кандидатов (${chosen.length}), оставляю прежние (${previousCount})`);
        } else {
          const emergency = forceBuildSet(
            concept,
            [],
            crossIdsBefore,
            crossVariantsBefore,
            crossLineKeysBefore,
            i + 250,
            fullCatalog.slice(0, 2000),
          );
          if (emergency.length >= minItems) {
            applyConceptProducts(concept, emergency);
            logger?.(
              `set-builder "${concept.title}": прежний набор слабый — emergency ${emergency.length} items`,
            );
          } else {
            logger?.(`set-builder "${concept.title}": мало кандидатов (${chosen.length}), набор пуст`);
          }
        }
      } else {
        logger?.(`set-builder "${concept.title}": мало кандидатов (${chosen.length}), набор пуст`);
      }
    }

    // Всегда блокируем line-key/SKU набора для следующих концепций (Madras/PB030/термос).
    if ((concept.catalogProducts?.length ?? 0) < minItems) {
      const tailEmergency = forceBuildSet(
        concept,
        [],
        usedIdsGlobal,
        usedVariantsGlobal,
        usedLineKeysGlobal,
        i + 500,
        filterCatalogForSetBuild(fullCatalog.slice(0, 2000), brief, brandColors, baseSelectionInput),
      );
      if (tailEmergency.length >= minItems) {
        applyConceptProducts(concept, tailEmergency);
      } else if (tailEmergency.length > 0) {
        logger?.(
          `set-builder "${concept.title}": tail emergency partial ${tailEmergency.length}/${minItems}`,
        );
      }
    }
    registerConceptCatalogProducts(concept.catalogProducts);
  }

  return anySuccess;
}
