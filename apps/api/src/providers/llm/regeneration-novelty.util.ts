import type { CatalogProduct } from './catalog.util';
import type { Concept } from '../../agents/contracts';
import {
  isVariantBlocked,
  productLineKey,
  productVariantKey,
  registerCrossConceptBlock,
} from './catalog-variant.util';
import {
  detectConceptProductType,
  typeConflictsInSet,
} from './concept-diversity.util';
import { scoreBriefRelevance } from './catalog-brief-relevance.util';
import { ensureConceptProducts } from './concept-product-picker.util';
import { ConceptDiversityTracker } from './concept-diversity.util';
import { isCorporateSetFiller } from '../../concept/product-role.util';

/** Заменяет товары, совпавшие с прошлой выдачей, на альтернативы того же типа */
export function replacePreviousGenerationProducts(
  concepts: Concept[],
  previousProductIds: Set<string>,
  catalog: CatalogProduct[],
  brief: string,
  brandColors: string[] = [],
  regenerationSeed = 0,
): Concept[] {
  if (!previousProductIds.size) return concepts;

  const globallyUsed = new Set<string>();
  const globallyUsedVariants = new Set<string>();

  return concepts.map((concept, conceptIndex) => {
    const products = concept.catalogProducts ?? [];
    if (!products.length) return concept;

    const resolved: CatalogProduct[] = products.map((p) => ({ ...p } as CatalogProduct));
    const localTypes = new Set<string>();

    for (const p of resolved) {
      localTypes.add(detectConceptProductType(p));
    }

    let changed = false;
    for (let i = 0; i < resolved.length; i++) {
      const current = resolved[i];
      const blockedByPrevious = previousProductIds.has(current.id);
      const blockedGlobally = isVariantBlocked(current, globallyUsed, globallyUsedVariants);

      if (!blockedByPrevious && !blockedGlobally) {
        registerCrossConceptBlock(current, globallyUsed, globallyUsedVariants);
        continue;
      }

      const currentType = detectConceptProductType(current);
      const altTypes = new Set(localTypes);
      altTypes.delete(currentType);

      const candidates = catalog
        .filter((c) => {
          if (c.id === current.id) return false;
          if (previousProductIds.has(c.id)) return false;
          if (isVariantBlocked(c, globallyUsed, globallyUsedVariants)) return false;
          if (isCorporateSetFiller(c, brief)) return false;
          const type = detectConceptProductType(c);
          if (type !== currentType) return false;
          if (typeConflictsInSet(altTypes, type)) return false;
          return true;
        })
        .sort(
          (a, b) =>
            scoreBriefRelevance(b, brief, brandColors) -
            scoreBriefRelevance(a, brief, brandColors),
        );

      if (!candidates.length) {
        registerCrossConceptBlock(current, globallyUsed, globallyUsedVariants);
        continue;
      }

      const pick =
        candidates[(regenerationSeed + conceptIndex * 17 + i * 3) % candidates.length] ??
        candidates[0];
      resolved[i] = pick;
      localTypes.delete(currentType);
      localTypes.add(detectConceptProductType(pick));
      registerCrossConceptBlock(pick, globallyUsed, globallyUsedVariants);
      changed = true;
    }

    if (!changed) return concept;

    const productIds = resolved.map((p) => p.id);
    const catalogProducts = resolved.map((p, idx) => {
      const prev = concept.catalogProducts?.[idx];
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        productType: prev?.productType ?? detectConceptProductType(p),
        price: p.price,
        stockAvailable: p.stockAvailable,
        colors: prev?.colors ?? [],
        catalogImageUrl: prev?.catalogImageUrl ?? p.catalogImageUrl ?? undefined,
        hasCatalogImage: prev?.hasCatalogImage ?? Boolean(p.catalogImageUrl?.trim()),
        sourceUrl: prev?.sourceUrl ?? null,
      };
    });
    return {
      ...concept,
      catalogProducts,
      productIds,
      previewProductImageUrls: catalogProducts
        .map((p) => p.catalogImageUrl)
        .filter(Boolean) as string[],
    };
  });
}

/** Дозаполняет набор, если после исключения прошлых SKU не хватает позиций */
export function refillConceptsAvoidingPrevious(
  concepts: Concept[],
  previousProductIds: Set<string>,
  catalog: CatalogProduct[],
  desiredCount: number,
  brief: string,
  brandColors: string[] = [],
  regenerationSeed = 0,
): Concept[] {
  if (!previousProductIds.size) return concepts;

  const mandatoryTypes: string[] = [];
  const tracker = new ConceptDiversityTracker(new Set(mandatoryTypes));
  const globallyUsedIds = new Set<string>();
  const globallyUsedVariants = new Set<string>();

  return concepts.map((concept, conceptIndex) => {
    const current = (concept.catalogProducts ?? []) as CatalogProduct[];
    for (const p of current) {
      registerCrossConceptBlock(p, globallyUsedIds, globallyUsedVariants);
    }

    if (current.length >= desiredCount) return concept;

    const blockedIds = new Set([
      ...previousProductIds,
      ...globallyUsedIds,
      ...current.map((p) => p.id),
    ]);
    const blockedVariants = new Set([
      ...globallyUsedVariants,
      ...current.map((p) => productVariantKey(p)),
      ...current.map((p) => productLineKey(p)),
    ]);
    const filled = ensureConceptProducts(
      current,
      catalog.filter(
        (p) =>
          !isVariantBlocked(p, blockedIds, blockedVariants) &&
          !isCorporateSetFiller(p, brief),
      ),
      desiredCount,
      {
        title: concept.title,
        composition: concept.composition ?? concept.description ?? '',
        brief,
        style: concept.style,
      },
      blockedIds,
      blockedVariants,
      tracker,
      regenerationSeed + conceptIndex * 41,
      false,
      (p) => scoreBriefRelevance(p, brief, brandColors),
      mandatoryTypes,
    );

    if (filled.length <= current.length) return concept;

    for (const p of filled) {
      registerCrossConceptBlock(p, globallyUsedIds, globallyUsedVariants);
    }

    const catalogProducts = filled.map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      productType: detectConceptProductType(p),
      price: p.price,
      stockAvailable: p.stockAvailable,
      colors: [] as string[],
      catalogImageUrl: p.catalogImageUrl ?? undefined,
      hasCatalogImage: Boolean(p.catalogImageUrl?.trim()),
      sourceUrl: null as string | null,
    }));

    return {
      ...concept,
      catalogProducts,
      productIds: filled.map((p) => p.id),
      previewProductImageUrls: catalogProducts
        .map((p) => p.catalogImageUrl)
        .filter(Boolean) as string[],
    };
  });
}
