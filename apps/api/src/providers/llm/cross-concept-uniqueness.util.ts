import type { Concept } from '../../agents/contracts';
import type { CatalogProduct } from './catalog.util';
import {
  isVariantBlocked,
  isCrossConceptLineBlocked,
  productVariantKey,
  crossConceptLineKeys,
  registerCrossConceptBlock,
  registerCrossConceptLineKeys,
} from './catalog-variant.util';
import {
  ConceptDiversityTracker,
  detectConceptProductType,
} from './concept-diversity.util';
import { scoreBriefRelevance, buildBriefRelevanceContext, scoreBriefRelevanceWithContext } from './catalog-brief-relevance.util';
import { ensureConceptProducts, upgradeSetToTargetBudget } from './concept-product-picker.util';
import { resolveMandatoryTypesForBrief } from '../../requests/mandatory-types.util';
import { isDirectedBriefMode, resolveNamedItemsForBrief } from '../../requests/named-positions.util';
import { enforceSetBudget, estimateSetTotalPrice } from './set-budget.util';
import { isCorporateSetFiller } from '../../concept/product-role.util';
import { isLowRelevanceJunk } from '../../concept/selection-constraints';

export function seedVariantKeysFromProductIds(
  productIds: Iterable<string>,
  catalogById: Map<string, CatalogProduct>,
): Set<string> {
  const keys = new Set<string>();
  for (const id of productIds) {
    const p = catalogById.get(id);
    if (p) {
      keys.add(productVariantKey(p));
      for (const lk of crossConceptLineKeys(p)) keys.add(lk);
    }
  }
  return keys;
}

function remapConceptProducts(concept: Concept, products: CatalogProduct[]): Concept {
  const catalogProducts = products.map((p) => {
    const prev = concept.catalogProducts?.find((x) => x.id === p.id);
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      productType: prev?.productType ?? detectConceptProductType(p),
      price: p.price,
      stockAvailable: p.stockAvailable,
      colors: prev?.colors ?? [],
      catalogImageUrl: p.catalogImageUrl ?? prev?.catalogImageUrl,
      imageUrl: p.catalogImageUrl ?? prev?.imageUrl,
      image: p.catalogImageUrl ?? prev?.image,
      hasCatalogImage: Boolean(p.catalogImageUrl?.trim()),
      sourceUrl: prev?.sourceUrl ?? null,
    };
  });

  return {
    ...concept,
    catalogProducts,
    productIds: products.map((p) => p.id),
    previewProductImageUrls: catalogProducts
      .map((p) => p.catalogImageUrl)
      .filter(Boolean) as string[],
  };
}

/**
 * Гарантирует: ни один productId / productVariantKey не повторяется между концепциями.
 * При конфликте — заменяет или дозаполняет из пула.
 */
export function enforceGlobalConceptUniqueness(
  concepts: Concept[],
  catalog: CatalogProduct[],
  brief: string,
  brandColors: string[] = [],
  minProductsPerSet = 4,
  log?: (msg: string) => void,
  budgetPerSet: number | null = null,
  directedMode = false,
): Concept[] {
  const usedIds = new Set<string>();
  const usedVariants = new Set<string>();
  const usedLineKeys = new Set<string>();
  const mandatoryTypes = resolveMandatoryTypesForBrief(brief);
  const directed = directedMode || isDirectedBriefMode(resolveNamedItemsForBrief(brief).namedTypes);
  const tracker = new ConceptDiversityTracker(new Set(mandatoryTypes));
  const catalogById = new Map(catalog.map((p) => [p.id, p]));
  const relevanceCtx = buildBriefRelevanceContext(brief, brandColors);
  const minRelevanceScore = relevanceCtx.flags.tech ? 50 : relevanceCtx.flags.eco ? 28 : -40;
  let repairCount = 0;

  const passesRefillPool = (p: CatalogProduct): boolean => {
    if (isCorporateSetFiller(p, brief)) return false;
    if (isLowRelevanceJunk(p, brief)) return false;
    if (scoreBriefRelevanceWithContext(p, relevanceCtx) <= minRelevanceScore) return false;
    if (budgetPerSet == null || budgetPerSet <= 0 || (p.price ?? 0) <= budgetPerSet) return true;
    return false;
  };

  const pickReplacement = (
    current: CatalogProduct[],
    blockedIds: Set<string>,
    blockedVariants: Set<string>,
    blockedLineKeys: Set<string>,
    seed: number,
  ): CatalogProduct | null => {
    const localIds = new Set([...blockedIds, ...current.map((p) => p.id)]);
    const localVariants = new Set([...blockedVariants]);
    const localLineKeys = new Set([...blockedLineKeys]);
    for (const p of current) {
      registerCrossConceptBlock(p, localIds, localVariants);
      registerCrossConceptLineKeys(p, localLineKeys, brief);
    }
    const pool = catalog
      .filter(
        (p) =>
          !isVariantBlocked(p, localIds, localVariants) &&
          !isCrossConceptLineBlocked(p, localLineKeys, brief) &&
          passesRefillPool(p) &&
          !current.some((x) =>
            crossConceptLineKeys(x, brief).some((lk) => crossConceptLineKeys(p, brief).includes(lk)),
          ),
      )
      .sort(
        (a, b) =>
          scoreBriefRelevanceWithContext(b, relevanceCtx) -
          scoreBriefRelevanceWithContext(a, relevanceCtx),
      );
    return pool[seed % Math.max(pool.length, 1)] ?? null;
  };

  const result = concepts.map((concept, conceptIndex) => {
    let products = (concept.catalogProducts ?? [])
      .map((cp) => catalogById.get(cp.id) ?? ({ ...cp } as CatalogProduct))
      .filter(Boolean) as CatalogProduct[];
    const originalCount = products.length;

    const kept: CatalogProduct[] = [];
    for (const p of products) {
      const lineConflict =
        isCrossConceptLineBlocked(p, usedLineKeys, brief) ||
        kept.some((x) =>
          crossConceptLineKeys(x, brief).some((lk) => crossConceptLineKeys(p, brief).includes(lk)),
        );
      if (isVariantBlocked(p, usedIds, usedVariants) || lineConflict) {
        repairCount++;
        const replacement = pickReplacement(
          kept,
          usedIds,
          usedVariants,
          usedLineKeys,
          conceptIndex * 41 + repairCount,
        );
        if (replacement) {
          kept.push(replacement);
          registerCrossConceptBlock(replacement, usedIds, usedVariants);
          registerCrossConceptLineKeys(replacement, usedLineKeys, brief);
        }
        continue;
      }
      kept.push(p);
      registerCrossConceptBlock(p, usedIds, usedVariants);
      registerCrossConceptLineKeys(p, usedLineKeys, brief);
    }
    products = kept;

    const targetCount = Math.max(minProductsPerSet, originalCount);
    if (products.length < targetCount && !directed) {
      const blockedIds = new Set([...usedIds, ...products.map((p) => p.id)]);
      const blockedVariants = new Set([...usedVariants]);
      const blockedLineKeys = new Set([...usedLineKeys]);
      for (const p of products) {
        registerCrossConceptBlock(p, blockedIds, blockedVariants);
        registerCrossConceptLineKeys(p, blockedLineKeys, brief);
      }
      const pool = catalog.filter(
        (p) =>
          !isVariantBlocked(p, blockedIds, blockedVariants) &&
          !isCrossConceptLineBlocked(p, blockedLineKeys, brief) &&
          passesRefillPool(p),
      );
      products = ensureConceptProducts(
        products,
        pool.length >= minProductsPerSet ? pool : catalog.filter(
          (p) =>
            !isVariantBlocked(p, blockedIds, blockedVariants) && !isCorporateSetFiller(p, brief),
        ),
        targetCount,
        {
          title: concept.title,
          composition: concept.composition ?? concept.description ?? '',
          brief,
          style: concept.style,
        },
        blockedIds,
        blockedVariants,
        tracker,
        conceptIndex * 59 + repairCount,
        false,
        (p) => scoreBriefRelevance(p, brief, brandColors),
        mandatoryTypes,
      );
    }

    if (budgetPerSet != null && budgetPerSet > 0 && products.length > 0) {
      const crossBlockedIds = new Set(usedIds);
      const crossBlockedVariants = new Set(usedVariants);
      for (const p of products) {
        crossBlockedIds.delete(p.id);
        crossBlockedVariants.delete(productVariantKey(p));
        for (const lk of crossConceptLineKeys(p)) crossBlockedVariants.delete(lk);
      }
      products = enforceSetBudget(
        products,
        catalog,
        budgetPerSet,
        crossBlockedIds,
        crossBlockedVariants,
        conceptIndex * 67,
        minProductsPerSet,
        brief,
      );
      products = upgradeSetToTargetBudget(
        products,
        catalog,
        budgetPerSet,
        {
          title: concept.title,
          composition: concept.composition ?? concept.description ?? '',
          brief,
          style: concept.style,
          brandColors,
          budgetMax: budgetPerSet,
          maxProductsPerSet: Math.max(minProductsPerSet + 1, products.length + 1),
          blockedIds: crossBlockedIds,
          blockedVariants: crossBlockedVariants,
        },
      );
    }

    for (const p of products) {
      registerCrossConceptBlock(p, usedIds, usedVariants);
      registerCrossConceptLineKeys(p, usedLineKeys, brief);
    }

    return remapConceptProducts(concept, products);
  });

  if (repairCount > 0) {
    log?.(`Cross-concept dedup: removed/replaced ${repairCount} duplicate SKU(s) across sets`);
  }

  // Второй проход: если line-key (Madras/PB030/Elbrus) всё ещё дублируется — заменить слабейший.
  const repaired = result.map((concept, conceptIndex) => {
    let products = (concept.catalogProducts ?? [])
      .map((cp) => catalogById.get(cp.id) ?? ({ ...cp } as CatalogProduct))
      .filter(Boolean) as CatalogProduct[];
    const globalIds = new Set<string>();
    const globalVariants = new Set<string>();
    const globalLineKeys = new Set<string>();
    for (let ci = 0; ci < result.length; ci++) {
      if (ci === conceptIndex) continue;
      for (const cp of result[ci].catalogProducts ?? []) {
        const row = catalogById.get(cp.id) ?? ({ ...cp } as CatalogProduct);
        registerCrossConceptBlock(row, globalIds, globalVariants);
        registerCrossConceptLineKeys(row, globalLineKeys, brief);
      }
    }
    const fixed: CatalogProduct[] = [];
    for (const p of products) {
      const dupLine =
        isCrossConceptLineBlocked(p, globalLineKeys, brief) ||
        fixed.some((x) =>
          crossConceptLineKeys(x, brief).some((lk) => crossConceptLineKeys(p, brief).includes(lk)),
        );
      if (!dupLine && !isVariantBlocked(p, globalIds, globalVariants)) {
        fixed.push(p);
        registerCrossConceptBlock(p, globalIds, globalVariants);
        registerCrossConceptLineKeys(p, globalLineKeys, brief);
        continue;
      }
      const repl = pickReplacement(fixed, globalIds, globalVariants, globalLineKeys, conceptIndex * 97 + fixed.length);
      if (repl) {
        fixed.push(repl);
        registerCrossConceptBlock(repl, globalIds, globalVariants);
        registerCrossConceptLineKeys(repl, globalLineKeys, brief);
      }
    }
    if (fixed.length >= Math.min(minProductsPerSet, products.length || minProductsPerSet)) {
      products = fixed;
    }
    return remapConceptProducts(concept, products);
  });

  const allIds: string[] = [];
  const allVk: string[] = [];
  const allLk: string[] = [];
  for (const c of repaired) {
    for (const p of c.catalogProducts ?? []) {
      const row = { ...p, silhouetteImageUrl: '' } as CatalogProduct;
      allIds.push(p.id);
      allVk.push(productVariantKey(row));
      allLk.push(...crossConceptLineKeys(row, brief));
    }
  }
  if (
    new Set(allIds).size !== allIds.length ||
    new Set(allVk).size !== allVk.length ||
    new Set(allLk).size !== allLk.length
  ) {
    log?.(`Cross-concept dedup: WARNING still has duplicates after second pass`);
  }

  return repaired;
}
