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
  productLineKey,
  crossConceptLineKeys,
  isCrossConceptLineBlocked,
} from '../providers/llm/catalog-variant.util';
import {
  estimateSetTotalPrice,
  enforceSetBudget,
  resolveBudgetPerSet,
  resolveSetBudgetRange,
} from '../providers/llm/set-budget.util';
import { scoreBriefRelevance, parseBriefForbiddenColors, buildBriefRelevanceContext, scoreBriefRelevanceWithContext } from '../providers/llm/catalog-brief-relevance.util';
import {
  scoreBrandColorMatch,
  productConflictsBriefPalette,
  productHasForbiddenColor,
  colorCriticalClash,
  scoreBriefPaletteMatch,
} from '../providers/llm/catalog-color-match.util';
import { scoreProductForBrief, type CatalogFilterInput } from '../providers/llm/catalog-filter.util';
import { productMatchesForbidden as matchesUniversalForbidden } from '../providers/llm/catalog-forbidden-match.util';
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
  normalizeBriefAllowedBuckets,
  productMatchesAllowedBucket,
} from '../catalog/brief-category-buckets.util';
import {
  detectProductRole,
  isCorporateSetFiller,
  isGiftBundleProduct,
  roleFamilyForProduct,
  briefAllowsTowels,
} from './product-role.util';
import { familyForType } from './product-taxonomy';
import { scoreCandidateForSet, type CandidateScoreContext } from './candidate-scoring.util';

/** Допуск превышения бюджета набора (%) */
export const DEFAULT_BUDGET_TOLERANCE_PCT = 5;

/** Макс. одинаковых позиций одного типа (не из «уникальных» ролей) */
export const DEFAULT_SAME_TYPE_CAP = 3;

/** Кап для «отображаемых» типов, которые тестер считает дублями */
export const DISPLAY_TYPE_CAP = 1;

// «apparel» и «tech» НАМЕРЕННО убраны отсюда (были): TYPE_META даёт tshirt/hoodie/raincoat/
// sunglasses и headphones/speaker/watch/tech_accessory/flash КАЖДОМУ своё unique:<slug>-семейство
// именно затем, чтобы футболка+худи или наушники+колонка МОГЛИ сосуществовать в одном наборе.
// Коллапс в общий displayType «apparel»/«tech» с капом=1 перекрывал это намерение (isCappedToOne
// уже верно капит КАЖДОЕ уникальное семейство по отдельности — двойной, противоречащий гейт был
// лишним). Остальные записи ниже НЕ убраны: их семейства (drinkware/carry/writing/pen/powerbank)
// УЖЕ общие (не unique:*), так что коллапс здесь корректно отражает исходное намерение.
const DISPLAY_CAPPED_TYPES = new Set([
  'drinkware',
  'notebook',
  'bag',
  'pen',
  'headwear',
  'powerbank',
]);

export interface SetRelaxationConfig {
  level: number;
  skipPaletteQuota?: boolean;
  skipThematicScoring?: boolean;
  skipBrightDullHeuristics?: boolean;
  skipMissingMandatoryCategories?: boolean;
  cosmeticOnly?: boolean;
  relaxedAspects?: string[];
}

export interface BuildSetWithRelaxationInput {
  constraints: SelectionConstraintsInput;
  options: FinalizeSelectionOptions;
  initial?: CatalogProduct[];
  targetCount: number;
  onLog?: (message: string) => void;
}

export interface BuildSetWithRelaxationResult {
  products: CatalogProduct[];
  level: number;
  relaxed: string[];
}

/** Тип для капа дублей в наборе (drinkware, notebook, …) */
export function displayTypeForCap(product: CatalogProduct): string {
  const role = detectProductRole(product);
  if (role.legacyType === 'powerbank' || role.role === 'powerbank') return 'powerbank';
  if (role.isTech || role.role === 'tech_accessory') return 'tech';
  if (role.role === 'pen' || (role.role === 'writing' && /ручк|pen|карандаш/i.test(product.name))) {
    return 'pen';
  }
  if (role.role === 'notebook' || role.legacyType === 'notebook' || role.legacyType === 'diary') {
    return 'notebook';
  }
  if (role.role === 'drinkware') return 'drinkware';
  if (role.role === 'bag') return 'bag';
  if (role.role === 'headwear') return 'headwear';
  if (role.role === 'apparel' || role.role === 'scarf') return 'apparel';
  return role.role;
}

export function isDisplayCappedType(displayType: string): boolean {
  return DISPLAY_CAPPED_TYPES.has(displayType);
}

function effectiveDisplayTypeCap(product: CatalogProduct, _input: SelectionConstraintsInput): number {
  // Для всех «отображаемых» типов кап всегда 1 — независимо от relaxation и sameTypeCap.
  // Это предотвращает блокеры дублей (2× drinkware, 2× bag и т.д.) на этапе отбора.
  if (isDisplayCappedType(displayTypeForCap(product))) return DISPLAY_TYPE_CAP;
  return DEFAULT_SAME_TYPE_CAP;
}

/** Проверяет, не превышен ли кап данного displayType в уже выбранных продуктах */
export function wouldExceedDisplayTypeCap(
  candidate: CatalogProduct,
  selected: CatalogProduct[],
): boolean {
  const dtype = displayTypeForCap(candidate);
  if (!isDisplayCappedType(dtype)) return false;
  const count = selected.filter(p => displayTypeForCap(p) === dtype).length;
  return count >= DISPLAY_TYPE_CAP;
}

export type ConstraintViolationCode =
  | 'duplicate_product_id'
  | 'duplicate_variant'
  | 'duplicate_role'
  | 'duplicate_catalog_category'
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
  | 'other_type_overflow'
  | 'not_in_allowed_bucket';

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
  /** true → whitelist пришёл из СВОБОДНОГО ТЕКСТА брифа (illustrative «плед, чай»), можно смягчать
   *  not_in_allowed_bucket до floor. false/undefined → ЯВНОЕ UI-ограничение категории («Посуда»):
   *  жёсткий whitelist, зонты в «только Посуда» не возвращаем. */
  allowedBucketSoft?: boolean;
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

/** Семейства, в которых допустим максимум 1 предмет на набор (из единой таксономии). */
const UNIQUE_ROLE_FAMILY_LIMIT = new Set([
  'carry',
  'headwear',
  'drinkware',
  'writing',
  'powerbank',
  'usb_storage',
  'bundle',
  'pen',
  'packaging',
]);

/**
 * Семейство допускает максимум 1 предмет на набор: либо общее «уникальное»
 * семейство (drinkware/carry/…), либо `unique:<slug>` из таксономии
 * (полотенце, плед, шарф, футболка…). Иначе будет «полотенце+полотенце».
 */
function isCappedToOne(family: string): boolean {
  return family.startsWith('unique:') || [...UNIQUE_ROLE_FAMILY_LIMIT].includes(family);
}

export function maxOtherRolesForSet(input: Pick<SelectionConstraintsInput, 'maxProductsPerSet'>): number {
  return Math.max(2, Math.ceil(input.maxProductsPerSet * 0.6));
}

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

const PLAIN_QUALIFIER_RE = /обычн|plain|basic|привычн|канцелярск|базов|standard/i;
const PREMIUM_STATIONERY_RE =
  /премиум|premium|кож|кожан|wood|орех|metal|металл|бамбук|подарочн|vip|executive|revello|metropol|rivista/i;

function isPlainNotebookProduct(product: CatalogProduct): boolean {
  const type = detectConceptProductType(product);
  const role = detectProductRole(product).role;
  const text = productHaystack(product);
  if (type !== 'notebook' && role !== 'notebook' && !/блокнот|ежедневник|еженедельник|планер/i.test(text)) {
    return false;
  }
  if (PREMIUM_STATIONERY_RE.test(text)) return false;
  if ((product.price ?? 0) >= 900) return false;
  return true;
}

function isPlainPenProduct(product: CatalogProduct): boolean {
  const type = detectConceptProductType(product);
  const role = detectProductRole(product).role;
  const text = productHaystack(product);
  if (type !== 'pen' && role !== 'pen' && !/\bручк|карандаш|\bpen\b/i.test(text)) {
    return false;
  }
  if (/премиум|premium|metal|металл|бамбук|подарочн|vip|executive/i.test(text)) return false;
  if ((product.price ?? 0) >= 700) return false;
  return true;
}

function briefBansPlainStationery(userPrompt: string): boolean {
  const p = normalizeText(userPrompt);
  return (
    /исключ\w*.*(обычн|plain|basic|привычн|канцелярск)/.test(p) ||
    /без\s+(обычн|plain|basic|привычн|канцелярск)/.test(p) ||
    /(обычн|plain|basic|привычн|канцелярск).*(блокнот|ручк|канцеляр)/.test(p)
  );
}

function matchesQualifiedForbiddenItem(
  forbiddenPhrase: string,
  product: CatalogProduct,
  userPrompt: string,
): boolean {
  const f = normalizeText(forbiddenPhrase);
  const plainContext = PLAIN_QUALIFIER_RE.test(f) || briefBansPlainStationery(userPrompt);

  if (f.includes('блокнот') || f.includes('ежедневник') || f.includes('еженедельник')) {
    if (plainContext || f.includes('обычн')) return isPlainNotebookProduct(product);
  }
  if (f.includes('ручк') || f.includes('карандаш')) {
    if (plainContext || f.includes('обычн')) return isPlainPenProduct(product);
  }
  if (f.includes('канцеляр') && plainContext) {
    return (
      isPlainNotebookProduct(product) ||
      isPlainPenProduct(product) ||
      /стикер|скрепк|кнопк|eraser|ластик/i.test(productHaystack(product))
    );
  }
  return false;
}

function sharesCrossConceptLine(a: CatalogProduct, b: CatalogProduct, brief = ''): boolean {
  const bKeys = new Set(crossConceptLineKeys(b, brief));
  return crossConceptLineKeys(a, brief).some((lk) => bKeys.has(lk));
}

function setHasCrossConceptLine(product: CatalogProduct, selected: CatalogProduct[], brief = ''): boolean {
  return selected.some((p) => sharesCrossConceptLine(product, p, brief));
}

function addLineKeysToSet(keys: Set<string>, product: CatalogProduct): void {
  for (const lk of crossConceptLineKeys(product)) keys.add(lk);
}

export function getRoleFamily(type: string): string {
  return familyForType(type);
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

/** Минимальная цена одной позиции — чтобы набор не состоял из мелочи при нормальном бюджете. */
export function minUnitPriceForSet(
  input: Pick<SelectionConstraintsInput, 'budgetMin' | 'budgetMax' | 'budgetPerSet' | 'minProductsPerSet'>,
): number {
  const budgetPerSet = resolveSelectionBudgetPerSet(input as SelectionConstraintsInput);
  if (budgetPerSet == null || budgetPerSet <= 0) return 50;
  const { floor } = resolveSetBudgetRange(input.budgetMin ?? null, budgetPerSet);
  const slots = Math.max(input.minProductsPerSet ?? 3, 3);
  const effectiveFloor = Math.max(floor, Math.round(budgetPerSet * 0.72));
  const perSlot = effectiveFloor / slots;
  const ratio = budgetPerSet <= 2500 ? 0.76 : 0.58;
  const minFloor = budgetPerSet <= 2500 ? 140 : 80;
  return Math.max(minFloor, Math.floor(perSlot * ratio));
}

const TEXTILE_CATALOG_CATEGORY_RE = /текстил|банн|туалетн/i;

function catalogCategoryNorm(product: CatalogProduct): string {
  return normalizeText(product.category);
}

function isTextileCatalogCategory(categoryNorm: string): boolean {
  return TEXTILE_CATALOG_CATEGORY_RE.test(categoryNorm);
}

function briefAllowsTextileCatalogItems(userPrompt: string): boolean {
  if (briefAllowsTowels(userPrompt)) return true;
  const p = normalizeText(userPrompt);
  // IT/хакатон: «мерч» без явной одежды — не разрешаем текстиль каталога (полотенца/салфетки).
  if (/разработчик|хакатон|hackathon|(?<![а-яёa-z])it(?![а-яёa-z])|айти|tech|кодер|coder|программист|software|devops/i.test(p)) {
    return /футболк|худи|кепк|панам|одежд|apparel|textile|wearable/i.test(p);
  }
  return /мерч|одежд|футболк|худи|кепк|панам|textile|apparel/i.test(p);
}

function countTextileCatalogProducts(products: CatalogProduct[]): number {
  return products.filter((p) => isTextileCatalogCategory(catalogCategoryNorm(p))).length;
}

/** Не более одного предмета из «Текстиль/банные» категорий каталога (судья role-dup). */
export function wouldExceedTextileCatalogCap(
  candidate: CatalogProduct,
  selected: CatalogProduct[],
  userPrompt: string,
): boolean {
  if (briefAllowsTextileCatalogItems(userPrompt)) return false;
  if (!isTextileCatalogCategory(catalogCategoryNorm(candidate))) return false;
  return countTextileCatalogProducts(selected) >= 1;
}

/** Повтор «уникального» семейства роли (drinkware/carry/… или unique:*) в одном наборе. */
export function wouldExceedUniqueRoleFamilyCap(
  candidate: CatalogProduct,
  selected: CatalogProduct[],
): boolean {
  const family = roleFamilyForProduct(candidate);
  if (!isCappedToOne(family)) return false;
  return selected.some((p) => roleFamilyForProduct(p) === family);
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
  const stock = product.stockAvailable;
  if (stock != null && stock <= 0) return false;
  if (tirage <= 0) return stock == null || stock > 0;
  if (stock == null) return true;
  return stock >= tirage;
}

/** Ослаблённая проверка остатка при доборе: достаточно stock > 0 */
export function hasRelaxedStock(product: CatalogProduct): boolean {
  const stock = product.stockAvailable;
  if (stock == null) return true;
  return stock > 0;
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
  if (isCorporateSetFiller(product, brief)) return true;
  if (JUNK_PRODUCT_PATTERNS.some((re) => re.test(text))) {
    if (!/инструмент|tool|авто|машин/i.test(briefNorm)) return true;
  }
  const relevance = scoreBriefRelevance(product, brief);
  // СЕМАНТИЧЕСКАЯ АМНИСТИЯ: rule-порог tech/eco (keyword-релевантность) глушил семантически-
  // профильный товар, который pgvector поднял (semanticFit≥0), но keyword-match низкий. Именно на
  // tech/eco семантика и должна помогать — не режем junk-гейтом то, что смысл считает уместным.
  const semFit = (product as { semanticFit?: number | null }).semanticFit;
  const semanticallyFit = semFit != null && semFit >= 0;
  const techBrief = /разработчик|хакатон|hackathon|(?<![а-яёa-z])it(?![а-яёa-z])|айти|tech|кодер|coder|программист/i.test(briefNorm);
  const ecoBrief = /эко|eco|устойчив|переработ|biodegradable|sustainable/i.test(briefNorm);
  if (!semanticallyFit && techBrief && relevance < 38) return true;
  if (!semanticallyFit && ecoBrief && relevance < 24) return true;
  if (relevance <= -100) return true;
  return false;
}

export function productPassesQualityGate(
  product: CatalogProduct,
  input: SelectionConstraintsInput,
): boolean {
  if (!hasValidProductPrice(product)) return false;
  if (!hasValidProductImage(product)) return false;
  if (!hasSufficientStock(product, input.quantity ?? 0)) return false;
  if (isCorporateSetFiller(product, input.userPrompt)) return false;
  if (isLowRelevanceJunk(product, input.userPrompt)) return false;
  const minUnit = minUnitPriceForSet(input);
  if ((product.price ?? 0) > 0 && (product.price ?? 0) < minUnit) return false;

  const { forbiddenItems } = reconcileBriefConstraints(
    input.userPrompt,
    input.allowedItems,
    input.forbiddenItems,
  );
  if (productMatchesForbidden(product, forbiddenItems, input.userPrompt, input.budgetMax ?? input.budgetPerSet)) return false;

  if (productViolatesBriefColors(product, input)) return false;
  return true;
}

function productMatchesForbidden(
  product: CatalogProduct,
  forbiddenItems: string[],
  userPrompt: string,
  budgetMax?: number | null,
): boolean {
  if (!forbiddenItems.length && !userPrompt) return false;
  // ЕДИНЫЙ сильный матчер (семьи powerbank/колонки/еда/алкоголь/чай-кофе, кириллица+латиница, стеммер):
  // делегируем, но КАНЦЕЛЯРИЮ с квалификатором «обычные» разбирает локальная логика ниже (plain vs
  // premium) — иначе универсальный забанил бы и премиум-блокнот при «исключить обычные блокноты».
  if (forbiddenItems.length) {
    const STATIONERY_RE = /блокнот|ежедневник|еженедельник|(?<![а-я])планер|(?<![а-я])ручк|карандаш|канцеляр/;
    const plainCtx = briefBansPlainStationery(userPrompt);
    const universalTerms = forbiddenItems.filter((f) => {
      const n = normalizeText(f);
      return !(STATIONERY_RE.test(n) && (plainCtx || PLAIN_QUALIFIER_RE.test(n)));
    });
    if (universalTerms.length && matchesUniversalForbidden(product, universalTerms)) return true;
  }
  const text = productHaystack(product);
  const type = detectConceptProductType(product);
  for (const item of forbiddenItems) {
    if (matchesQualifiedForbiddenItem(item, product, userPrompt)) return true;

    const f = normalizeText(item);
    if (f.includes('алкогол') && /алкогол|вино|пив|шампан/i.test(text)) return true;
    if (f.includes('еда') && /еда|продукт|снек|шоколад/i.test(text)) return true;
    if (f.includes('одежд') && /футболк|худи|кепк|одежд|поло/i.test(text)) return true;
    if (f.includes('пластик') && /фляг|flask|пластиков\w*\s+бутыл|многоразов\w*\s+стакан/i.test(text)) {
      return true;
    }
    // «ручки» / «блокноты» без квалификатора «обычные» — не баним весь тип
    if ((f === 'ручки' || f === 'ручка' || f === 'блокноты' || f === 'блокнот') && briefBansPlainStationery(userPrompt)) {
      if (f.includes('ручк') && isPlainPenProduct(product)) return true;
      if (f.includes('блокнот') && isPlainNotebookProduct(product)) return true;
      continue;
    }
    if (text.includes(f)) return true;
    if (f.includes('одежд') && ['tshirt', 'hoodie', 'cap', 'bucket_hat', 'raincoat'].includes(type)) {
      return true;
    }
  }

  // budgetMax прокинут вызывающей стороной — без него qualityFloor='premium' от размера бюджета
  // (не только явных слов «премиум») никогда не выводился, и штраф на копеечные стикеры/брелоки
  // при большом бюджете был мёртвым кодом.
  const reconciled = reconcileBriefConstraints(userPrompt, [], forbiddenItems, budgetMax);
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

function productViolatesBriefColors(
  product: CatalogProduct,
  input: SelectionConstraintsInput,
  skipBrightDull = false,
): boolean {
  const forbiddenHints = parseBriefForbiddenColors(input.userPrompt);
  if (productHasForbiddenColor(product, forbiddenHints)) return true;
  if (productConflictsBriefPalette(product, input.colors, input.userPrompt, forbiddenHints)) return true;
  if (!skipBrightDull && briefRejectsBrightColors(input.userPrompt) && productLooksBright(product)) {
    const brandMatch = input.colors.length ? scoreBrandColorMatch(product, input.colors) : 0;
    if (brandMatch < 15) return true;
  }
  return false;
}

function resolveRequiredCategories(
  input: SelectionConstraintsInput,
  catalog?: CatalogProduct[],
  skipMissingInCatalog = false,
  onLog?: (message: string) => void,
): RequiredCategoryRequirement[] {
  const all = input.requiredCategories ?? extractRequiredCategoriesFromBrief(input.userPrompt);
  if (!skipMissingInCatalog || !catalog?.length) return all;
  return all.filter((req) => {
    const found = catalog.some((p) => productMatchesRequiredCategory(p, req.key));
    if (!found) onLog?.(`category ${req.key} not found in catalog`);
    return found;
  });
}

function buildScoreContext(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
  filterInput?: CatalogFilterInput,
  conceptTitle = '',
  conceptComposition = '',
  skipThematicScoring = false,
): CandidateScoreContext {
  const presentFamilies = new Set(products.map(roleFamilyForProduct));
  const presentRoles = new Set(products.map((p) => detectProductRole(p).role));
  const presentDisplayTypes = new Set(products.map(displayTypeForCap));
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
    presentDisplayTypes,
    bundleCount,
    otherCount,
    maxOtherRoles: maxOtherRolesForSet(input),
    skipThematicScoring,
  };
}

function scoreCandidate(
  product: CatalogProduct,
  input: SelectionConstraintsInput,
  filterInput?: CatalogFilterInput,
  conceptTitle = '',
  conceptComposition = '',
  currentProducts: CatalogProduct[] = [],
  skipThematicScoring = false,
): number {
  const ctx = buildScoreContext(
    currentProducts,
    input,
    filterInput,
    conceptTitle,
    conceptComposition,
    skipThematicScoring,
  );
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
  const seenLineKeys = new Set<string>();
  const roleFamilyCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  const displayTypeCount = new Map<string, number>();
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

    const productLineKeys = crossConceptLineKeys(product);
    const duplicateLine = productLineKeys.some((key) => seenLineKeys.has(key));
    if (duplicateLine) {
      violations.push({
        code: 'duplicate_variant',
        message: `Дубль линейки товара: ${product.name}`,
        productId: product.id,
      });
    }
    for (const key of productLineKeys) seenLineKeys.add(key);

    const type = detectConceptProductType(product);
    const family = roleFamilyForProduct(product);
    const familyUsed = (roleFamilyCount.get(family) ?? 0) + 1;
    roleFamilyCount.set(family, familyUsed);
    if (isCappedToOne(family) && familyUsed > 1) {
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
    const displayType = displayTypeForCap(product);
    const displayUsed = (displayTypeCount.get(displayType) ?? 0) + 1;
    displayTypeCount.set(displayType, displayUsed);
    if (isDisplayCappedType(displayType) && displayUsed > DISPLAY_TYPE_CAP) {
      violations.push({
        code: 'same_type_overflow',
        message: `Слишком много «${displayType}»: ${product.name}`,
        productId: product.id,
        details: { type: displayType, count: displayUsed },
      });
    }

    const typeUsed = (typeCount.get(role) ?? 0) + 1;
    typeCount.set(role, typeUsed);
    if (role === 'other' && typeUsed > maxOtherRolesForSet(input)) {
      violations.push({
        code: 'other_type_overflow',
        message: `Слишком много товаров без роли: ${product.name}`,
        productId: product.id,
      });
    }
    if (
      !isDisplayCappedType(displayType) &&
      !isCappedToOne(family) &&
      typeUsed > sameTypeCap &&
      role !== 'other'
    ) {
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
    const minUnit = minUnitPriceForSet(input);
    if ((product.price ?? 0) > 0 && (product.price ?? 0) < minUnit) {
      violations.push({
        code: 'budget_unreachable',
        message: `Слишком дешёвая позиция для бюджета: ${product.name} (${product.price}₽ < ${minUnit}₽)`,
        productId: product.id,
      });
    }
    if (wouldExceedTextileCatalogCap(product, products.filter((x) => x.id !== product.id), input.userPrompt)) {
      violations.push({
        code: 'duplicate_catalog_category',
        message: `Повтор текстильной категории каталога: ${product.name}`,
        productId: product.id,
      });
    }
    const { forbiddenItems } = reconcileBriefConstraints(
      input.userPrompt,
      input.allowedItems,
      input.forbiddenItems,
    );
    if (productMatchesForbidden(product, forbiddenItems, input.userPrompt, input.budgetMax ?? input.budgetPerSet)) {
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
  if (budgetPerSet != null && budgetPerSet > 0 && products.length > 0) {
    const { floor } = resolveSetBudgetRange(input.budgetMin, budgetPerSet);
    const total = estimateSetTotalPrice(products);
    if (floor > 0 && total < floor * 0.95) {
      violations.push({
        code: 'budget_unreachable',
        message: `Сумма ${Math.round(total)} ₽ < floor ${Math.round(floor)} ₽`,
        details: { total, floor },
      });
    }
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

/**
 * Жёсткое нарушение уровня ОДНОГО товара — «обещание пользователю», которое не должно попасть в
 * набор ни одним путём подбора. null — товар чист. Порядок = приоритет причины в логе.
 */
function itemHardViolation(
  product: CatalogProduct,
  input: SelectionConstraintsInput,
): ConstraintViolationCode | null {
  if (!hasValidProductPrice(product)) return 'missing_price';
  if (!hasValidProductImage(product)) return 'missing_image';
  // ЯВНО НУЛЕВОЙ ОСТАТОК — всегда вон, даже на брифе БЕЗ тиража (21% каталога имеет stock=0).
  // Раньше сток проверялся только через тираж-шаг (tirage>0), поэтому на брифах без тиража
  // недоступный товар доезжал до набора: broadCatalog минует filterCatalogForRequest (где этот
  // гейт есть), а relaxed()/fullCatalog-доборы тянут его напрямую. stock==null = «неизвестен» =
  // доступен (контракт hasRelaxedStock). Для ОБЯЗАТЕЛЬНЫХ типов вызывающий делает исключение.
  if (!hasRelaxedStock(product)) return 'insufficient_stock';
  const { forbiddenItems } = reconcileBriefConstraints(
    input.userPrompt,
    input.allowedItems,
    input.forbiddenItems,
  );
  if (productMatchesForbidden(product, forbiddenItems, input.userPrompt, input.budgetMax ?? input.budgetPerSet)) return 'forbidden_item';
  const forbiddenColorHints = parseBriefForbiddenColors(input.userPrompt);
  if (productHasForbiddenColor(product, forbiddenColorHints)) return 'forbidden_color';
  if (colorCriticalClash(product, input.colors)) return 'color_conflict';
  // Мягче colorCriticalClash (которая гейтует только цвето-критичные ТИПЫ — плед/сумка/посуда):
  // productConflictsBriefPalette ловит явный конфликт палитры брифа («тёмные тона» vs светлый товар,
  // земляные тона vs кислотный) НЕЗАВИСИМО от типа товара — раньше это была только скоринг-подсказка.
  if (productConflictsBriefPalette(product, input.colors, input.userPrompt, forbiddenColorHints)) {
    return 'color_conflict';
  }
  // ЕДИНАЯ eligibility с legacy-путём (productPassesQualityGate): нейро-гейты (assembler.canAccept +
  // этот backstop) раньше НЕ проверяли junk-релевантность/филлер — легаси-репейры отключены в нейро-
  // режиме, и эти правила нигде не применялись после сборки. minUnitPriceForSet НЕ добавлен сюда —
  // это per-item ценовой ПОРОГ ПУЛА (кандидатов), а не жёсткое правило для уже собранного, сбаланси-
  // рованного набора: набор законно смешивает дешёвые и дорогие позиции ради бюджета в сумме.
  if (isCorporateSetFiller(product, input.userPrompt)) return 'low_relevance_junk';
  if (isLowRelevanceJunk(product, input.userPrompt)) return 'low_relevance_junk';
  // «Можно только X» — жёсткий whitelist. Только для строк, распознанных как известные бакеты
  // (normalizeBriefAllowedBuckets игнорирует нераспознанные — так свободные «повербанк»/именованные
  // позиции в allowedItems не превращают whitelist в пустой и не режут весь набор по ошибке).
  const allowedBuckets = normalizeBriefAllowedBuckets(input.allowedItems ?? []);
  if (allowedBuckets.length && !allowedBuckets.some((b) => productMatchesAllowedBucket(product, b))) {
    return 'not_in_allowed_bucket';
  }
  return null;
}

export interface HardEnforcementOptions {
  ledger?: {
    canUse(p: CatalogProduct): boolean;
    reserve(p: CatalogProduct): void;
    release(p: CatalogProduct): void;
  };
  log?: (message: string) => void;
  /** Доп. предикат приёмки для ДОБОРА (напр. anchor-совместимость) — чтобы бэкстоп не втащил
   *  несвязанный товар туда, где путь только что навёл когерентность. */
  accept?: (candidate: CatalogProduct) => boolean;
}

export interface HardEnforcementResult {
  set: CatalogProduct[];
  removed: Array<{ product: CatalogProduct; code: ConstraintViolationCode }>;
  added: CatalogProduct[];
}

interface RefillOpts {
  ledger?: HardEnforcementOptions['ledger'];
  accept?: HardEnforcementOptions['accept'];
  /** Ограничить добор конкретным типом (для восстановления обязательного типа его же типом). */
  typeFilter?: (candidate: CatalogProduct) => boolean;
}

function pickRefillCandidate(
  currentSet: CatalogProduct[],
  input: SelectionConstraintsInput,
  pool: CatalogProduct[],
  reserveGuard: CatalogProduct[],
  opts: RefillOpts,
): CatalogProduct | undefined {
  const usedIds = new Set(reserveGuard.map((p) => p.id));
  const tirage = input.quantity ?? 0;
  return pool
    .filter(
      (c) =>
        !usedIds.has(c.id) &&
        (!opts.typeFilter || opts.typeFilter(c)) &&
        itemHardViolation(c, input) == null &&
        (tirage <= 0 || hasSufficientStock(c, tirage)) &&
        (!opts.ledger || opts.ledger.canUse(c)) &&
        (!opts.accept || opts.accept(c)) &&
        canAddToSet(c, currentSet, input),
    )
    .sort(
      (a, b) =>
        scoreCandidate(b, input, undefined, '', '', currentSet) -
        scoreCandidate(a, input, undefined, '', '', currentSet),
    )[0];
}

/**
 * Ниже этого размера набор не сжимаем даже ради бюджета — иначе «набор» выродится в один предмет.
 * Бюджет клиента жёстче нашего дефолтного минимума в 3 предмета, но не жёстче здравого смысла.
 */
const MIN_SET_SIZE_UNDER_BUDGET_PRESSURE = 2;

/**
 * УДЕШЕВЛЕНИЕ: меняем самые дорогие НЕ-mandatory позиции на более дешёвые из пула, пока набор не
 * влезет в потолок. Так сохраняется размер набора — в отличие от простого выбрасывания.
 *
 * Кандидат берётся сначала из ТОГО ЖЕ семейства роли (наушники → наушники): замена не меняет
 * смысл набора. Если такого нет — из любого семейства, которого в наборе ещё нет, чтобы не
 * получить «две кружки». Среди подходящих выбираем САМЫЙ дорогой в рамках остатка бюджета:
 * дешевле ≠ лучше, набор не должен обрушиться в ценности.
 */
function downgradeSetToBudgetCap(
  kept: CatalogProduct[],
  input: SelectionConstraintsInput,
  pool: CatalogProduct[],
  cap: number,
  isMandatory: (p: CatalogProduct) => boolean,
  opts: Pick<HardEnforcementOptions, 'ledger' | 'accept'> = {},
): Array<{ from: CatalogProduct; to: CatalogProduct }> {
  const { ledger, accept } = opts;
  const tirage = input.quantity ?? 0;
  const swaps: Array<{ from: CatalogProduct; to: CatalogProduct }> = [];
  const inSet = new Set(kept.map((p) => p.id));
  // Каждую позицию удешевляем не более одного раза — цикл заведомо конечен.
  const tried = new Set<string>();

  while (estimateSetTotalPrice(kept) > cap) {
    const victim = kept
      .map((p, i) => ({ i, p }))
      .filter((x) => !isMandatory(x.p) && !tried.has(x.p.id))
      .sort((a, b) => (b.p.price ?? 0) - (a.p.price ?? 0))[0];
    if (!victim) break;
    tried.add(victim.p.id);

    const withoutVictim = kept.filter((_, i) => i !== victim.i);
    const headroom = cap - estimateSetTotalPrice(withoutVictim);
    const victimFamily = roleFamilyForProduct(victim.p);

    // Кандидат обязан пройти ТЕ ЖЕ гейты, что и добор в pickRefillCandidate: иначе своп втащит
    // товар без тиража, занятый другим набором (ledger), несовместимый с якорём (accept) или
    // создающий дубль/перебор семейства (canAddToSet). Любой кандидат дешевле victim снижает сумму.
    const cheaper = pool.filter(
      (c) =>
        !inSet.has(c.id) &&
        (c.price ?? 0) > 0 &&
        (c.price ?? 0) < (victim.p.price ?? 0) &&
        itemHardViolation(c, input) == null &&
        (tirage <= 0 || hasSufficientStock(c, tirage)) &&
        (!ledger || ledger.canUse(c)) &&
        (!accept || accept(c)) &&
        canAddToSet(c, withoutVictim, input),
    );
    // Если есть кандидат, укладывающий набор в потолок сразу, — выбираем среди них. Иначе
    // снижаем сумму частично и переходим к следующей позиции: одной замены может не хватить
    // (наушники 2243 + плед 1977 + кружка 655 при потолке 3060 — headroom всего 428 ₽).
    const fitting = cheaper.filter((c) => (c.price ?? 0) <= headroom);
    const pickFrom = fitting.length ? fitting : cheaper;

    // Замена в том же семействе роли не меняет смысл набора (наушники → наушники), поэтому
    // предпочтительна. Внутри группы берём самого дорогого: дешевле ≠ лучше.
    const best = pickFrom.sort((a, b) => {
      const fam = Number(roleFamilyForProduct(b) === victimFamily) - Number(roleFamilyForProduct(a) === victimFamily);
      return fam !== 0 ? fam : (b.price ?? 0) - (a.price ?? 0);
    })[0];
    if (!best) continue;

    ledger?.release(victim.p);
    ledger?.reserve(best);
    inSet.delete(victim.p.id);
    inSet.add(best.id);
    swaps.push({ from: victim.p, to: best });
    kept[victim.i] = best;
  }

  return swaps;
}

/**
 * ЕДИНЫЙ ФИНАЛЬНЫЙ БЭКСТОП соблюдения ограничений. Прогоняется на выходе пути подбора после ВСЕХ
 * мутаций (нейро-финал; финальный проход после regen-добора) — безусловно (флаг
 * CATALOG_FINAL_ENFORCE). Устраняет утечки «обещаний» пользователю независимо от того, какой
 * гейт что «забыл»:
 *   1) ЖЁСТКО убирает нарушителей (forbidden item/цвет, цвето-критичный клеш с брендом [для
 *      цвето-критичных ТИПОВ; электроника исключена намеренно], битое фото/нет цены) — даже ценой
 *      уменьшения набора: лучше меньше, чем с запрещённым/битым товаром;
 *   2) ТИРАЖ мягче — нефулфиллящий товар меняем только при наличии замены (обязательный тип —
 *      строго на СВОЙ тип; иначе оставляем: пустой/подменённый слот хуже);
 *   3) восстанавливает утраченные ОБЯЗАТЕЛЬНЫЕ типы, затем добирает до исходного размера, затем
 *      подрезает набор сверх max; всё — уважая ledger, accept-предикат и mandatory;
 *   4) загоняет набор в бюджет: снимает лишнее сверх min → УДЕШЕВЛЯЕТ заменой на более дешёвый
 *      аналог (размер сохраняется) → в крайнем случае снимает ниже min, но не ниже двух предметов.
 * Идемпотентен, mandatory-safe. Пустой вход → пустой выход (набор из ничего не конструируем).
 * Прямой поиск (direct-search) сюда пока не заведён — его цвето-гейты закрываются отдельно.
 */
/**
 * СОФТ-нарушения: ПРЕДПОЧТЕНИЯ, а не жёсткие обещания — резать их до схлопывания набора ниже
 * minItems нельзя (отзыв ЦА «бюджет 4000 → одна позиция»).
 *  - `color_conflict` — ВСЕГДА мягкий: уют сине-серый клешит с брендом red/green/yellow; полный
 *    тематичный набор в неидеальном цвете полезнее одной «правильной» позиции.
 *  - `not_in_allowed_bucket` — мягкий ТОЛЬКО когда whitelist пришёл из СВОБОДНОГО ТЕКСТА брифа
 *    (LLM спарсил «плед, чай, свеча» как exclusive-бакеты и выгрыз комплименты). Если же категория
 *    задана ЯВНО в UI («Посуда») — это ЖЁСТКОЕ ограничение пользователя: смягчать нельзя, иначе в
 *    «только Посуда» возвращаются зонты (реальный регресс). Управляется `input.allowedBucketSoft`.
 * Явные ЗАПРЕТЫ (forbidden_item/forbidden_color/bright_color_banned) всегда жёсткие.
 */
function isSoftStarvationViolation(
  code: ConstraintViolationCode,
  input: SelectionConstraintsInput,
  product: CatalogProduct,
): boolean {
  // ПРИОРИТЕТ ЯВНОГО WHITELIST: товар вне явно заданной UI-категории («только Посуда») режется
  // ЖЁСТКО, даже если его ПЕРВОЕ нарушение — мягкое (color_conflict проверяется в itemHardViolation
  // РАНЬШЕ not_in_allowed_bucket, поэтому клешащий зонт возвращался бы как color_conflict мимо
  // whitelist-гейта). Так «5 зонтов в только-Посуда» не воскресают ни одним мягким путём.
  if (!input.allowedBucketSoft) {
    const allowedBuckets = normalizeBriefAllowedBuckets(input.allowedItems ?? []);
    if (allowedBuckets.length && !allowedBuckets.some((b) => productMatchesAllowedBucket(product, b))) {
      return false;
    }
  }
  if (code === 'color_conflict') return true;
  if (code === 'not_in_allowed_bucket') return input.allowedBucketSoft === true;
  return false;
}

export function enforceSetHardConstraints(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
  pool: CatalogProduct[],
  opts: HardEnforcementOptions = {},
): HardEnforcementResult {
  const { ledger, log, accept } = opts;
  const removed: HardEnforcementResult['removed'] = [];
  const added: CatalogProduct[] = [];
  const originalCount = products.length;
  // Набор из ничего не конструируем: если путь отдал пустой набор — это его решение/провал.
  if (originalCount === 0) return { set: [], removed, added };

  // Обязательные типы (alias-aware): их нельзя терять на снятии/замене/бюджете.
  const mandAliases = new Set(
    (input.mandatoryTypes ?? detectMandatoryConceptTypesFromBrief(input.userPrompt)).flatMap((mt) =>
      mandatoryTypeAliases(mt),
    ),
  );
  const isMandatory = (p: CatalogProduct): boolean => mandAliases.has(detectConceptProductType(p));

  // 1) ЖЁСТКИЕ нарушители обещаний — вон (даже если набор станет меньше min: добор ниже попробует).
  const kept: CatalogProduct[] = [];
  const lostMandatoryTypes = new Set<string>();
  const softFloorOn = process.env.CATALOG_SOFT_CONSTRAINT_FLOOR !== 'false';
  // СОФТ-снятых (клеш палитры / вне «можно только»-бакета) держим ОТДЕЛЬНО: сперва пробуем чистую
  // замену обычным добором (3b), и лишь если он не дотянул набор до min — возвращаем лучших из них
  // (ступень 3s). Так валидный своп (кружка→лампа из разрешённого бакета) остаётся в приоритете, но
  // набор не схлопывается в 1-2 позиции, когда «правильной» замены в каталоге нет (уют сине-серый
  // vs фирм. red/green/yellow; либо перечисленные в брифе примеры-предметы → ложный whitelist).
  const softRemoved: Array<{ product: CatalogProduct; code: ConstraintViolationCode }> = [];
  for (const p of products) {
    const code = itemHardViolation(p, input);
    // ОБЯЗАТЕЛЬНЫЙ ТИП С НУЛЕВЫМ ОСТАТКОМ НЕ ВЫБРАСЫВАЕМ: потерять названную пользователем позицию
    // хуже, чем показать её с дефицитом (UI отдаёт stockShortfall). Шаг 2 (тираж) ниже попытается
    // подменить её на SKU ТОГО ЖЕ типа с остатком. Прочие жёсткие нарушения mandatory не щадят.
    if (code === 'insufficient_stock' && isMandatory(p)) {
      log?.(`enforce: обязательный «${p.name.slice(0, 32)}» с нулевым остатком оставлен (тип важнее)`);
      kept.push(p);
      continue;
    }
    if (softFloorOn && code && isSoftStarvationViolation(code, input, p)) {
      // Названную пользователем позицию софт-причина (цвет/бакет) не роняет вовсе: имя > предпочтение.
      if (isMandatory(p)) {
        kept.push(p);
        continue;
      }
      softRemoved.push({ product: p, code });
      ledger?.release(p);
      continue;
    }
    if (code) {
      removed.push({ product: p, code });
      ledger?.release(p);
      if (isMandatory(p)) lostMandatoryTypes.add(detectConceptProductType(p));
    } else {
      kept.push(p);
    }
  }

  // 1b) СТРУКТУРНЫЕ ДУБЛИ ПОСЛЕ ПОСТ-ГЕЙТОВ: реранк/composition-opt/professionHero/anchor-
  //     комплемент (allowCat) могли ВВЕСТИ дубль капнутого семейства (два пледа/полотенца/кружки)
  //     или тот же вариант — предсборочный validateSetConstraints в нейро-пути отключён, поэтому
  //     сверяем здесь терминально. Ключ: капнутое семейство (isCappedToOne) → одно на набор; иначе
  //     — только дубль ВАРИАНТА. Оставляем лучший (mandatory-первым, затем выше scoreCandidate);
  //     ОБЯЗАТЕЛЬНЫЙ дубль НЕ снимаем (конфликт брифа — не наша тихая потеря). 3b доберёт не-дублями.
  {
    const dedupKey = (p: CatalogProduct): string => {
      const fam = roleFamilyForProduct(p);
      return isCappedToOne(fam) ? `fam:${fam}` : `var:${productVariantKey(p)}`;
    };
    const groups = new Map<string, CatalogProduct[]>();
    for (const p of kept) {
      const k = dedupKey(p);
      const g = groups.get(k);
      if (g) g.push(p);
      else groups.set(k, [p]);
    }
    const toRemove = new Set<string>();
    for (const grp of groups.values()) {
      if (grp.length < 2) continue;
      const keeper = [...grp].sort(
        (a, b) =>
          Number(isMandatory(b)) - Number(isMandatory(a)) ||
          scoreCandidate(b, input, undefined, '', '', kept) - scoreCandidate(a, input, undefined, '', '', kept),
      )[0];
      for (const p of grp) {
        if (p === keeper || isMandatory(p)) continue; // keeper и любой mandatory остаются
        toRemove.add(p.id);
      }
    }
    if (toRemove.size) {
      for (let i = kept.length - 1; i >= 0; i--) {
        if (!toRemove.has(kept[i].id)) continue;
        const victim = kept[i];
        ledger?.release(victim);
        removed.push({
          product: victim,
          code: isCappedToOne(roleFamilyForProduct(victim)) ? 'duplicate_role' : 'duplicate_variant',
        });
        kept.splice(i, 1);
      }
    }
  }

  // 2) ТИРАЖ — заменяем нефулфиллящий товар только при наличии замены; обязательный тип —
  //    строго на СВОЙ тип, иначе оставляем как есть (потерять сам тип хуже, чем меньший остаток).
  const tirage = input.quantity ?? 0;
  if (tirage > 0) {
    for (let i = 0; i < kept.length; i++) {
      if (hasSufficientStock(kept[i], tirage)) continue;
      const rest = kept.filter((_, idx) => idx !== i);
      const mand = isMandatory(kept[i]);
      const keptType = detectConceptProductType(kept[i]);
      const replacement = pickRefillCandidate(rest, input, pool, kept, {
        ledger,
        accept,
        typeFilter: mand ? (c) => detectConceptProductType(c) === keptType : undefined,
      });
      if (replacement) {
        ledger?.release(kept[i]);
        ledger?.reserve(replacement);
        removed.push({ product: kept[i], code: 'insufficient_stock' });
        added.push(replacement);
        kept[i] = replacement;
      }
    }
  }

  // 3a) ВОССТАНОВЛЕНИЕ утраченных обязательных типов — приоритетнее общего добора (своим типом).
  for (const mt of lostMandatoryTypes) {
    if (kept.some((p) => detectConceptProductType(p) === mt)) continue;
    const cand = pickRefillCandidate(kept, input, pool, kept, {
      ledger,
      accept,
      typeFilter: (c) => detectConceptProductType(c) === mt,
    });
    if (cand) {
      ledger?.reserve(cand);
      kept.push(cand);
      added.push(cand);
    }
  }

  // 3b) ДОБОР до исходного размера (в рамках max), если жёсткие снятия уменьшили набор.
  const restoreTo = Math.min(
    input.maxProductsPerSet,
    Math.max(input.minProductsPerSet, originalCount),
  );
  while (kept.length < restoreTo) {
    const cand = pickRefillCandidate(kept, input, pool, kept, { ledger, accept });
    if (!cand) break;
    ledger?.reserve(cand);
    kept.push(cand);
    added.push(cand);
  }

  // 3s) ВОЗВРАТ СОФТ-СНЯТЫХ ДО FLOOR. Чистый добор (3b) не дотянул набор до min — значит фирм.
  //     цвет/бакет несовместимы с ТЕМОЙ концепции и «правильной» замены в каталоге просто нет.
  //     Возвращаем лучших софт-снятых (по scoreCandidate), пока не наберём minItems: полный
  //     тематичный набор в неидеальном цвете полезнее 1-2 позиций (отзыв реальной ЦА #2/#6).
  //     Дубли (капнутое семейство/вариант) при возврате пропускаем. Что не вернулось — в removed.
  if (softFloorOn && softRemoved.length) {
    if (kept.length < input.minProductsPerSet) {
      const bestFirst = softRemoved
        .slice()
        .sort(
          (a, b) =>
            scoreCandidate(b.product, input, undefined, '', '', kept) -
            scoreCandidate(a.product, input, undefined, '', '', kept),
        );
      for (const s of bestFirst) {
        if (kept.length >= input.minProductsPerSet) break;
        const fam = roleFamilyForProduct(s.product);
        const dupFamily = isCappedToOne(fam) && kept.some((k) => roleFamilyForProduct(k) === fam);
        const dupVariant = kept.some((k) => productVariantKey(k) === productVariantKey(s.product));
        if (kept.some((k) => k.id === s.product.id) || dupFamily || dupVariant) continue;
        ledger?.reserve(s.product);
        kept.push(s.product);
        log?.(
          `enforce: софт-возврат «${s.product.name.slice(0, 32)}» (${s.code}) ради полноты набора (min ${input.minProductsPerSet})`,
        );
      }
    }
    // Софт-снятые, что НЕ вернулись в набор, фиксируем в removed (для отчёта/лога).
    for (const s of softRemoved) {
      if (!kept.some((k) => k.id === s.product.id)) removed.push({ product: s.product, code: s.code });
    }
  }

  // 3c) ПОДРЕЗКА сверх max (вход мог прийти > max): снимаем слабейшие НЕ-mandatory позиции.
  if (kept.length > input.maxProductsPerSet) {
    const droppable = kept
      .map((p) => ({ p, mand: isMandatory(p), score: scoreCandidate(p, input, undefined, '', '', kept) }))
      .filter((x) => !x.mand)
      .sort((a, b) => a.score - b.score);
    for (const { p } of droppable) {
      if (kept.length <= input.maxProductsPerSet) break;
      const idx = kept.indexOf(p);
      if (idx < 0) continue;
      ledger?.release(p);
      removed.push({ product: p, code: 'set_size_above_max' });
      kept.splice(idx, 1);
    }
  }

  // 4) БЮДЖЕТ. Три ступени, в порядке убывания предпочтительности:
  //    (а) снять лишнее сверх минимума;
  //    (б) УДЕШЕВИТЬ: заменить дорогую позицию на более дешёвую — размер набора сохраняется;
  //    (в) снять позицию ниже минимума — крайняя мера.
  //
  // Раньше был только шаг (а) с условием `kept.length > minProductsPerSet`. При наборе ровно из
  // min предметов цикл не выполнялся НИ РАЗУ, и набор уезжал дороже бюджета (реальный прогон:
  // наушники 2243 + плед 1977 + кружка 655 = 4875 ₽ при потолке 3000 ₽). Классический fail-open.
  const budgetPerSet = resolveSelectionBudgetPerSet(input);
  if (budgetPerSet != null && budgetPerSet > 0) {
    const cap = effectiveBudgetCap(budgetPerSet, input.budgetTolerancePct);

    const dropPriciest = (floor: number): boolean => {
      const victim = kept
        .map((p, i) => ({ i, p }))
        .filter((x) => !isMandatory(x.p))
        .sort((a, b) => (b.p.price ?? 0) - (a.p.price ?? 0))[0];
      if (!victim || kept.length <= floor) return false;
      ledger?.release(victim.p);
      removed.push({ product: victim.p, code: 'budget_exceeded' });
      kept.splice(victim.i, 1);
      return true;
    };

    // (а) лишнее сверх минимума
    while (kept.length > input.minProductsPerSet && estimateSetTotalPrice(kept) > cap) {
      if (!dropPriciest(input.minProductsPerSet)) break;
    }

    // (б) удешевление заменой
    if (estimateSetTotalPrice(kept) > cap) {
      const swapped = downgradeSetToBudgetCap(kept, input, pool, cap, isMandatory, { ledger, accept });
      for (const s of swapped) {
        removed.push({ product: s.from, code: 'budget_exceeded' });
        added.push(s.to);
      }
    }

    // (в) бюджет клиента жёстче нашего минимума в предметах: набор из двух вещей в бюджете
    //     полезнее, чем из трёх с превышением на 60%. Но снимаем не больше ОДНОЙ позиции ниже
    //     min и никогда не опускаемся ниже двух — иначе «набор» выродится в один предмет, а при
    //     явно заданном большом min (например 5) деградация была бы обвальной.
    const budgetFloor = Math.max(MIN_SET_SIZE_UNDER_BUDGET_PRESSURE, input.minProductsPerSet - 1);
    while (kept.length > budgetFloor && estimateSetTotalPrice(kept) > cap) {
      if (!dropPriciest(budgetFloor)) break;
    }
  }

  if (log && (removed.length || added.length)) {
    log(
      `enforceSetHardConstraints: −${removed.length} [${removed
        .map((r) => r.code)
        .join(',')}], +${added.length} (было ${originalCount} → стало ${kept.length})`,
    );
  }
  return { set: kept, removed, added };
}

function canAddToSet(
  product: CatalogProduct,
  current: CatalogProduct[],
  input: SelectionConstraintsInput,
  stockMode: 'strict' | 'relaxed' = 'strict',
  relaxation?: SetRelaxationConfig,
): boolean {
  const skipBrightDull = relaxation?.skipBrightDullHeuristics ?? false;
  const cosmeticOnly = relaxation?.cosmeticOnly ?? false;

  if (!hasValidProductPrice(product)) return false;
  if (stockMode === 'relaxed') {
    if (!hasRelaxedStock(product)) return false;
  } else if (!hasSufficientStock(product, input.quantity ?? 0)) {
    return false;
  }

  // Упаковка/салфетки/полотенца — никогда, даже при релаксации (skipThematicScoring).
  if (isCorporateSetFiller(product, input.userPrompt)) return false;
  const hardFillerType = detectConceptProductType(product);
  if (
    (hardFillerType === 'packaging' ||
      hardFillerType === 'cleaning_cloth' ||
      hardFillerType === 'towel') &&
    !briefAllowsTowels(input.userPrompt)
  ) {
    return false;
  }

  if (cosmeticOnly) {
    if (isLowRelevanceJunk(product, input.userPrompt)) return false;
    if (current.some((p) => p.id === product.id)) return false;
    const variants = new Set(current.map(productVariantKey));
    if (variants.has(productVariantKey(product))) return false;
    if (setHasCrossConceptLine(product, current, input.userPrompt)) return false;
    const { forbiddenItems } = reconcileBriefConstraints(
      input.userPrompt,
      input.allowedItems,
      input.forbiddenItems,
    );
    if (productMatchesForbidden(product, forbiddenItems, input.userPrompt, input.budgetMax ?? input.budgetPerSet)) return false;
    if (productHasForbiddenColor(product, parseBriefForbiddenColors(input.userPrompt))) return false;
    const minUnit = minUnitPriceForSet(input);
    if ((product.price ?? 0) > 0 && (product.price ?? 0) < minUnit) return false;
    // Даже косметический добор не должен дублировать тип/семейство (не «полотенце+полотенце+полотенце»).
    const localTypes = new Set(current.map(detectConceptProductType));
    if (typeConflictsInSet(localTypes, detectConceptProductType(product))) return false;
    const cosmeticFamily = roleFamilyForProduct(product);
    if (isCappedToOne(cosmeticFamily) && current.some((p) => roleFamilyForProduct(p) === cosmeticFamily)) {
      return false;
    }
    return true;
  }

  if (!relaxation?.skipThematicScoring && isLowRelevanceJunk(product, input.userPrompt)) return false;
  // При релаксации тематики всё равно отсекаем явный мусор и филлеры.
  if (relaxation?.skipThematicScoring) {
    if (isCorporateSetFiller(product, input.userPrompt)) return false;
    const fillerType = detectConceptProductType(product);
    if (
      (fillerType === 'packaging' || fillerType === 'cleaning_cloth' || fillerType === 'towel') &&
      !briefAllowsTowels(input.userPrompt)
    ) {
      return false;
    }
    const techBrief = /разработчик|хакатон|hackathon|(?<![а-яёa-z])it(?![а-яёa-z])|айти|tech|кодер|coder|программист/i.test(
      normalizeText(input.userPrompt),
    );
    const junkThreshold = techBrief ? 65 : /эко|eco|устойчив|переработ/i.test(normalizeText(input.userPrompt)) ? 36 : 24;
    if (scoreBriefRelevance(product, input.userPrompt) <= junkThreshold) return false;
  }
  const minUnit = minUnitPriceForSet(input);
  if ((product.price ?? 0) > 0 && (product.price ?? 0) < minUnit) return false;
  if (wouldExceedTextileCatalogCap(product, current, input.userPrompt)) return false;
  if (productViolatesBriefColors(product, input, skipBrightDull)) return false;
  if (current.some((p) => p.id === product.id)) return false;

  const localTypes = new Set(current.map(detectConceptProductType));
  const type = detectConceptProductType(product);
  if (typeConflictsInSet(localTypes, type)) return false;

  const family = roleFamilyForProduct(product);
  const familyCount = current.filter((p) => roleFamilyForProduct(p) === family).length;
  if (isCappedToOne(family) && familyCount >= 1) return false;

  const displayType = displayTypeForCap(product);
  const displayCount = current.filter((p) => displayTypeForCap(p) === displayType).length;
  if (isDisplayCappedType(displayType) && displayCount >= DISPLAY_TYPE_CAP) return false;

  const role = detectProductRole(product).role;
  if (role === 'other') {
    const otherCount = current.filter((p) => detectProductRole(p).role === 'other').length;
    if (otherCount >= maxOtherRolesForSet(input)) return false;
  }

  const sameTypeCount = current.filter((p) => detectProductRole(p).role === role).length;
  const cap = effectiveDisplayTypeCap(product, input);
  if (!isDisplayCappedType(displayType) && !isCappedToOne(family) && sameTypeCount >= cap && role !== 'other') {
    return false;
  }

  const variants = new Set(current.map(productVariantKey));
  if (variants.has(productVariantKey(product))) return false;
  if (setHasCrossConceptLine(product, current, input.userPrompt)) return false;

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
      !hasSufficientStock(product, input.quantity ?? 0) ||
      productMatchesForbidden(product, reconcileBriefConstraints(input.userPrompt, input.allowedItems, input.forbiddenItems, input.budgetMax ?? input.budgetPerSet).forbiddenItems, input.userPrompt, input.budgetMax ?? input.budgetPerSet) ||
      productViolatesBriefColors(product, input) ||
      isLowRelevanceJunk(product, input.userPrompt) ||
      (isGiftBundleProduct(product) && result.filter(isGiftBundleProduct).length > 1);

    if (!needsReplace) continue;

    const rest = result.filter((_, idx) => idx !== i);
    const reason = !hasValidProductImage(product)
      ? 'missing_image'
      : !hasSufficientStock(product, input.quantity ?? 0)
        ? 'insufficient_stock'
      : productMatchesForbidden(
          product,
          reconcileBriefConstraints(input.userPrompt, input.allowedItems, input.forbiddenItems).forbiddenItems,
          input.userPrompt,
        )
        ? 'forbidden_item'
      : productViolatesBriefColors(product, input)
        ? 'color_conflict'
        : isGiftBundleProduct(product)
          ? 'bundle_overflow'
          : 'low_relevance';

    const pool = options.catalog.filter(
      (c) =>
        !isBlockedFromOtherConcepts(c, options, rest) &&
        canAddToSet(c, rest, input) &&
        (reason !== 'missing_image' || hasValidProductImage(c)),
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
    options.relaxation?.skipThematicScoring,
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
  const mandatory = [
    ...new Set(input.mandatoryTypes ?? detectMandatoryConceptTypesFromBrief(input.userPrompt)),
  ];
  let result = [...products];

  for (const mt of mandatory) {
    if (hasMandatoryTypeInProducts(result, mt)) continue;

    const pool = mandatoryCandidatePool(mt, typeIndex, options.catalog)
      .filter(
        (p) =>
          !isBlockedFromOtherConcepts(p, options, result) &&
          productPassesQualityGate(p, input),
      )
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
  const requirements = resolveRequiredCategories(
    input,
    options.catalog,
    options.relaxation?.skipMissingMandatoryCategories,
    options.onWarn,
  );
  if (!requirements.length) return result;

  for (const req of requirements) {
    while (countProductsInRequiredCategory(result, req.key) < req.minCount) {
      const pool = options.catalog
        .filter(
          (p) =>
            !isBlockedFromOtherConcepts(p, options, result) &&
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
  /** SKU / variant / line key уже использованы в других концепциях discoverConcepts */
  crossConceptBlockedIds?: Set<string>;
  crossConceptBlockedVariants?: Set<string>;
  /** Линейки товаров (Madras/PB030/термос) — отдельная блокировка между наборами */
  crossConceptBlockedLineKeys?: Set<string>;
  /** Предупреждения при неполном доборе (min fill, palette quota) */
  onWarn?: (message: string) => void;
  /** Ослабление косметических ограничений (лестница buildSetWithRelaxation) */
  relaxation?: SetRelaxationConfig;
}

function isBlockedFromOtherConcepts(
  product: CatalogProduct,
  options: FinalizeSelectionOptions,
  currentProducts: CatalogProduct[],
): boolean {
  const brief = options.filterInput?.userPrompt ?? '';
  if (currentProducts.some((p) => p.id === product.id)) return false;
  const vk = productVariantKey(product);
  if (currentProducts.some((p) => productVariantKey(p) === vk)) return false;
  const lineKeys = crossConceptLineKeys(product, brief);
  if (
    currentProducts.some((p) =>
      crossConceptLineKeys(p, brief).some((lk) => lineKeys.includes(lk)),
    )
  ) {
    return false;
  }
  if (options.crossConceptBlockedLineKeys?.size) {
    if (isCrossConceptLineBlocked(product, options.crossConceptBlockedLineKeys, brief)) return true;
  }
  if (options.crossConceptBlockedIds?.has(product.id)) return true;
  if (options.crossConceptBlockedVariants?.has(vk)) return true;
  for (const lk of lineKeys) {
    if (options.crossConceptBlockedVariants?.has(lk)) return true;
    if (options.crossConceptBlockedLineKeys?.has(lk)) return true;
    if (lk === 'line:corp_filler' && options.crossConceptBlockedLineKeys?.has('line:corp_filler')) {
      return true;
    }
  }
  if (options.crossConceptBlockedLineKeys?.has('line:corp_filler') && isCorporateSetFiller(product)) {
    return true;
  }
  return false;
}

export function dedupeSetByRoles(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
  refine?: Pick<FinalizeSelectionOptions, 'catalog' | 'filterInput' | 'conceptTitle' | 'conceptComposition' | 'relaxation'>,
): { products: CatalogProduct[]; removed: SelectionRepairAction[] } {
  const removed: SelectionRepairAction[] = [];
  const kept: CatalogProduct[] = [];
  const roleFamilyCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  const displayTypeCount = new Map<string, number>();
  const seenIds = new Set<string>();
  const seenVariants = new Set<string>();
  const seenLineKeys = new Set<string>();
  const sameTypeCap = input.sameTypeCap ?? DEFAULT_SAME_TYPE_CAP;
  const skipThematic = refine?.relaxation?.skipThematicScoring;

  const sorted = [...products].sort((a, b) =>
    scoreCandidate(b, input, refine?.filterInput, refine?.conceptTitle ?? '', refine?.conceptComposition ?? '', products, skipThematic) -
    scoreCandidate(a, input, refine?.filterInput, refine?.conceptTitle ?? '', refine?.conceptComposition ?? '', products, skipThematic),
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
    const lineKeys = crossConceptLineKeys(product);
    if (lineKeys.some((lk) => seenLineKeys.has(lk)) || setHasCrossConceptLine(product, kept, input.userPrompt)) {
      removed.push({ action: 'removed', reason: 'duplicate_product_line', productId: product.id });
      continue;
    }
    if (!productPassesQualityGate(product, input)) {
      removed.push({ action: 'removed', reason: 'quality_gate', productId: product.id });
      continue;
    }

    const type = detectConceptProductType(product);
    const family = roleFamilyForProduct(product);
    const familyUsed = roleFamilyCount.get(family) ?? 0;
    if (isCappedToOne(family) && familyUsed >= 1) {
      removed.push({ action: 'removed', reason: `duplicate_role:${family}`, productId: product.id });
      continue;
    }
    if (wouldExceedTextileCatalogCap(product, kept, input.userPrompt)) {
      removed.push({ action: 'removed', reason: 'duplicate_catalog_category:textile', productId: product.id });
      continue;
    }

    const displayType = displayTypeForCap(product);
    const displayUsed = displayTypeCount.get(displayType) ?? 0;
    if (isDisplayCappedType(displayType) && displayUsed >= DISPLAY_TYPE_CAP) {
      const catalog = refine?.catalog;
      if (catalog?.length) {
        const presentDisplay = new Set(kept.map(displayTypeForCap));
        const replacement = catalog
          .filter(
            (p) =>
              !seenIds.has(p.id) &&
              !seenVariants.has(productVariantKey(p)) &&
              !setHasCrossConceptLine(p, kept, input.userPrompt) &&
              !presentDisplay.has(displayTypeForCap(p)) &&
              canAddToSet(p, kept, input, 'strict', refine?.relaxation),
          )
          .sort(
            (a, b) =>
              scoreCandidate(b, input, refine?.filterInput, refine?.conceptTitle ?? '', refine?.conceptComposition ?? '', kept, skipThematic) -
              scoreCandidate(a, input, refine?.filterInput, refine?.conceptTitle ?? '', refine?.conceptComposition ?? '', kept, skipThematic),
          )[0];
        if (replacement) {
          const weakIdx = kept
            .map((p, i) => ({
              i,
              dt: displayTypeForCap(p),
              score: scoreCandidate(p, input, refine?.filterInput, refine?.conceptTitle ?? '', refine?.conceptComposition ?? '', kept, skipThematic),
            }))
            .filter((x) => x.dt === displayType)
            .sort((a, b) => a.score - b.score)[0]?.i;
          if (weakIdx != null && weakIdx >= 0) {
            const replaced = kept[weakIdx];
            kept[weakIdx] = replacement;
            removed.push({
              action: 'replaced',
              reason: `display_type_swap:${displayType}`,
              productId: replaced.id,
              replacementId: replacement.id,
            });
            seenIds.delete(replaced.id);
            seenVariants.delete(productVariantKey(replaced));
            for (const lk of crossConceptLineKeys(replaced)) seenLineKeys.delete(lk);
            seenIds.add(replacement.id);
            seenVariants.add(productVariantKey(replacement));
            addLineKeysToSet(seenLineKeys, replacement);
            continue;
          }
        }
      }
      removed.push({ action: 'removed', reason: `same_type_overflow:${displayType}`, productId: product.id });
      continue;
    }

    const role = detectProductRole(product).role;
    const typeUsed = typeCount.get(role) ?? 0;
    if (role === 'other' && typeUsed >= maxOtherRolesForSet(input)) {
      removed.push({ action: 'removed', reason: 'other_type_overflow', productId: product.id });
      continue;
    }
    if (
      !isDisplayCappedType(displayType) &&
      !isCappedToOne(family) &&
      typeUsed >= sameTypeCap &&
      role !== 'other'
    ) {
      removed.push({ action: 'removed', reason: `same_type_overflow:${type}`, productId: product.id });
      continue;
    }

    kept.push(product);
    seenIds.add(product.id);
    seenVariants.add(vk);
    addLineKeysToSet(seenLineKeys, product);
    roleFamilyCount.set(family, familyUsed + 1);
    typeCount.set(role, typeUsed + 1);
    displayTypeCount.set(displayType, displayUsed + 1);
  }

  return { products: kept, removed };
}

function countPaletteMatchedProducts(
  products: CatalogProduct[],
  colors: string[],
  userPrompt: string,
): number {
  if (!colors.length) return products.length;
  const forbiddenHints = parseBriefForbiddenColors(userPrompt);
  return products.filter((p) => scoreBriefPaletteMatch(p, colors, forbiddenHints) > 0).length;
}

function tryFillMinCount(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
  options: FinalizeSelectionOptions,
  repairs: SelectionRepairAction[],
  reason: string,
): CatalogProduct[] {
  let result = [...products];
  const relaxation = options.relaxation;
  const budgetPerSet = resolveSelectionBudgetPerSet(input);
  const budgetCap =
    budgetPerSet != null && budgetPerSet > 0
      ? effectiveBudgetCap(budgetPerSet, input.budgetTolerancePct)
      : null;
  while (result.length < input.minProductsPerSet) {
    const imagePool = options.catalog.filter((p) => hasValidProductImage(p));
    const fillCatalog = imagePool.length >= input.minProductsPerSet ? imagePool : options.catalog;
    let candidate = fillCatalog
      .filter(
        (p) =>
          !isBlockedFromOtherConcepts(p, options, result) &&
          canAddToSet(p, result, input, 'strict', relaxation),
      )
      .sort(
        (a, b) =>
          scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring) -
          scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring),
      )[0];

    if (!candidate) {
      candidate = fillCatalog
        .filter(
          (p) =>
            !isBlockedFromOtherConcepts(p, options, result) &&
            canAddToSet(p, result, input, 'relaxed', relaxation),
        )
        .sort(
          (a, b) =>
            scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring) -
            scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring),
        )[0];
      if (!candidate && relaxation?.cosmeticOnly) {
        candidate = fillCatalog
          .filter(
            (p) =>
              !isBlockedFromOtherConcepts(p, options, result) &&
              canAddToSet(p, result, input, 'relaxed', { ...relaxation, cosmeticOnly: true }),
          )
          .sort(
            (a, b) =>
              scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, true) -
              scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, true),
          )[0];
      }
      if (!candidate) {
        const forbiddenHints = parseBriefForbiddenColors(input.userPrompt);
        const { forbiddenItems } = reconcileBriefConstraints(
          input.userPrompt,
          input.allowedItems,
          input.forbiddenItems,
        );
        const relevanceCtx = buildBriefRelevanceContext(input.userPrompt, input.colors);
        const minEmergencyRelevance = relevanceCtx.flags.tech
          ? 55
          : relevanceCtx.flags.eco
            ? 38
            : 35;
        const emergency = fillCatalog
          .filter((p) => {
            if (isBlockedFromOtherConcepts(p, options, result)) return false;
            if (result.some((x) => x.id === p.id)) return false;
            if (result.some((x) => productVariantKey(x) === productVariantKey(p))) return false;
            if (setHasCrossConceptLine(p, result, input.userPrompt)) return false;
            if (!hasValidProductPrice(p)) return false;
            if (!hasRelaxedStock(p)) return false;
            if (isCorporateSetFiller(p, input.userPrompt)) return false;
            if (isLowRelevanceJunk(p, input.userPrompt)) return false;
            if (scoreBriefRelevanceWithContext(p, relevanceCtx) < minEmergencyRelevance) return false;
            const minUnit = minUnitPriceForSet(input);
            if ((p.price ?? 0) > 0 && (p.price ?? 0) < minUnit) return false;
            if (wouldExceedTextileCatalogCap(p, result, input.userPrompt)) return false;
            if (productMatchesForbidden(p, forbiddenItems, input.userPrompt, input.budgetMax ?? input.budgetPerSet)) return false;
            if (productHasForbiddenColor(p, forbiddenHints)) return false;
            if (budgetCap != null && budgetCap > 0) {
              const nextTotal = estimateSetTotalPrice(result) + (p.price ?? 0);
              if (nextTotal > budgetCap) return false;
            }
            const budgetPerSet = resolveSelectionBudgetPerSet(input);
            if (budgetPerSet != null && budgetPerSet > 0) {
              const { floor } = resolveSetBudgetRange(input.budgetMin, budgetPerSet);
              if (floor > 0) {
                const projected = estimateSetTotalPrice(result) + (p.price ?? 0);
                const slotsLeft = Math.max(1, input.minProductsPerSet - result.length - 1);
                const minNeededPerSlot = Math.max(50, Math.floor((floor - projected) / slotsLeft));
                if (projected + minNeededPerSlot * slotsLeft < floor * 0.9) return false;
              }
            }
            return true;
          })
          .sort(
            (a, b) =>
              scoreCandidate(
                b,
                input,
                options.filterInput,
                options.conceptTitle,
                options.conceptComposition,
                result,
                true,
              ) -
              scoreCandidate(
                a,
                input,
                options.filterInput,
                options.conceptTitle,
                options.conceptComposition,
                result,
                true,
              ),
          )[0];
        if (emergency) {
          candidate = emergency;
          options.onWarn?.(
            `min fill emergency candidate ${candidate.name.slice(0, 40)} (${result.length + 1}/${input.minProductsPerSet})`,
          );
        }
      }
      if (!candidate) {
        options.onWarn?.(
          `min fill stopped at ${result.length}/${input.minProductsPerSet}: no candidate (strict+relaxed stock)`,
        );
        break;
      }
      options.onWarn?.(
        `min fill used relaxed stock for ${candidate.name.slice(0, 40)} (${result.length + 1}/${input.minProductsPerSet})`,
      );
    }

    result.push(candidate);
    repairs.push({ action: 'added', reason, productId: candidate.id });
  }
  return result;
}

/** Добор/апгрейд до нижней границы бюджета набора (budgetMin или 85% cap). */
function tryEnforceBudgetFloor(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
  options: FinalizeSelectionOptions,
  repairs: SelectionRepairAction[],
): CatalogProduct[] {
  const budgetPerSet = resolveSelectionBudgetPerSet(input);
  if (budgetPerSet == null || budgetPerSet <= 0 || products.length === 0) return products;

  const { floor } = resolveSetBudgetRange(input.budgetMin, budgetPerSet);
  if (floor <= 0 || estimateSetTotalPrice(products) >= floor) return products;

  const cap = effectiveBudgetCap(budgetPerSet, input.budgetTolerancePct);
  let result = [...products];
  const relaxation = options.relaxation;
  const maxAttempts = Math.max(32, input.maxProductsPerSet * 8);

  for (let attempt = 0; attempt < maxAttempts && estimateSetTotalPrice(result) < floor; attempt++) {
    if (result.length < input.maxProductsPerSet) {
      const candidate = options.catalog
        .filter(
          (p) =>
            !isBlockedFromOtherConcepts(p, options, result) &&
            canAddToSet(p, result, input, 'strict', relaxation) &&
            estimateSetTotalPrice(result) + (p.price ?? 0) <= cap,
        )
        .sort(
          (a, b) =>
            scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring) +
            (b.price ?? 0) * 0.02 -
            (scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring) +
              (a.price ?? 0) * 0.02),
        )[0];
      if (candidate) {
        result.push(candidate);
        repairs.push({ action: 'added', reason: 'budget_floor_fill', productId: candidate.id });
        continue;
      }
    }

    let bestIdx = -1;
    let bestRepl: CatalogProduct | null = null;
    let bestGain = 0;
    for (let i = 0; i < result.length; i++) {
      const cur = result[i];
      const curPrice = cur.price ?? 0;
      const room = cap - (estimateSetTotalPrice(result) - curPrice);
      const rest = result.filter((_, idx) => idx !== i);
      const pool = options.catalog.filter(
        (p) =>
          !isBlockedFromOtherConcepts(p, options, rest) &&
          p.id !== cur.id &&
          (p.price ?? 0) > curPrice &&
          (p.price ?? 0) <= room &&
          canAddToSet(p, rest, input, 'strict', relaxation),
      );
      const repl = pool.sort(
        (a, b) =>
          scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring) -
          scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring),
      )[0];
      if (repl) {
        const gain = (repl.price ?? 0) - curPrice;
        if (gain > bestGain) {
          bestGain = gain;
          bestIdx = i;
          bestRepl = repl;
        }
      }
    }
    if (bestIdx >= 0 && bestRepl) {
      const replaced = result[bestIdx];
      result[bestIdx] = bestRepl;
      repairs.push({
        action: 'replaced',
        reason: 'budget_floor_upgrade',
        productId: replaced.id,
        replacementId: bestRepl.id,
      });
    } else {
      break;
    }
  }

  return result;
}

function enforcePaletteQuota(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
  options: FinalizeSelectionOptions,
  repairs: SelectionRepairAction[],
): CatalogProduct[] {
  if (options.relaxation?.skipPaletteQuota) return products;
  if (!input.colors.length || products.length === 0) return products;

  const required = Math.ceil(input.minProductsPerSet * 0.5);
  let result = [...products];
  const forbiddenHints = parseBriefForbiddenColors(input.userPrompt);

  while (countPaletteMatchedProducts(result, input.colors, input.userPrompt) < required && result.length > 0) {
    const matched = countPaletteMatchedProducts(result, input.colors, input.userPrompt);
    const pool = options.catalog
      .filter(
        (p) =>
          hasValidProductImage(p) &&
          !isBlockedFromOtherConcepts(p, options, result) &&
          scoreBriefPaletteMatch(p, input.colors, forbiddenHints) > 0 &&
          canAddToSet(p, result, input),
      )
      .sort(
        (a, b) =>
          scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, result) -
          scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, result),
      );

    const candidate = pool[0];
    if (candidate) {
      result.push(candidate);
      repairs.push({ action: 'added', reason: 'palette_quota_fill', productId: candidate.id });
      continue;
    }

    const replaceIdx = result
      .map((p, i) => ({
        i,
        palette: scoreBriefPaletteMatch(p, input.colors, forbiddenHints),
        score: scoreCandidate(p, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, options.relaxation?.skipThematicScoring),
        displayType: displayTypeForCap(p),
      }))
      .filter((x) => x.palette <= 0)
      .sort((a, b) => a.score - b.score)[0]?.i;

    if (replaceIdx == null || replaceIdx < 0) {
      options.onWarn?.(
        `palette quota unmet: ${matched}/${required} palette-matched products`,
      );
      break;
    }

    const rest = result.filter((_, idx) => idx !== replaceIdx);
    const replacedType = displayTypeForCap(result[replaceIdx]);
    const replacement = options.catalog
      .filter(
        (p) =>
          hasValidProductImage(p) &&
          !isBlockedFromOtherConcepts(p, options, rest) &&
          scoreBriefPaletteMatch(p, input.colors, forbiddenHints) > 0 &&
          canAddToSet(p, rest, input, 'strict', options.relaxation) &&
          (displayTypeForCap(p) === replacedType || !rest.some((r) => displayTypeForCap(r) === displayTypeForCap(p))),
      )
      .sort(
        (a, b) =>
          scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, rest) -
          scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, rest),
      )[0];

    if (!replacement) {
      options.onWarn?.(
        `palette quota unmet: ${matched}/${required}, no replacement for weak palette slot`,
      );
      break;
    }

    const replaced = result[replaceIdx];
    result = [...result];
    result[replaceIdx] = replacement;
    repairs.push({
      action: 'replaced',
      reason: 'palette_quota_swap',
      productId: replaced.id,
      replacementId: replacement.id,
    });
  }

  return result;
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
  const maxRounds = options.maxRepairRounds ?? 5;

  for (let round = 0; round < maxRounds; round++) {
    products = repairWeakProducts(products, input, options, repairs);

    const deduped = dedupeSetByRoles(products, input, options);
    products = deduped.products;
    repairs.push(...deduped.removed);

    if (products.length > input.maxProductsPerSet) {
      const mandatory =
        input.mandatoryTypes ?? detectMandatoryConceptTypesFromBrief(input.userPrompt);
      const mandatoryProducts = products.filter((p) =>
        mandatory.some((mt) => hasMandatoryTypeInProducts([p], mt)),
      );
      const optional = products.filter((p) => !mandatoryProducts.includes(p));
      const sortedOptional = optional
        .sort(
          (a, b) =>
            scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, products) -
            scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, products),
        )
        .slice(0, Math.max(0, input.maxProductsPerSet - mandatoryProducts.length));
      products = [...mandatoryProducts, ...sortedOptional].slice(0, input.maxProductsPerSet);
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
        input.minProductsPerSet,
        input.userPrompt,
      );
      repairs.push({
        action: 'downgraded',
        reason: `budget_enforce ${before}→${estimateSetTotalPrice(products)}`,
      });
    }

    products = repairMandatoryTypes(products, input, options, typeIndex, repairs);
    products = repairRequiredCategories(products, input, options, repairs);

    const beforeFill = products.length;
    products = tryFillMinCount(products, input, options, repairs, 'fill_min_count');
    if (products.length === beforeFill && products.length < input.minProductsPerSet) {
      break;
    }

    products = enforcePaletteQuota(products, input, options, repairs);

    const violations = validateSetConstraints(products, input);
    const hardLeft = violations.filter((v) =>
      [
        'duplicate_product_id',
        'duplicate_variant',
        'duplicate_role',
        'duplicate_catalog_category',
        'same_type_overflow',
        'budget_exceeded',
        'bundle_overflow',
        'color_conflict',
        'forbidden_color',
        'forbidden_item',
        'insufficient_stock',
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
      input.minProductsPerSet,
      input.userPrompt,
    );
    repairs.push({ action: 'downgraded', reason: 'final_budget_cap' });
  }

  // Финальный дедуп + добор min после всех repair-раундов.
  const finalDedup = dedupeSetByRoles(products, input, options);
  products = finalDedup.products;
  repairs.push(...finalDedup.removed);
  products = tryFillMinCount(products, input, options, repairs, 'final_fill_min_count');
  products = tryEnforceBudgetFloor(products, input, options, repairs);
  if (products.length < input.minProductsPerSet) {
    products = tryFillMinCount(products, input, options, repairs, 'absolute_final_fill');
    products = tryEnforceBudgetFloor(products, input, options, repairs);
  }
  products = enforcePaletteQuota(products, input, options, repairs);

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
    ['set_size_below_min', 'missing_mandatory_type'].includes(v.code),
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

export function buildSetWithRelaxation(
  input: BuildSetWithRelaxationInput,
  pool: CatalogProduct[],
): BuildSetWithRelaxationResult {
  const { constraints, options, initial = [], targetCount, onLog } = input;
  const minTarget = Math.max(1, targetCount);
  let best: BuildSetWithRelaxationResult = {
    products: [...initial],
    level: 0,
    relaxed: [],
  };

  const stripFillers = (products: CatalogProduct[]): CatalogProduct[] =>
    products.filter((p) => !isCorporateSetFiller(p, constraints.userPrompt));

  const setQualityCount = (products: CatalogProduct[]): number =>
    stripFillers(products).filter((p) => productPassesQualityGate(p, constraints)).length;

  const steps: SetRelaxationConfig[] = [
    { level: 0, relaxedAspects: [] },
    {
      level: 1,
      skipPaletteQuota: true,
      skipThematicScoring: true,
      relaxedAspects: ['palette_quota', 'thematic_scoring'],
    },
    {
      level: 2,
      skipPaletteQuota: true,
      skipThematicScoring: true,
      skipBrightDullHeuristics: true,
      relaxedAspects: ['palette_quota', 'thematic_scoring', 'bright_dull_heuristics'],
    },
    {
      level: 3,
      skipPaletteQuota: true,
      skipThematicScoring: true,
      skipBrightDullHeuristics: true,
      skipMissingMandatoryCategories: true,
      relaxedAspects: [
        'palette_quota',
        'thematic_scoring',
        'bright_dull_heuristics',
        'missing_mandatory_categories',
      ],
    },
    {
      level: 4,
      skipPaletteQuota: true,
      skipThematicScoring: true,
      skipBrightDullHeuristics: true,
      skipMissingMandatoryCategories: true,
      cosmeticOnly: true,
      relaxedAspects: ['cosmetic_only_hard_fill'],
    },
  ];

  for (const step of steps) {
    const relaxedConstraints: SelectionConstraintsInput = {
      ...constraints,
      minProductsPerSet: minTarget,
      requiredCategories: resolveRequiredCategories(
        constraints,
        pool,
        step.skipMissingMandatoryCategories,
        onLog,
      ),
    };
    const relaxedOptions: FinalizeSelectionOptions = {
      ...options,
      relaxation: step,
      onWarn: options.onWarn ?? onLog,
    };

    let products = [...initial];
    products = fillMandatoryCategorySlotsFirst(products, relaxedConstraints, relaxedOptions, pool, minTarget);

    const { products: finalized } = finalizeConceptSelection(products, relaxedConstraints, relaxedOptions);
    products = stripFillers(finalized);

    const qualityCount = setQualityCount(products);
    const fillerFreeCount = stripFillers(products).length;
    const fillerFreeProducts = stripFillers(products);
    const totalPrice = estimateSetTotalPrice(products);
    const fillerFreePrice = estimateSetTotalPrice(fillerFreeProducts);
    const budgetPerSet = resolveSelectionBudgetPerSet(relaxedConstraints);
    const { floor: budgetFloor } = resolveSetBudgetRange(relaxedConstraints.budgetMin, budgetPerSet);
    const meetsBudget =
      budgetFloor <= 0 ||
      fillerFreePrice >= budgetFloor * 0.95 ||
      totalPrice >= budgetFloor * 0.95;
    const meetsQualityCount = qualityCount >= minTarget && fillerFreeCount >= minTarget;
    onLog?.(
      `buildSetWithRelaxation L${step.level}: pool=${pool.length}, products=${products.length}, quality=${qualityCount}, relaxed=[${(step.relaxedAspects ?? []).join(', ')}]`,
    );

    if (products.length >= minTarget && meetsQualityCount && meetsBudget) {
      return { products: fillerFreeProducts, level: step.level, relaxed: step.relaxedAspects ?? [] };
    }

    if (step.level >= 4 && fillerFreeCount >= minTarget && meetsQualityCount) {
      const floorRepairs: SelectionRepairAction[] = [];
      products = tryEnforceBudgetFloor(fillerFreeProducts, relaxedConstraints, relaxedOptions, floorRepairs);
      const stripped = stripFillers(products);
      if (stripped.length >= minTarget) products = stripped;
      const totalAfterFloor = estimateSetTotalPrice(products);
      const meetsBudgetAfterFloor =
        budgetFloor <= 0 || totalAfterFloor >= budgetFloor * 0.92;
      if (stripped.length >= minTarget && meetsBudgetAfterFloor) {
        return { products: stripped, level: step.level, relaxed: step.relaxedAspects ?? [] };
      }
    }

    const countBonus = fillerFreeCount >= minTarget ? 50_000 : fillerFreeCount * 200 - 120_000;
    const qualityBonus = meetsQualityCount ? 20_000 : qualityCount * 2_000;
    const budgetBonus = meetsBudget ? 15_000 : Math.round(fillerFreePrice / 20);
    const setScore =
      countBonus +
      qualityBonus +
      budgetBonus +
      Math.round(fillerFreePrice / 10);
    const bestStripped = stripFillers(best.products);
    const bestMeetsBudget =
      budgetFloor <= 0 || estimateSetTotalPrice(bestStripped) >= budgetFloor * 0.95;
    const bestQualityCount = setQualityCount(best.products);
    const bestFillerFreeCount = bestStripped.length;
    const bestMeetsQuality = bestQualityCount >= minTarget && bestFillerFreeCount >= minTarget;
    const bestMeetsMin = bestFillerFreeCount >= minTarget;
    const bestCountBonus = bestMeetsMin ? 50_000 : bestFillerFreeCount * 500;
    const bestQualityBonus = bestMeetsQuality ? 20_000 : bestQualityCount * 2_000;
    const bestBudgetBonus = bestMeetsBudget
      ? 15_000
      : Math.round(estimateSetTotalPrice(bestStripped) / 20);
    const bestScore =
      bestCountBonus +
      bestQualityBonus +
      bestBudgetBonus +
      Math.round(estimateSetTotalPrice(bestStripped) / 10);

    const candidateMeetsMin = fillerFreeCount >= minTarget;
    if (candidateMeetsMin && !bestMeetsMin) {
      best = { products: fillerFreeProducts, level: step.level, relaxed: step.relaxedAspects ?? [] };
    } else if (!candidateMeetsMin && bestMeetsMin) {
      // не заменяем полный набор частичным
    } else if (candidateMeetsMin && setScore > bestScore) {
      best = { products: fillerFreeProducts, level: step.level, relaxed: step.relaxedAspects ?? [] };
    } else if (!bestMeetsMin && setScore > bestScore && fillerFreeCount > bestFillerFreeCount) {
      best = { products: fillerFreeProducts.length ? fillerFreeProducts : products, level: step.level, relaxed: step.relaxedAspects ?? [] };
    }
  }

  if (best.products.length < minTarget && pool.length > 0) {
    const lastStep = steps[steps.length - 1]!;
    const lastConstraints: SelectionConstraintsInput = {
      ...constraints,
      minProductsPerSet: minTarget,
      requiredCategories: resolveRequiredCategories(
        constraints,
        pool,
        lastStep.skipMissingMandatoryCategories,
        onLog,
      ),
    };
    const { products: lastTry } = finalizeConceptSelection(initial, lastConstraints, {
      ...options,
      relaxation: lastStep,
      onWarn: options.onWarn ?? onLog,
    });
    const cleaned = stripFillers(lastTry);
    if (cleaned.length > best.products.length) {
      best = { products: cleaned, level: lastStep.level, relaxed: [...(lastStep.relaxedAspects ?? []), 'last_resort_fill'] };
    }
  }

  return best;
}

function fillMandatoryCategorySlotsFirst(
  products: CatalogProduct[],
  input: SelectionConstraintsInput,
  options: FinalizeSelectionOptions,
  pool: CatalogProduct[],
  targetCount: number,
): CatalogProduct[] {
  let result = [...products];
  const requirements = resolveRequiredCategories(
    input,
    pool,
    options.relaxation?.skipMissingMandatoryCategories,
    options.onWarn,
  );
  if (!requirements.length) return result;

  const repairs: SelectionRepairAction[] = [];
  for (const req of requirements) {
    while (countProductsInRequiredCategory(result, req.key) < req.minCount && result.length < targetCount) {
      const candidate = pool
        .filter(
          (p) =>
            productMatchesRequiredCategory(p, req.key) &&
            !isBlockedFromOtherConcepts(p, options, result) &&
            canAddToSet(p, result, input, 'strict', options.relaxation),
        )
        .sort(
          (a, b) =>
            scoreCandidateInSet(b, input, options, result) - scoreCandidateInSet(a, input, options, result),
        )[0];
      if (!candidate) break;
      result.push(candidate);
      repairs.push({ action: 'added', reason: `mandatory_category_first:${req.key}`, productId: candidate.id });
    }
  }
  return result;
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
    // uiAllowedItems ОБЯЗАТЕЛЕН: названные позиции («повербанк 5000 мАч») приходят и из СТРУКТУРНОГО
    // поля allowedItems, а не только из свободного текста брифа. Без него mandatoryTypes здесь у́же,
    // чем у нейро-селектора ([...mandatoryConceptTypes, ...namedResolved.namedTypes]), и терминальный
    // бэкстоп считал названную позицию НЕобязательной — снимая её под бюджет / нулевой сток / max.
    mandatoryTypes: [
      ...new Set(resolveMandatoryTypesForBrief(filterInput.userPrompt, filterInput.allowedItems ?? [])),
    ],
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
