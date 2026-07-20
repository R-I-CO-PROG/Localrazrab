import type { CatalogProduct } from '../providers/llm/catalog.util';
import {
  detectConceptProductType,
  detectMandatoryConceptTypesFromBrief,
  getProductTypeFamily,
  hasMandatoryTypeInProducts,
  mandatoryTypeAliases,
  typeConflictsInSet,
} from '../providers/llm/concept-diversity.util';
import { resolveMandatoryTypesForBrief } from '../requests/mandatory-types.util';
import {
  productVariantKey,
} from '../providers/llm/catalog-variant.util';
import {
  estimateSetTotalPrice,
  enforceSetBudget,
  resolveBudgetPerSet,
} from '../providers/llm/set-budget.util';
import { scoreBriefRelevance, parseBriefForbiddenColors } from '../providers/llm/catalog-brief-relevance.util';
import {
  scoreBrandColorMatch,
  productConflictsBriefPalette,
  productHasForbiddenColor,
  scoreBriefPaletteMatch,
} from '../providers/llm/catalog-color-match.util';
import { scoreProductForBrief, type CatalogFilterInput } from '../providers/llm/catalog-filter.util';
import { indexCatalogByProductType } from '../providers/llm/catalog-slot-picker.util';
import { isBrokenMercaiImageProxy, isLocallyResolvableCatalogImage } from '../products/product-image.util';
import { reconcileBriefConstraints, productViolatesMaterialBan } from '../requests/brief-constraints.util';
import {
  extractRequiredCategoriesFromBrief,
  type RequiredCategoryRequirement,
} from '../requests/brief-required-categories.util';
import {
  countProductsInRequiredCategory,
  productMatchesRequiredCategory,
} from '../catalog/brief-category-buckets.util';
import { detectProductRole, isGiftBundleProduct, roleFamilyForProduct } from './product-role.util';
import { scoreCandidateForSet, type CandidateScoreContext } from './candidate-scoring.util';

/** Допуск превышения бюджета набора (%) */
export const DEFAULT_BUDGET_TOLERANCE_PCT = 2;

/** Макс. одинаковых позиций одного типа (не из «уникальных» ролей) */
export const DEFAULT_SAME_TYPE_CAP = 2;

export type ConstraintViolationCode =
  | 'duplicate_product_id'
  | 'duplicate_variant'
  | 'duplicate_role'
  | 'same_type_overflow'
  | 'budget_exceeded'
  | 'set_size_below_min'
  | 'set_size_above_max'
  | 'missing_price'
  | 'missing_image'
  | 'insufficient_stock'
  | 'forbidden_item'
  | 'color_conflict'
  | 'forbidden_color'
  | 'bright_color_banned'
  | 'low_relevance_junk'
  | 'missing_mandatory_type'
  | 'missing_required_category'
  | 'budget_unreachable'
  | 'bundle_overflow'
  | 'other_type_overflow';

export interface ConstraintViolation {
  code: ConstraintViolationCode;
  message: string;
  productId?: string;
  details?: Record<string, string | number | boolean>;
}

export interface SelectionConstraintsInput {
  userPrompt: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  budgetPerSet?: number | null;
  quantity?: number | null;
  minProductsPerSet: number;
  maxProductsPerSet: number;
  colors: string[];
  allowedItems: string[];
  forbiddenItems: string[];
  budgetTolerancePct?: number;
  sameTypeCap?: number;
  mandatoryTypes?: string[];
  requiredCategories?: RequiredCategoryRequirement[];
}

export interface SelectionRepairAction {
  action: 'removed' | 'replaced' | 'added' | 'trimmed' | 'downgraded';
  reason: string;
  productId?: string;
  replacementId?: string;
  details?: string;
}

export interface SelectionValidationReport {
  valid: boolean;
  violations: ConstraintViolation[];
  repairs: SelectionRepairAction[];
  budgetUsedPct: number | null;
  budgetFitFailed: boolean;
  finalCount: number;
}

/** Семейства ролей: в наборе не больше 1 предмета на семейство */
const UNIQUE_ROLE_FAMILIES: Record<string, string> = {
  bag: 'carry',
  shopper: 'carry',
  backpack: 'carry',
  cap: 'headwear',
  bucket_hat: 'headwear',
  bandana: 'headwear',
  beanie: 'headwear',
  mug: 'drinkware',
  thermos: 'drinkware',
  bottle: 'drinkware',
  thermos_mug: 'drinkware',
  tumbler: 'drinkware',
  tea_set: 'drinkware',
  notebook: 'writing',
  diary: 'writing',
  powerbank: 'powerbank',
  flash: 'usb_storage',
  welcome_pack: 'bundle',
  gift_set: 'bundle',
};

const UNIQUE_ROLE_FAMILY_LIMIT = new Set([
  'carry',
  'headwear',
  'drinkware',
  'writing',
  'powerbank',
  'usb_storage',
  'bundle',
  'pen',
]);

const MAX_OTHER_ROLES_PER_SET = 1;

const JUNK_PRODUCT_PATTERNS: RegExp[] = [
  /набор\s+из\s+\d+\s+инструмент/i,
  /\btire\b/i,
  /шиномонтаж/i,
  /автомобильн\w*\s+инструмент/i,
  /набор\s+ключей/i,
];

const BRIGHT_COLOR_HINTS = ['желт', 'yellow', 'оранж', 'orange', 'розов', 'pink', 'фукси', 'неон', 'ярк'];

function normalizeText(text: unknown): string {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}

function productHaystack(product: CatalogProduct): string {
  return normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''} ${product.category}`);
}

export function getRoleFamily(type: string): string {
  return UNIQUE_ROLE_FAMILIES[type] ?? `type:${type}`;
}

export function getProductRoleFamily(product: CatalogProduct): string {
  return roleFamilyForProduct(product);
}

export function effectiveBudgetCap(budgetPerSet: number, tolerancePct = DEFAULT_BUDGET_TOLERANCE_PCT): number {
  return Math.round(budgetPerSet * (1 + Math.min(tolerancePct, 2) / 100));
}

export function resolveSelectionBudgetPerSet(input: SelectionConstraintsInput): number | null {
  return input.budgetPerSet ?? resolveBudgetPerSet(input.budgetMin ?? null, input.budgetMax ?? null);
}

/** Товар пригоден для показа в концепции: есть цена и реальное фото */
export function hasValidProductPrice(product: CatalogProduct): boolean {
  return product.price != null && product.price > 0;
}

export function hasValidProductImage(product: CatalogProduct): boolean {
  const catalogUrl = product.catalogImageUrl?.trim() ?? '';
  if (!catalogUrl || isBrokenMercaiImageProxy(catalogUrl)) return false;
  if (catalogUrl.includes('/uploads/silhouettes/')) return false;
  if (isLocallyResolvableCatalogImage(catalogUrl)) return true;
  return catalogUrl.startsWith('http://') || catalogUrl.startsWith('https://');
}

export function hasSufficientStock(product: CatalogProduct, tirage: number): boolean {
  if (tirage <= 0) return true;
  const stock = product.stockAvailable ?? 0;
  if (stock <= 0) return true; // TODO: нет данных об остатке — не отсекаем жёстко
  return stock >= tirage;
}

export function briefRejectsBrightColors(brief: string): boolean {
  return /без\s+ярк|не\s+ярк|спокойн|приглушен|muted|no\s+bright/i.test(normalizeText(brief));
}

export function productLooksBright(product: CatalogProduct): boolean {
  const text = productHaystack(product);
  return BRIGHT_COLOR_HINTS.some((hint) => text.includes(hint));
}

export function isLowRelevanceJunk(product: CatalogProduct, brief: string): boolean {
  const text = productHaystack(product);
  const briefNorm = normalizeText(brief);
  if (JUNK_PRODUCT_PATTERNS.some((re) => re.test(text))) {
    if (!/инструмент|tool|авто|машин/i.test(briefNorm)) return true;
  }
  if (scoreBriefRelevance(product, brief) <= -100) return true;
  return false;
}

export function productPassesQualityGate(
  product: CatalogProduct,
  input: SelectionConstraintsInput,
): boolean {
  if (!hasValidProductPrice(product)) return false;
  if (!hasValidProductImage(product)) return false;
  if (!hasSufficientStock(product, input.quantity ?? 0)) return false;
  if (isLowRelevanceJunk(product, input.userPrompt)) return false;

  const { forbiddenItems } = reconcileBriefConstraints(
    input.userPrompt,
    input.allowedItems,
    input.forbiddenItems,
  );
  if (productMatchesForbidden(product, forbiddenItems, input.userPrompt)) return false;

  if (productViolatesBriefColors(product, input)) return false;
  return true;
}

function productMatchesForbidden(product: CatalogProduct, forbiddenItems: string[], userPrompt: string): boolean {
  if (!forbiddenItems.length && !userPrompt) return false;
  const text = productHaystack(product);
  const type = detectConceptProductType(product);
  for (const item of forbiddenItems) {
    const f = normalizeText(item);
    if (f.includes('алкогол') && /алкогол|вино|пив|шампан/i.test(text)) return true;
    if (f.includes('еда') && /еда|продукт|снек|шоколад/i.test(text)) return true;
    if (f.includes('одежд') && /футболк|худи|кепк|одежд|поло/i.test(text)) return true;
    if (f.includes('пластик') && /фляг|flask|пластиков\w*\s+бутыл|многоразов\w*\s+стакан/i.test(text)) {
      return true;
    }
    if (text.includes(f)) return true;
    if (f.includes('одежд') && ['tshirt', 'hoodie', 'cap', 'bucket_hat', 'raincoat'].includes(type)) {
      return true;
    }
  }

  const reconciled = reconcileBriefConstraints(userPrompt, [], forbiddenItems);
  if (
    productViolatesMaterialBan(
      product.name,
      product.description ?? '',
      product.category,
      reconciled.forbiddenMaterials,
    )
  ) {
    return true;
  }

  if (reconciled.qualityFloor === 'premium' && (product.price ?? 0) > 0 && (product.price ?? 0) < 120) {
    if (/стикер|брелок|бейдж|обвес|наклейк/i.test(text)) return true;
  }

  return false;
}

function productViolatesBriefColors(product: CatalogProduct, input: SelectionConstraintsInput): boolean {
  const forbiddenHints = parseBriefForbiddenColors(input.userPrompt);
  if (productHasForbiddenColor(product, forbiddenHints)) return true;
  if (productConflictsBriefPalette(product, input.colors, input.userPrompt, forbiddenHints)) return true;
  if (briefRejectsBrightColors(input.userPrompt) && productLooksBright(product)) {
    const brandMatch = input.colors.length ? scoreBrandColorMatch(product, input.colors) : 0;
    if (brandMatch < 15) return true;
  }
  return false;
}

function resolveRequiredCategories(input: SelectionConstraintsInput): RequiredCategoryRequirement[] {
  return input.requiredCategories ?? extractRequiredCategoriesFromBrief(input.userPrompt);
}

function buildScoreContext(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
  filterInput?: CatalogFilterInput,
  conceptTitle = '',
  conceptComposition = '',
): CandidateScoreContext {
  const presentFamilies = new Set(products.map(roleFamilyForProduct));
  const presentRoles = new Set(products.map((p) => detectProductRole(p).role));
  const bundleCount = products.filter(isGiftBundleProduct).length;
  const otherCount = products.filter((p) => detectProductRole(p).role === 'other').length;
  return {
    userPrompt: input.userPrompt,
    brandColors: input.colors,
    filterInput,
    conceptTitle,
    conceptComposition,
    presentFamilies,
    presentRoles,
    bundleCount,
    otherCount,
  };
}

function scoreCandidate(
  product: CatalogProduct,
  input: SelectionConstraintsInput,
  filterInput?: CatalogFilterInput,
  conceptTitle = '',
  conceptComposition = '',
  currentProducts: CatalogProduct[] = [],
): number {
  const ctx = buildScoreContext(currentProducts, input, filterInput, conceptTitle, conceptComposition);
  return scoreCandidateForSet(product, ctx).total;
}

export function validateSetConstraints(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const budgetPerSet = resolveSelectionBudgetPerSet(input);
  const cap = budgetPerSet != null && budgetPerSet > 0
    ? effectiveBudgetCap(budgetPerSet, input.budgetTolerancePct)
    : null;

  const seenIds = new Set<string>();
  const seenVariants = new Set<string>();
  const roleFamilyCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  const sameTypeCap = input.sameTypeCap ?? DEFAULT_SAME_TYPE_CAP;

  for (const product of products) {
    if (seenIds.has(product.id)) {
      violations.push({
        code: 'duplicate_product_id',
        message: `Дубль productId: ${product.id}`,
        productId: product.id,
      });
    }
    seenIds.add(product.id);

    const vk = productVariantKey(product);
    if (seenVariants.has(vk)) {
      violations.push({
        code: 'duplicate_variant',
        message: `Дубль варианта: ${product.name}`,
        productId: product.id,
      });
    }
    seenVariants.add(vk);

    const type = detectConceptProductType(product);
    const family = roleFamilyForProduct(product);
    const familyUsed = (roleFamilyCount.get(family) ?? 0) + 1;
    roleFamilyCount.set(family, familyUsed);
    if (UNIQUE_ROLE_FAMILY_LIMIT.has(family) && familyUsed > 1) {
      violations.push({
        code: 'duplicate_role',
        message: `Повтор роли «${family}»: ${product.name}`,
        productId: product.id,
        details: { family, type },
      });
    }
    if (family === 'bundle' && familyUsed > 1) {
      violations.push({
        code: 'bundle_overflow',
        message: `Слишком много подарочных наборов: ${product.name}`,
        productId: product.id,
      });
    }

    const role = detectProductRole(product).role;
    const typeUsed = (typeCount.get(role) ?? 0) + 1;
    typeCount.set(role, typeUsed);
    if (role === 'other' && typeUsed > MAX_OTHER_ROLES_PER_SET) {
      violations.push({
        code: 'other_type_overflow',
        message: `Слишком много товаров без роли: ${product.name}`,
        productId: product.id,
      });
    }
    if (!UNIQUE_ROLE_FAMILY_LIMIT.has(family) && typeUsed > sameTypeCap && role !== 'other') {
      violations.push({
        code: 'same_type_overflow',
        message: `Слишком много «${type}»: ${product.name}`,
        productId: product.id,
        details: { type, count: typeUsed },
      });
    }

    if (!hasValidProductPrice(product)) {
      violations.push({ code: 'missing_price', message: `Нет цены: ${product.name}`, productId: product.id });
    }
    if (!hasValidProductImage(product)) {
      violations.push({ code: 'missing_image', message: `Нет фото: ${product.name}`, productId: product.id });
    }
    if (!hasSufficientStock(product, input.quantity ?? 0)) {
      violations.push({
        code: 'insufficient_stock',
        message: `Недостаточно остатка: ${product.name}`,
        productId: product.id,
      });
    }
    if (isLowRelevanceJunk(product, input.userPrompt)) {
      violations.push({
        code: 'low_relevance_junk',
        message: `Нерелевантный товар: ${product.name}`,
        productId: product.id,
      });
    }
    const { forbiddenItems } = reconcileBriefConstraints(
      input.userPrompt,
      input.allowedItems,
      input.forbiddenItems,
    );
    if (productMatchesForbidden(product, forbiddenItems, input.userPrompt)) {
      violations.push({
        code: 'forbidden_item',
        message: `Запрещённая категория: ${product.name}`,
        productId: product.id,
      });
    }
    if (productViolatesBriefColors(product, input)) {
      const forbiddenHints = parseBriefForbiddenColors(input.userPrompt);
      const isForbidden = productHasForbiddenColor(product, forbiddenHints);
      violations.push({
        code: isForbidden ? 'forbidden_color' : 'color_conflict',
        message: isForbidden ? `Запрещённый цвет: ${product.name}` : `Конфликт цвета: ${product.name}`,
        productId: product.id,
      });
    }
  }

  if (cap != null && products.length > 0) {
    const total = estimateSetTotalPrice(products);
    if (total > cap) {
      violations.push({
        code: 'budget_exceeded',
        message: `Сумма ${total} ₽ > лимита ${cap} ₽`,
        details: { total, cap },
      });
    }
  }

  if (products.length < input.minProductsPerSet) {
    violations.push({
      code: 'set_size_below_min',
      message: `В наборе ${products.length} < min ${input.minProductsPerSet}`,
      details: { count: products.length, min: input.minProductsPerSet },
    });
  }
  if (products.length > input.maxProductsPerSet) {
    violations.push({
      code: 'set_size_above_max',
      message: `В наборе ${products.length} > max ${input.maxProductsPerSet}`,
      details: { count: products.length, max: input.maxProductsPerSet },
    });
  }

  const mandatory =
    input.mandatoryTypes ?? detectMandatoryConceptTypesFromBrief(input.userPrompt);
  for (const mt of mandatory) {
    if (!hasMandatoryTypeInProducts(products, mt)) {
      violations.push({
        code: 'missing_mandatory_type',
        message: `Нет обязательного типа: ${mt}`,
        details: { type: mt },
      });
    }
  }

  for (const req of resolveRequiredCategories(input)) {
    const count = countProductsInRequiredCategory(products, req.key);
    if (count < req.minCount) {
      violations.push({
        code: 'missing_required_category',
        message: `Недостаточно «${req.labelRu}»: ${count} < ${req.minCount}`,
        details: { category: req.key, count, min: req.minCount },
      });
    }
  }

  return violations;
}

function canAddToSet(
  product: CatalogProduct,
  current: CatalogProduct[],
  input: SelectionConstraintsInput,
): boolean {
  if (!hasValidProductPrice(product)) return false;
  if (!hasSufficientStock(product, input.quantity ?? 0)) return false;
  if (isLowRelevanceJunk(product, input.userPrompt)) return false;
  if (productViolatesBriefColors(product, input)) return false;
  if (current.some((p) => p.id === product.id)) return false;

  const localTypes = new Set(current.map(detectConceptProductType));
  const type = detectConceptProductType(product);
  if (typeConflictsInSet(localTypes, type)) return false;

  const family = roleFamilyForProduct(product);
  const familyCount = current.filter((p) => roleFamilyForProduct(p) === family).length;
  if (UNIQUE_ROLE_FAMILY_LIMIT.has(family) && familyCount >= 1) return false;

  const role = detectProductRole(product).role;
  if (role === 'other') {
    const otherCount = current.filter((p) => detectProductRole(p).role === 'other').length;
    if (otherCount >= MAX_OTHER_ROLES_PER_SET) return false;
  }

  const sameTypeCount = current.filter((p) => detectProductRole(p).role === role).length;
  const sameTypeCap = input.sameTypeCap ?? DEFAULT_SAME_TYPE_CAP;
  if (!UNIQUE_ROLE_FAMILY_LIMIT.has(family) && sameTypeCount >= sameTypeCap && role !== 'other') {
    return false;
  }

  const variants = new Set(current.map(productVariantKey));
  if (variants.has(productVariantKey(product))) return false;

  return true;
}

function repairWeakProducts(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
  options: FinalizeSelectionOptions,
  repairs: SelectionRepairAction[],
): CatalogProduct[] {
  const result = [...products];
  for (let i = 0; i < result.length; i++) {
    const product = result[i];
    const needsReplace =
      !hasValidProductImage(product) ||
      productViolatesBriefColors(product, input) ||
      isLowRelevanceJunk(product, input.userPrompt) ||
      (isGiftBundleProduct(product) && result.filter(isGiftBundleProduct).length > 1);

    if (!needsReplace) continue;

    const rest = result.filter((_, idx) => idx !== i);
    const reason = !hasValidProductImage(product)
      ? 'missing_image'
      : productViolatesBriefColors(product, input)
        ? 'color_conflict'
        : isGiftBundleProduct(product)
          ? 'bundle_overflow'
          : 'low_relevance';

    const pool = options.catalog.filter(
      (c) => canAddToSet(c, rest, input) && (reason !== 'missing_image' || hasValidProductImage(c)),
    );
    const candidate = pool.sort(
      (a, b) =>
        scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, rest) -
        scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, rest),
    )[0];

    if (candidate) {
      repairs.push({
        action: 'replaced',
        reason,
        productId: product.id,
        replacementId: candidate.id,
        details: `replaced_with_image:${candidate.name.slice(0, 40)}`,
      });
      result[i] = candidate;
      continue;
    }

    repairs.push({
      action: 'removed',
      reason: `${reason}_no_alternative`,
      productId: product.id,
    });
    result.splice(i, 1);
    i -= 1;
  }
  return result;
}

function scoreCandidateInSet(
  product: CatalogProduct,
  input: SelectionConstraintsInput,
  options: FinalizeSelectionOptions,
  products: CatalogProduct[],
): number {
  return scoreCandidate(
    product,
    input,
    options.filterInput,
    options.conceptTitle,
    options.conceptComposition,
    products,
  );
}

function mandatoryCandidatePool(
  mt: string,
  typeIndex: Map<string, CatalogProduct[]>,
  catalog: CatalogProduct[],
): CatalogProduct[] {
  const aliases = mandatoryTypeAliases(mt);
  const pool: CatalogProduct[] = [];
  const seen = new Set<string>();
  for (const alias of aliases) {
    for (const p of typeIndex.get(alias) ?? []) {
      if (!seen.has(p.id)) {
        seen.add(p.id);
        pool.push(p);
      }
    }
    for (const p of catalog) {
      if (detectConceptProductType(p) !== alias) continue;
      if (!seen.has(p.id)) {
        seen.add(p.id);
        pool.push(p);
      }
    }
  }
  return pool;
}

function findReplaceableIndexForMandatory(
  products: CatalogProduct[],
  mt: string,
  input: SelectionConstraintsInput,
  options: FinalizeSelectionOptions,
): number {
  const mandatoryFamily = getProductTypeFamily(mandatoryTypeAliases(mt)[0]);
  let worstIdx = -1;
  let worstScore = Infinity;

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const type = detectConceptProductType(p);
    const family = getProductTypeFamily(type);
    const conflicts =
      mandatoryTypeAliases(mt).includes(type) ||
      family === mandatoryFamily ||
      typeConflictsInSet(new Set(mandatoryTypeAliases(mt)), type);

    if (!conflicts && products.length <= input.minProductsPerSet) continue;

    const score = scoreCandidateInSet(p, input, options, products);
    if (score < worstScore) {
      worstScore = score;
      worstIdx = i;
    }
  }

  if (worstIdx >= 0) return worstIdx;

  for (let i = 0; i < products.length; i++) {
    const score = scoreCandidateInSet(products[i], input, options, products);
    if (score < worstScore) {
      worstScore = score;
      worstIdx = i;
    }
  }
  return worstIdx;
}

function repairMandatoryTypes(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
  options: FinalizeSelectionOptions,
  typeIndex: Map<string, CatalogProduct[]>,
  repairs: SelectionRepairAction[],
): CatalogProduct[] {
  const mandatory =
    input.mandatoryTypes ?? detectMandatoryConceptTypesFromBrief(input.userPrompt);
  let result = [...products];

  for (const mt of mandatory) {
    if (hasMandatoryTypeInProducts(result, mt)) continue;

    const pool = mandatoryCandidatePool(mt, typeIndex, options.catalog)
      .filter((p) => productPassesQualityGate(p, input))
      .sort(
        (a, b) =>
          scoreCandidateInSet(b, input, options, result) -
          scoreCandidateInSet(a, input, options, result),
      );

    let candidate = pool.find((p) => canAddToSet(p, result, input));

    if (!candidate && result.length > 0) {
      const replaceIdx = findReplaceableIndexForMandatory(result, mt, input, options);
      if (replaceIdx >= 0) {
        const rest = result.filter((_, idx) => idx !== replaceIdx);
        candidate = pool.find((p) => canAddToSet(p, rest, input));
        if (candidate) {
          const replaced = result[replaceIdx];
          result = [...result];
          result[replaceIdx] = candidate;
          repairs.push({
            action: 'replaced',
            reason: `mandatory_type:${mt}`,
            productId: replaced.id,
            replacementId: candidate.id,
          });
          continue;
        }
      }
    }

    if (candidate) {
      result.push(candidate);
      repairs.push({
        action: 'added',
        reason: `mandatory_type:${mt}`,
        productId: candidate.id,
      });
    }
  }

  return result;
}

function repairRequiredCategories(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
  options: FinalizeSelectionOptions,
  repairs: SelectionRepairAction[],
): CatalogProduct[] {
  let result = [...products];
  const requirements = resolveRequiredCategories(input);
  if (!requirements.length) return result;

  for (const req of requirements) {
    while (countProductsInRequiredCategory(result, req.key) < req.minCount) {
      const pool = options.catalog
        .filter(
          (p) =>
            productMatchesRequiredCategory(p, req.key) &&
            productPassesQualityGate(p, input),
        )
        .sort(
          (a, b) =>
            scoreCandidateInSet(b, input, options, result) -
            scoreCandidateInSet(a, input, options, result),
        );

      let candidate = pool.find((p) => canAddToSet(p, result, input));

      if (!candidate && result.length > 0) {
        const replaceIdx = result
          .map((p, i) => ({ i, score: scoreCandidateInSet(p, input, options, result) }))
          .sort((a, b) => a.score - b.score)[0]?.i;
        if (replaceIdx != null && replaceIdx >= 0) {
          const rest = result.filter((_, idx) => idx !== replaceIdx);
          candidate = pool.find((p) => canAddToSet(p, rest, input));
          if (candidate) {
            const replaced = result[replaceIdx];
            result = [...result];
            result[replaceIdx] = candidate;
            repairs.push({
              action: 'replaced',
              reason: `required_category:${req.key}`,
              productId: replaced.id,
              replacementId: candidate.id,
            });
            continue;
          }
        }
      }

      if (candidate) {
        result.push(candidate);
        repairs.push({
          action: 'added',
          reason: `required_category:${req.key}`,
          productId: candidate.id,
        });
      } else {
        break;
      }
    }
  }

  return result;
}

export interface FinalizeSelectionOptions {
  catalog: CatalogProduct[];
  filterInput?: CatalogFilterInput;
  conceptTitle?: string;
  conceptComposition?: string;
  typeIndex?: Map<string, CatalogProduct[]>;
  seed?: number;
  maxRepairRounds?: number;
}

export function dedupeSetByRoles(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
): { products: CatalogProduct[]; removed: SelectionRepairAction[] } {
  const removed: SelectionRepairAction[] = [];
  const kept: CatalogProduct[] = [];
  const roleFamilyCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  const seenIds = new Set<string>();
  const seenVariants = new Set<string>();
  const sameTypeCap = input.sameTypeCap ?? DEFAULT_SAME_TYPE_CAP;

  const sorted = [...products].sort((a, b) =>
    scoreCandidate(b, input, undefined, '', '', products) -
    scoreCandidate(a, input, undefined, '', '', products),
  );

  for (const product of sorted) {
    if (seenIds.has(product.id)) {
      removed.push({ action: 'removed', reason: 'duplicate_product_id', productId: product.id });
      continue;
    }
    const vk = productVariantKey(product);
    if (seenVariants.has(vk)) {
      removed.push({ action: 'removed', reason: 'duplicate_variant', productId: product.id });
      continue;
    }
    if (!productPassesQualityGate(product, input)) {
      removed.push({ action: 'removed', reason: 'quality_gate', productId: product.id });
      continue;
    }

    const type = detectConceptProductType(product);
    const family = roleFamilyForProduct(product);
    const familyUsed = roleFamilyCount.get(family) ?? 0;
    if (UNIQUE_ROLE_FAMILY_LIMIT.has(family) && familyUsed >= 1) {
      removed.push({ action: 'removed', reason: `duplicate_role:${family}`, productId: product.id });
      continue;
    }
    const role = detectProductRole(product).role;
    const typeUsed = typeCount.get(role) ?? 0;
    if (role === 'other' && typeUsed >= MAX_OTHER_ROLES_PER_SET) {
      removed.push({ action: 'removed', reason: 'other_type_overflow', productId: product.id });
      continue;
    }
    if (!UNIQUE_ROLE_FAMILY_LIMIT.has(family) && typeUsed >= sameTypeCap && role !== 'other') {
      removed.push({ action: 'removed', reason: `same_type_overflow:${type}`, productId: product.id });
      continue;
    }

    kept.push(product);
    seenIds.add(product.id);
    seenVariants.add(vk);
    roleFamilyCount.set(family, familyUsed + 1);
    typeCount.set(role, typeUsed + 1);
  }

  return { products: kept, removed };
}

export function finalizeConceptSelection(
  initial: CatalogProduct[],
  input: SelectionConstraintsInput,
  options: FinalizeSelectionOptions,
): { products: CatalogProduct[]; report: SelectionValidationReport } {
  const repairs: SelectionRepairAction[] = [];
  const budgetPerSet = resolveSelectionBudgetPerSet(input);
  const budgetCap =
    budgetPerSet != null && budgetPerSet > 0
      ? effectiveBudgetCap(budgetPerSet, input.budgetTolerancePct)
      : null;

  let products = [...initial];
  const typeIndex = options.typeIndex ?? indexCatalogByProductType(options.catalog);
  const maxRounds = options.maxRepairRounds ?? 3;

  for (let round = 0; round < maxRounds; round++) {
    products = repairWeakProducts(products, input, options, repairs);

    const deduped = dedupeSetByRoles(products, input);
    products = deduped.products;
    repairs.push(...deduped.removed);

    if (products.length > input.maxProductsPerSet) {
      products = products
        .sort(
          (a, b) =>
            scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, products) -
            scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, products),
        )
        .slice(0, input.maxProductsPerSet);
      repairs.push({ action: 'trimmed', reason: `trim_to_max_${input.maxProductsPerSet}` });
    }

    if (budgetCap != null && products.length > 0 && estimateSetTotalPrice(products) > budgetCap) {
      const before = estimateSetTotalPrice(products);
      products = enforceSetBudget(
        products,
        options.catalog,
        budgetCap,
        new Set(products.map((p) => p.id)),
        new Set(products.map(productVariantKey)),
        (options.seed ?? 0) + round * 17,
      );
      repairs.push({
        action: 'downgraded',
        reason: `budget_enforce ${before}→${estimateSetTotalPrice(products)}`,
      });
    }

    products = repairMandatoryTypes(products, input, options, typeIndex, repairs);
    products = repairRequiredCategories(products, input, options, repairs);

    while (products.length < input.minProductsPerSet) {
      const imagePool = options.catalog.filter((p) => hasValidProductImage(p));
      const fillCatalog = imagePool.length >= input.minProductsPerSet ? imagePool : options.catalog;
      const candidate = fillCatalog
        .filter((p) => canAddToSet(p, products, input))
        .sort(
          (a, b) =>
            scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, products) -
            scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, products),
        )[0];
      if (!candidate) break;
      products.push(candidate);
      repairs.push({ action: 'added', reason: 'fill_min_count', productId: candidate.id });
    }

    const violations = validateSetConstraints(products, input);
    const hardLeft = violations.filter((v) =>
      [
        'duplicate_product_id',
        'duplicate_variant',
        'duplicate_role',
        'same_type_overflow',
        'budget_exceeded',
        'bundle_overflow',
        'color_conflict',
        'forbidden_color',
        'missing_required_category',
        'missing_image',
        'other_type_overflow',
      ].includes(v.code),
    );
    if (hardLeft.length === 0) break;
  }

  if (budgetCap != null && products.length > 0 && estimateSetTotalPrice(products) > budgetCap) {
    products = enforceSetBudget(
      products,
      options.catalog,
      budgetCap,
      new Set(),
      new Set(),
      options.seed ?? 0,
    );
    repairs.push({ action: 'downgraded', reason: 'final_budget_cap' });
  }

  const violations = validateSetConstraints(products, input);
  const total = products.length > 0 ? estimateSetTotalPrice(products) : 0;
  const budgetUsedPct =
    budgetPerSet != null && budgetPerSet > 0 && products.length > 0
      ? Math.round((total / budgetPerSet) * 100)
      : null;

  const budgetFitFailed =
    budgetCap != null &&
    products.length > 0 &&
    total > budgetCap;

  const softOnly = violations.every((v) =>
    ['set_size_below_min', 'missing_mandatory_type', 'budget_unreachable'].includes(v.code),
  );

  return {
    products,
    report: {
      valid: violations.length === 0 || (softOnly && !budgetFitFailed),
      violations,
      repairs,
      budgetUsedPct,
      budgetFitFailed,
      finalCount: products.length,
    },
  };
}

export function selectionConstraintsFromFilterInput(
  filterInput: CatalogFilterInput,
  countBounds: { min: number; max: number },
): SelectionConstraintsInput {
  return {
    userPrompt: filterInput.userPrompt,
    budgetMin: filterInput.budgetMin,
    budgetMax: filterInput.budgetMax,
    budgetPerSet: filterInput.budgetPerSet,
    quantity: filterInput.quantity,
    minProductsPerSet: countBounds.min,
    maxProductsPerSet: countBounds.max,
    colors: filterInput.colors,
    allowedItems: filterInput.allowedItems,
    forbiddenItems: filterInput.forbiddenItems,
    mandatoryTypes: resolveMandatoryTypesForBrief(filterInput.userPrompt),
    requiredCategories: extractRequiredCategoriesFromBrief(filterInput.userPrompt),
  };
}

export function scoreConceptSetQuality(
  report: SelectionValidationReport,
  products: CatalogProduct[],
): number {
  let score = 85;
  score -= report.violations.length * 8;
  score -= report.budgetFitFailed ? 25 : 0;
  if (report.budgetUsedPct != null) {
    if (report.budgetUsedPct > 102) score -= 20;
    else if (report.budgetUsedPct >= 70) score += 5;
  }
  const withImage = products.filter(hasValidProductImage).length;
  const imageRatio = products.length > 0 ? withImage / products.length : 0;
  score += Math.round(imageRatio * 15);
  if (imageRatio < 1) score -= Math.round((1 - imageRatio) * 40);

  const roles = new Set(products.map((p) => detectProductRole(p).role));
  score += Math.min(12, roles.size * 2);
  const bundleCount = products.filter(isGiftBundleProduct).length;
  if (bundleCount > 1) score -= 25;

  return Math.max(0, Math.min(100, Math.round(score)));
}
