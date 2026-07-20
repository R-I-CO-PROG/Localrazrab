"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISPLAY_TYPE_CAP = exports.DEFAULT_SAME_TYPE_CAP = exports.DEFAULT_BUDGET_TOLERANCE_PCT = void 0;
exports.displayTypeForCap = displayTypeForCap;
exports.isDisplayCappedType = isDisplayCappedType;
exports.maxOtherRolesForSet = maxOtherRolesForSet;
exports.getRoleFamily = getRoleFamily;
exports.getProductRoleFamily = getProductRoleFamily;
exports.effectiveBudgetCap = effectiveBudgetCap;
exports.resolveSelectionBudgetPerSet = resolveSelectionBudgetPerSet;
exports.hasValidProductPrice = hasValidProductPrice;
exports.hasValidProductImage = hasValidProductImage;
exports.hasSufficientStock = hasSufficientStock;
exports.hasRelaxedStock = hasRelaxedStock;
exports.briefRejectsBrightColors = briefRejectsBrightColors;
exports.productLooksBright = productLooksBright;
exports.isLowRelevanceJunk = isLowRelevanceJunk;
exports.productPassesQualityGate = productPassesQualityGate;
exports.validateSetConstraints = validateSetConstraints;
exports.dedupeSetByRoles = dedupeSetByRoles;
exports.finalizeConceptSelection = finalizeConceptSelection;
exports.buildSetWithRelaxation = buildSetWithRelaxation;
exports.selectionConstraintsFromFilterInput = selectionConstraintsFromFilterInput;
exports.scoreConceptSetQuality = scoreConceptSetQuality;
const concept_diversity_util_1 = require("../providers/llm/concept-diversity.util");
const mandatory_types_util_1 = require("../requests/mandatory-types.util");
const catalog_variant_util_1 = require("../providers/llm/catalog-variant.util");
const set_budget_util_1 = require("../providers/llm/set-budget.util");
const catalog_brief_relevance_util_1 = require("../providers/llm/catalog-brief-relevance.util");
const catalog_color_match_util_1 = require("../providers/llm/catalog-color-match.util");
const catalog_slot_picker_util_1 = require("../providers/llm/catalog-slot-picker.util");
const product_image_util_1 = require("../products/product-image.util");
const brief_constraints_util_1 = require("../requests/brief-constraints.util");
const brief_required_categories_util_1 = require("../requests/brief-required-categories.util");
const brief_category_buckets_util_1 = require("../catalog/brief-category-buckets.util");
const product_role_util_1 = require("./product-role.util");
const product_taxonomy_1 = require("./product-taxonomy");
const candidate_scoring_util_1 = require("./candidate-scoring.util");
exports.DEFAULT_BUDGET_TOLERANCE_PCT = 2;
exports.DEFAULT_SAME_TYPE_CAP = 2;
exports.DISPLAY_TYPE_CAP = 1;
const DISPLAY_CAPPED_TYPES = new Set([
    'drinkware',
    'notebook',
    'bag',
    'pen',
    'headwear',
    'apparel',
    'powerbank',
    'tech',
]);
function displayTypeForCap(product) {
    const role = (0, product_role_util_1.detectProductRole)(product);
    if (role.legacyType === 'powerbank' || role.role === 'powerbank')
        return 'powerbank';
    if (role.isTech || role.role === 'tech_accessory')
        return 'tech';
    if (role.role === 'pen' || (role.role === 'writing' && /ручк|pen|карандаш/i.test(product.name))) {
        return 'pen';
    }
    if (role.role === 'notebook' || role.legacyType === 'notebook' || role.legacyType === 'diary') {
        return 'notebook';
    }
    if (role.role === 'drinkware')
        return 'drinkware';
    if (role.role === 'bag')
        return 'bag';
    if (role.role === 'headwear')
        return 'headwear';
    if (role.role === 'apparel' || role.role === 'scarf')
        return 'apparel';
    return role.role;
}
function isDisplayCappedType(displayType) {
    return DISPLAY_CAPPED_TYPES.has(displayType);
}
function effectiveDisplayTypeCap(product, input) {
    if (isDisplayCappedType(displayTypeForCap(product)))
        return exports.DISPLAY_TYPE_CAP;
    return input.sameTypeCap ?? exports.DEFAULT_SAME_TYPE_CAP;
}
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
function isCappedToOne(family) {
    return family.startsWith('unique:') || [...UNIQUE_ROLE_FAMILY_LIMIT].includes(family);
}
function maxOtherRolesForSet(input) {
    return Math.max(2, Math.ceil(input.maxProductsPerSet * 0.6));
}
const JUNK_PRODUCT_PATTERNS = [
    /набор\s+из\s+\d+\s+инструмент/i,
    /\btire\b/i,
    /шиномонтаж/i,
    /автомобильн\w*\s+инструмент/i,
    /набор\s+ключей/i,
];
const BRIGHT_COLOR_HINTS = ['желт', 'yellow', 'оранж', 'orange', 'розов', 'pink', 'фукси', 'неон', 'ярк'];
function normalizeText(text) {
    return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}
function productHaystack(product) {
    return normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''} ${product.category}`);
}
const PLAIN_QUALIFIER_RE = /обычн|plain|basic|привычн|канцелярск|базов|standard/i;
const PREMIUM_STATIONERY_RE = /премиум|premium|кож|кожан|wood|орех|metal|металл|бамбук|подарочн|vip|executive|revello|metropol|rivista/i;
function isPlainNotebookProduct(product) {
    const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
    const role = (0, product_role_util_1.detectProductRole)(product).role;
    const text = productHaystack(product);
    if (type !== 'notebook' && role !== 'notebook' && !/блокнот|ежедневник|еженедельник|планер/i.test(text)) {
        return false;
    }
    if (PREMIUM_STATIONERY_RE.test(text))
        return false;
    if ((product.price ?? 0) >= 900)
        return false;
    return true;
}
function isPlainPenProduct(product) {
    const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
    const role = (0, product_role_util_1.detectProductRole)(product).role;
    const text = productHaystack(product);
    if (type !== 'pen' && role !== 'pen' && !/\bручк|карандаш|\bpen\b/i.test(text)) {
        return false;
    }
    if (/премиум|premium|metal|металл|бамбук|подарочн|vip|executive/i.test(text))
        return false;
    if ((product.price ?? 0) >= 700)
        return false;
    return true;
}
function briefBansPlainStationery(userPrompt) {
    const p = normalizeText(userPrompt);
    return (/исключ\w*.*(обычн|plain|basic|привычн|канцелярск)/.test(p) ||
        /без\s+(обычн|plain|basic|привычн|канцелярск)/.test(p) ||
        /(обычн|plain|basic|привычн|канцелярск).*(блокнот|ручк|канцеляр)/.test(p));
}
function matchesQualifiedForbiddenItem(forbiddenPhrase, product, userPrompt) {
    const f = normalizeText(forbiddenPhrase);
    const plainContext = PLAIN_QUALIFIER_RE.test(f) || briefBansPlainStationery(userPrompt);
    if (f.includes('блокнот') || f.includes('ежедневник') || f.includes('еженедельник')) {
        if (plainContext || f.includes('обычн'))
            return isPlainNotebookProduct(product);
    }
    if (f.includes('ручк') || f.includes('карандаш')) {
        if (plainContext || f.includes('обычн'))
            return isPlainPenProduct(product);
    }
    if (f.includes('канцеляр') && plainContext) {
        return (isPlainNotebookProduct(product) ||
            isPlainPenProduct(product) ||
            /стикер|скрепк|кнопк|eraser|ластик/i.test(productHaystack(product)));
    }
    return false;
}
function getRoleFamily(type) {
    return (0, product_taxonomy_1.familyForType)(type);
}
function getProductRoleFamily(product) {
    return (0, product_role_util_1.roleFamilyForProduct)(product);
}
function effectiveBudgetCap(budgetPerSet, tolerancePct = exports.DEFAULT_BUDGET_TOLERANCE_PCT) {
    return Math.round(budgetPerSet * (1 + Math.min(tolerancePct, 2) / 100));
}
function resolveSelectionBudgetPerSet(input) {
    return input.budgetPerSet ?? (0, set_budget_util_1.resolveBudgetPerSet)(input.budgetMin ?? null, input.budgetMax ?? null);
}
function hasValidProductPrice(product) {
    return product.price != null && product.price > 0;
}
function hasValidProductImage(product) {
    const catalogUrl = product.catalogImageUrl?.trim() ?? '';
    if (!catalogUrl || (0, product_image_util_1.isBrokenMercaiImageProxy)(catalogUrl))
        return false;
    if (catalogUrl.includes('/uploads/silhouettes/'))
        return false;
    if ((0, product_image_util_1.isLocallyResolvableCatalogImage)(catalogUrl))
        return true;
    return catalogUrl.startsWith('http://') || catalogUrl.startsWith('https://');
}
function hasSufficientStock(product, tirage) {
    const stock = product.stockAvailable;
    if (stock != null && stock <= 0)
        return false;
    if (tirage <= 0)
        return stock == null || stock > 0;
    if (stock == null)
        return true;
    return stock >= tirage;
}
function hasRelaxedStock(product) {
    const stock = product.stockAvailable;
    if (stock == null)
        return true;
    return stock > 0;
}
function briefRejectsBrightColors(brief) {
    return /без\s+ярк|не\s+ярк|спокойн|приглушен|muted|no\s+bright/i.test(normalizeText(brief));
}
function productLooksBright(product) {
    const text = productHaystack(product);
    return BRIGHT_COLOR_HINTS.some((hint) => text.includes(hint));
}
function isLowRelevanceJunk(product, brief) {
    const text = productHaystack(product);
    const briefNorm = normalizeText(brief);
    if (JUNK_PRODUCT_PATTERNS.some((re) => re.test(text))) {
        if (!/инструмент|tool|авто|машин/i.test(briefNorm))
            return true;
    }
    if ((0, catalog_brief_relevance_util_1.scoreBriefRelevance)(product, brief) <= -100)
        return true;
    return false;
}
function productPassesQualityGate(product, input) {
    if (!hasValidProductPrice(product))
        return false;
    if (!hasValidProductImage(product))
        return false;
    if (!hasSufficientStock(product, input.quantity ?? 0))
        return false;
    if (isLowRelevanceJunk(product, input.userPrompt))
        return false;
    const { forbiddenItems } = (0, brief_constraints_util_1.reconcileBriefConstraints)(input.userPrompt, input.allowedItems, input.forbiddenItems);
    if (productMatchesForbidden(product, forbiddenItems, input.userPrompt))
        return false;
    if (productViolatesBriefColors(product, input))
        return false;
    return true;
}
function productMatchesForbidden(product, forbiddenItems, userPrompt) {
    if (!forbiddenItems.length && !userPrompt)
        return false;
    const text = productHaystack(product);
    const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
    for (const item of forbiddenItems) {
        if (matchesQualifiedForbiddenItem(item, product, userPrompt))
            return true;
        const f = normalizeText(item);
        if (f.includes('алкогол') && /алкогол|вино|пив|шампан/i.test(text))
            return true;
        if (f.includes('еда') && /еда|продукт|снек|шоколад/i.test(text))
            return true;
        if (f.includes('одежд') && /футболк|худи|кепк|одежд|поло/i.test(text))
            return true;
        if (f.includes('пластик') && /фляг|flask|пластиков\w*\s+бутыл|многоразов\w*\s+стакан/i.test(text)) {
            return true;
        }
        if ((f === 'ручки' || f === 'ручка' || f === 'блокноты' || f === 'блокнот') && briefBansPlainStationery(userPrompt)) {
            if (f.includes('ручк') && isPlainPenProduct(product))
                return true;
            if (f.includes('блокнот') && isPlainNotebookProduct(product))
                return true;
            continue;
        }
        if (text.includes(f))
            return true;
        if (f.includes('одежд') && ['tshirt', 'hoodie', 'cap', 'bucket_hat', 'raincoat'].includes(type)) {
            return true;
        }
    }
    const reconciled = (0, brief_constraints_util_1.reconcileBriefConstraints)(userPrompt, [], forbiddenItems);
    if ((0, brief_constraints_util_1.productViolatesMaterialBan)(product.name, product.description ?? '', product.category, reconciled.forbiddenMaterials)) {
        return true;
    }
    if (reconciled.qualityFloor === 'premium' && (product.price ?? 0) > 0 && (product.price ?? 0) < 120) {
        if (/стикер|брелок|бейдж|обвес|наклейк/i.test(text))
            return true;
    }
    return false;
}
function productViolatesBriefColors(product, input, skipBrightDull = false) {
    const forbiddenHints = (0, catalog_brief_relevance_util_1.parseBriefForbiddenColors)(input.userPrompt);
    if ((0, catalog_color_match_util_1.productHasForbiddenColor)(product, forbiddenHints))
        return true;
    if ((0, catalog_color_match_util_1.productConflictsBriefPalette)(product, input.colors, input.userPrompt, forbiddenHints))
        return true;
    if (!skipBrightDull && briefRejectsBrightColors(input.userPrompt) && productLooksBright(product)) {
        const brandMatch = input.colors.length ? (0, catalog_color_match_util_1.scoreBrandColorMatch)(product, input.colors) : 0;
        if (brandMatch < 15)
            return true;
    }
    return false;
}
function resolveRequiredCategories(input, catalog, skipMissingInCatalog = false, onLog) {
    const all = input.requiredCategories ?? (0, brief_required_categories_util_1.extractRequiredCategoriesFromBrief)(input.userPrompt);
    if (!skipMissingInCatalog || !catalog?.length)
        return all;
    return all.filter((req) => {
        const found = catalog.some((p) => (0, brief_category_buckets_util_1.productMatchesRequiredCategory)(p, req.key));
        if (!found)
            onLog?.(`category ${req.key} not found in catalog`);
        return found;
    });
}
function buildScoreContext(products, input, filterInput, conceptTitle = '', conceptComposition = '', skipThematicScoring = false) {
    const presentFamilies = new Set(products.map(product_role_util_1.roleFamilyForProduct));
    const presentRoles = new Set(products.map((p) => (0, product_role_util_1.detectProductRole)(p).role));
    const presentDisplayTypes = new Set(products.map(displayTypeForCap));
    const bundleCount = products.filter(product_role_util_1.isGiftBundleProduct).length;
    const otherCount = products.filter((p) => (0, product_role_util_1.detectProductRole)(p).role === 'other').length;
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
function scoreCandidate(product, input, filterInput, conceptTitle = '', conceptComposition = '', currentProducts = [], skipThematicScoring = false) {
    const ctx = buildScoreContext(currentProducts, input, filterInput, conceptTitle, conceptComposition, skipThematicScoring);
    return (0, candidate_scoring_util_1.scoreCandidateForSet)(product, ctx).total;
}
function validateSetConstraints(products, input) {
    const violations = [];
    const budgetPerSet = resolveSelectionBudgetPerSet(input);
    const cap = budgetPerSet != null && budgetPerSet > 0
        ? effectiveBudgetCap(budgetPerSet, input.budgetTolerancePct)
        : null;
    const seenIds = new Set();
    const seenVariants = new Set();
    const roleFamilyCount = new Map();
    const typeCount = new Map();
    const displayTypeCount = new Map();
    const sameTypeCap = input.sameTypeCap ?? exports.DEFAULT_SAME_TYPE_CAP;
    for (const product of products) {
        if (seenIds.has(product.id)) {
            violations.push({
                code: 'duplicate_product_id',
                message: `Дубль productId: ${product.id}`,
                productId: product.id,
            });
        }
        seenIds.add(product.id);
        const vk = (0, catalog_variant_util_1.productVariantKey)(product);
        if (seenVariants.has(vk)) {
            violations.push({
                code: 'duplicate_variant',
                message: `Дубль варианта: ${product.name}`,
                productId: product.id,
            });
        }
        seenVariants.add(vk);
        const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
        const family = (0, product_role_util_1.roleFamilyForProduct)(product);
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
        const role = (0, product_role_util_1.detectProductRole)(product).role;
        const displayType = displayTypeForCap(product);
        const displayUsed = (displayTypeCount.get(displayType) ?? 0) + 1;
        displayTypeCount.set(displayType, displayUsed);
        if (isDisplayCappedType(displayType) && displayUsed > exports.DISPLAY_TYPE_CAP) {
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
        if (!isDisplayCappedType(displayType) &&
            !isCappedToOne(family) &&
            typeUsed > sameTypeCap &&
            role !== 'other') {
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
        const { forbiddenItems } = (0, brief_constraints_util_1.reconcileBriefConstraints)(input.userPrompt, input.allowedItems, input.forbiddenItems);
        if (productMatchesForbidden(product, forbiddenItems, input.userPrompt)) {
            violations.push({
                code: 'forbidden_item',
                message: `Запрещённая категория: ${product.name}`,
                productId: product.id,
            });
        }
        if (productViolatesBriefColors(product, input)) {
            const forbiddenHints = (0, catalog_brief_relevance_util_1.parseBriefForbiddenColors)(input.userPrompt);
            const isForbidden = (0, catalog_color_match_util_1.productHasForbiddenColor)(product, forbiddenHints);
            violations.push({
                code: isForbidden ? 'forbidden_color' : 'color_conflict',
                message: isForbidden ? `Запрещённый цвет: ${product.name}` : `Конфликт цвета: ${product.name}`,
                productId: product.id,
            });
        }
    }
    if (cap != null && products.length > 0) {
        const total = (0, set_budget_util_1.estimateSetTotalPrice)(products);
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
    const mandatory = input.mandatoryTypes ?? (0, concept_diversity_util_1.detectMandatoryConceptTypesFromBrief)(input.userPrompt);
    for (const mt of mandatory) {
        if (!(0, concept_diversity_util_1.hasMandatoryTypeInProducts)(products, mt)) {
            violations.push({
                code: 'missing_mandatory_type',
                message: `Нет обязательного типа: ${mt}`,
                details: { type: mt },
            });
        }
    }
    for (const req of resolveRequiredCategories(input)) {
        const count = (0, brief_category_buckets_util_1.countProductsInRequiredCategory)(products, req.key);
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
function canAddToSet(product, current, input, stockMode = 'strict', relaxation) {
    const skipBrightDull = relaxation?.skipBrightDullHeuristics ?? false;
    const cosmeticOnly = relaxation?.cosmeticOnly ?? false;
    if (!hasValidProductPrice(product))
        return false;
    if (stockMode === 'relaxed') {
        if (!hasRelaxedStock(product))
            return false;
    }
    else if (!hasSufficientStock(product, input.quantity ?? 0)) {
        return false;
    }
    if (cosmeticOnly) {
        if (current.some((p) => p.id === product.id))
            return false;
        const variants = new Set(current.map(catalog_variant_util_1.productVariantKey));
        if (variants.has((0, catalog_variant_util_1.productVariantKey)(product)))
            return false;
        const { forbiddenItems } = (0, brief_constraints_util_1.reconcileBriefConstraints)(input.userPrompt, input.allowedItems, input.forbiddenItems);
        if (productMatchesForbidden(product, forbiddenItems, input.userPrompt))
            return false;
        if ((0, catalog_color_match_util_1.productHasForbiddenColor)(product, (0, catalog_brief_relevance_util_1.parseBriefForbiddenColors)(input.userPrompt)))
            return false;
        const localTypes = new Set(current.map(concept_diversity_util_1.detectConceptProductType));
        if ((0, concept_diversity_util_1.typeConflictsInSet)(localTypes, (0, concept_diversity_util_1.detectConceptProductType)(product)))
            return false;
        const cosmeticFamily = (0, product_role_util_1.roleFamilyForProduct)(product);
        if (isCappedToOne(cosmeticFamily) && current.some((p) => (0, product_role_util_1.roleFamilyForProduct)(p) === cosmeticFamily)) {
            return false;
        }
        return true;
    }
    if (!relaxation?.skipThematicScoring && isLowRelevanceJunk(product, input.userPrompt))
        return false;
    if (productViolatesBriefColors(product, input, skipBrightDull))
        return false;
    if (current.some((p) => p.id === product.id))
        return false;
    const localTypes = new Set(current.map(concept_diversity_util_1.detectConceptProductType));
    const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
    if ((0, concept_diversity_util_1.typeConflictsInSet)(localTypes, type))
        return false;
    const family = (0, product_role_util_1.roleFamilyForProduct)(product);
    const familyCount = current.filter((p) => (0, product_role_util_1.roleFamilyForProduct)(p) === family).length;
    if (isCappedToOne(family) && familyCount >= 1)
        return false;
    const displayType = displayTypeForCap(product);
    const displayCount = current.filter((p) => displayTypeForCap(p) === displayType).length;
    if (isDisplayCappedType(displayType) && displayCount >= exports.DISPLAY_TYPE_CAP)
        return false;
    const role = (0, product_role_util_1.detectProductRole)(product).role;
    if (role === 'other') {
        const otherCount = current.filter((p) => (0, product_role_util_1.detectProductRole)(p).role === 'other').length;
        if (otherCount >= maxOtherRolesForSet(input))
            return false;
    }
    const sameTypeCount = current.filter((p) => (0, product_role_util_1.detectProductRole)(p).role === role).length;
    const cap = effectiveDisplayTypeCap(product, input);
    if (!isDisplayCappedType(displayType) && !isCappedToOne(family) && sameTypeCount >= cap && role !== 'other') {
        return false;
    }
    const variants = new Set(current.map(catalog_variant_util_1.productVariantKey));
    if (variants.has((0, catalog_variant_util_1.productVariantKey)(product)))
        return false;
    return true;
}
function repairWeakProducts(products, input, options, repairs) {
    const result = [...products];
    for (let i = 0; i < result.length; i++) {
        const product = result[i];
        const needsReplace = !hasValidProductImage(product) ||
            !hasSufficientStock(product, input.quantity ?? 0) ||
            productMatchesForbidden(product, (0, brief_constraints_util_1.reconcileBriefConstraints)(input.userPrompt, input.allowedItems, input.forbiddenItems).forbiddenItems, input.userPrompt) ||
            productViolatesBriefColors(product, input) ||
            isLowRelevanceJunk(product, input.userPrompt) ||
            ((0, product_role_util_1.isGiftBundleProduct)(product) && result.filter(product_role_util_1.isGiftBundleProduct).length > 1);
        if (!needsReplace)
            continue;
        const rest = result.filter((_, idx) => idx !== i);
        const reason = !hasValidProductImage(product)
            ? 'missing_image'
            : !hasSufficientStock(product, input.quantity ?? 0)
                ? 'insufficient_stock'
                : productMatchesForbidden(product, (0, brief_constraints_util_1.reconcileBriefConstraints)(input.userPrompt, input.allowedItems, input.forbiddenItems).forbiddenItems, input.userPrompt)
                    ? 'forbidden_item'
                    : productViolatesBriefColors(product, input)
                        ? 'color_conflict'
                        : (0, product_role_util_1.isGiftBundleProduct)(product)
                            ? 'bundle_overflow'
                            : 'low_relevance';
        const pool = options.catalog.filter((c) => !isBlockedFromOtherConcepts(c, options, rest) &&
            canAddToSet(c, rest, input) &&
            (reason !== 'missing_image' || hasValidProductImage(c)));
        const candidate = pool.sort((a, b) => scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, rest) -
            scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, rest))[0];
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
function scoreCandidateInSet(product, input, options, products) {
    return scoreCandidate(product, input, options.filterInput, options.conceptTitle, options.conceptComposition, products, options.relaxation?.skipThematicScoring);
}
function mandatoryCandidatePool(mt, typeIndex, catalog) {
    const aliases = (0, concept_diversity_util_1.mandatoryTypeAliases)(mt);
    const pool = [];
    const seen = new Set();
    for (const alias of aliases) {
        for (const p of typeIndex.get(alias) ?? []) {
            if (!seen.has(p.id)) {
                seen.add(p.id);
                pool.push(p);
            }
        }
        for (const p of catalog) {
            if ((0, concept_diversity_util_1.detectConceptProductType)(p) !== alias)
                continue;
            if (!seen.has(p.id)) {
                seen.add(p.id);
                pool.push(p);
            }
        }
    }
    return pool;
}
function findReplaceableIndexForMandatory(products, mt, input, options) {
    const mandatoryFamily = (0, concept_diversity_util_1.getProductTypeFamily)((0, concept_diversity_util_1.mandatoryTypeAliases)(mt)[0]);
    let worstIdx = -1;
    let worstScore = Infinity;
    for (let i = 0; i < products.length; i++) {
        const p = products[i];
        const type = (0, concept_diversity_util_1.detectConceptProductType)(p);
        const family = (0, concept_diversity_util_1.getProductTypeFamily)(type);
        const conflicts = (0, concept_diversity_util_1.mandatoryTypeAliases)(mt).includes(type) ||
            family === mandatoryFamily ||
            (0, concept_diversity_util_1.typeConflictsInSet)(new Set((0, concept_diversity_util_1.mandatoryTypeAliases)(mt)), type);
        if (!conflicts && products.length <= input.minProductsPerSet)
            continue;
        const score = scoreCandidateInSet(p, input, options, products);
        if (score < worstScore) {
            worstScore = score;
            worstIdx = i;
        }
    }
    if (worstIdx >= 0)
        return worstIdx;
    for (let i = 0; i < products.length; i++) {
        const score = scoreCandidateInSet(products[i], input, options, products);
        if (score < worstScore) {
            worstScore = score;
            worstIdx = i;
        }
    }
    return worstIdx;
}
function repairMandatoryTypes(products, input, options, typeIndex, repairs) {
    const mandatory = [
        ...new Set(input.mandatoryTypes ?? (0, concept_diversity_util_1.detectMandatoryConceptTypesFromBrief)(input.userPrompt)),
    ];
    let result = [...products];
    for (const mt of mandatory) {
        if ((0, concept_diversity_util_1.hasMandatoryTypeInProducts)(result, mt))
            continue;
        const pool = mandatoryCandidatePool(mt, typeIndex, options.catalog)
            .filter((p) => !isBlockedFromOtherConcepts(p, options, result) &&
            productPassesQualityGate(p, input))
            .sort((a, b) => scoreCandidateInSet(b, input, options, result) -
            scoreCandidateInSet(a, input, options, result));
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
function repairRequiredCategories(products, input, options, repairs) {
    let result = [...products];
    const requirements = resolveRequiredCategories(input, options.catalog, options.relaxation?.skipMissingMandatoryCategories, options.onWarn);
    if (!requirements.length)
        return result;
    for (const req of requirements) {
        while ((0, brief_category_buckets_util_1.countProductsInRequiredCategory)(result, req.key) < req.minCount) {
            const pool = options.catalog
                .filter((p) => !isBlockedFromOtherConcepts(p, options, result) &&
                (0, brief_category_buckets_util_1.productMatchesRequiredCategory)(p, req.key) &&
                productPassesQualityGate(p, input))
                .sort((a, b) => scoreCandidateInSet(b, input, options, result) -
                scoreCandidateInSet(a, input, options, result));
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
            }
            else {
                break;
            }
        }
    }
    return result;
}
function isBlockedFromOtherConcepts(product, options, currentProducts) {
    if (currentProducts.some((p) => p.id === product.id))
        return false;
    const vk = (0, catalog_variant_util_1.productVariantKey)(product);
    if (currentProducts.some((p) => (0, catalog_variant_util_1.productVariantKey)(p) === vk))
        return false;
    if (options.crossConceptBlockedIds?.has(product.id))
        return true;
    if (options.crossConceptBlockedVariants?.has(vk))
        return true;
    return false;
}
function dedupeSetByRoles(products, input, refine) {
    const removed = [];
    const kept = [];
    const roleFamilyCount = new Map();
    const typeCount = new Map();
    const displayTypeCount = new Map();
    const seenIds = new Set();
    const seenVariants = new Set();
    const sameTypeCap = input.sameTypeCap ?? exports.DEFAULT_SAME_TYPE_CAP;
    const skipThematic = refine?.relaxation?.skipThematicScoring;
    const sorted = [...products].sort((a, b) => scoreCandidate(b, input, refine?.filterInput, refine?.conceptTitle ?? '', refine?.conceptComposition ?? '', products, skipThematic) -
        scoreCandidate(a, input, refine?.filterInput, refine?.conceptTitle ?? '', refine?.conceptComposition ?? '', products, skipThematic));
    for (const product of sorted) {
        if (seenIds.has(product.id)) {
            removed.push({ action: 'removed', reason: 'duplicate_product_id', productId: product.id });
            continue;
        }
        const vk = (0, catalog_variant_util_1.productVariantKey)(product);
        if (seenVariants.has(vk)) {
            removed.push({ action: 'removed', reason: 'duplicate_variant', productId: product.id });
            continue;
        }
        if (!productPassesQualityGate(product, input)) {
            removed.push({ action: 'removed', reason: 'quality_gate', productId: product.id });
            continue;
        }
        const type = (0, concept_diversity_util_1.detectConceptProductType)(product);
        const family = (0, product_role_util_1.roleFamilyForProduct)(product);
        const familyUsed = roleFamilyCount.get(family) ?? 0;
        if (isCappedToOne(family) && familyUsed >= 1) {
            removed.push({ action: 'removed', reason: `duplicate_role:${family}`, productId: product.id });
            continue;
        }
        const displayType = displayTypeForCap(product);
        const displayUsed = displayTypeCount.get(displayType) ?? 0;
        if (isDisplayCappedType(displayType) && displayUsed >= exports.DISPLAY_TYPE_CAP) {
            const catalog = refine?.catalog;
            if (catalog?.length) {
                const presentDisplay = new Set(kept.map(displayTypeForCap));
                const replacement = catalog
                    .filter((p) => !seenIds.has(p.id) &&
                    !seenVariants.has((0, catalog_variant_util_1.productVariantKey)(p)) &&
                    !presentDisplay.has(displayTypeForCap(p)) &&
                    canAddToSet(p, kept, input, 'strict', refine?.relaxation))
                    .sort((a, b) => scoreCandidate(b, input, refine?.filterInput, refine?.conceptTitle ?? '', refine?.conceptComposition ?? '', kept, skipThematic) -
                    scoreCandidate(a, input, refine?.filterInput, refine?.conceptTitle ?? '', refine?.conceptComposition ?? '', kept, skipThematic))[0];
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
                        seenVariants.delete((0, catalog_variant_util_1.productVariantKey)(replaced));
                        seenIds.add(replacement.id);
                        seenVariants.add((0, catalog_variant_util_1.productVariantKey)(replacement));
                        continue;
                    }
                }
            }
            removed.push({ action: 'removed', reason: `same_type_overflow:${displayType}`, productId: product.id });
            continue;
        }
        const role = (0, product_role_util_1.detectProductRole)(product).role;
        const typeUsed = typeCount.get(role) ?? 0;
        if (role === 'other' && typeUsed >= maxOtherRolesForSet(input)) {
            removed.push({ action: 'removed', reason: 'other_type_overflow', productId: product.id });
            continue;
        }
        if (!isDisplayCappedType(displayType) &&
            !isCappedToOne(family) &&
            typeUsed >= sameTypeCap &&
            role !== 'other') {
            removed.push({ action: 'removed', reason: `same_type_overflow:${type}`, productId: product.id });
            continue;
        }
        kept.push(product);
        seenIds.add(product.id);
        seenVariants.add(vk);
        roleFamilyCount.set(family, familyUsed + 1);
        typeCount.set(role, typeUsed + 1);
        displayTypeCount.set(displayType, displayUsed + 1);
    }
    return { products: kept, removed };
}
function countPaletteMatchedProducts(products, colors, userPrompt) {
    if (!colors.length)
        return products.length;
    const forbiddenHints = (0, catalog_brief_relevance_util_1.parseBriefForbiddenColors)(userPrompt);
    return products.filter((p) => (0, catalog_color_match_util_1.scoreBriefPaletteMatch)(p, colors, forbiddenHints) > 0).length;
}
function tryFillMinCount(products, input, options, repairs, reason) {
    let result = [...products];
    const relaxation = options.relaxation;
    const budgetPerSet = resolveSelectionBudgetPerSet(input);
    const budgetCap = budgetPerSet != null && budgetPerSet > 0
        ? effectiveBudgetCap(budgetPerSet, input.budgetTolerancePct)
        : null;
    while (result.length < input.minProductsPerSet) {
        const imagePool = options.catalog.filter((p) => hasValidProductImage(p));
        const fillCatalog = imagePool.length >= input.minProductsPerSet ? imagePool : options.catalog;
        let candidate = fillCatalog
            .filter((p) => !isBlockedFromOtherConcepts(p, options, result) &&
            canAddToSet(p, result, input, 'strict', relaxation))
            .sort((a, b) => scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring) -
            scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring))[0];
        if (!candidate) {
            candidate = fillCatalog
                .filter((p) => !isBlockedFromOtherConcepts(p, options, result) &&
                canAddToSet(p, result, input, 'relaxed', relaxation))
                .sort((a, b) => scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring) -
                scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, relaxation?.skipThematicScoring))[0];
            if (!candidate && relaxation?.cosmeticOnly) {
                candidate = fillCatalog
                    .filter((p) => !isBlockedFromOtherConcepts(p, options, result) &&
                    canAddToSet(p, result, input, 'relaxed', { ...relaxation, cosmeticOnly: true }))
                    .sort((a, b) => scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, true) -
                    scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, true))[0];
            }
            if (!candidate) {
                const forbiddenHints = (0, catalog_brief_relevance_util_1.parseBriefForbiddenColors)(input.userPrompt);
                const { forbiddenItems } = (0, brief_constraints_util_1.reconcileBriefConstraints)(input.userPrompt, input.allowedItems, input.forbiddenItems);
                const emergency = fillCatalog
                    .filter((p) => {
                    if (isBlockedFromOtherConcepts(p, options, result))
                        return false;
                    if (result.some((x) => x.id === p.id))
                        return false;
                    if (result.some((x) => (0, catalog_variant_util_1.productVariantKey)(x) === (0, catalog_variant_util_1.productVariantKey)(p)))
                        return false;
                    if (!hasValidProductPrice(p))
                        return false;
                    if (!hasRelaxedStock(p))
                        return false;
                    if (productMatchesForbidden(p, forbiddenItems, input.userPrompt))
                        return false;
                    if ((0, catalog_color_match_util_1.productHasForbiddenColor)(p, forbiddenHints))
                        return false;
                    if (budgetCap != null && budgetCap > 0) {
                        const nextTotal = (0, set_budget_util_1.estimateSetTotalPrice)(result) + (p.price ?? 0);
                        if (nextTotal > budgetCap)
                            return false;
                    }
                    return true;
                })
                    .sort((a, b) => scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, true) -
                    scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, true))[0];
                if (emergency) {
                    candidate = emergency;
                    options.onWarn?.(`min fill emergency candidate ${candidate.name.slice(0, 40)} (${result.length + 1}/${input.minProductsPerSet})`);
                }
            }
            if (!candidate) {
                options.onWarn?.(`min fill stopped at ${result.length}/${input.minProductsPerSet}: no candidate (strict+relaxed stock)`);
                break;
            }
            options.onWarn?.(`min fill used relaxed stock for ${candidate.name.slice(0, 40)} (${result.length + 1}/${input.minProductsPerSet})`);
        }
        result.push(candidate);
        repairs.push({ action: 'added', reason, productId: candidate.id });
    }
    return result;
}
function enforcePaletteQuota(products, input, options, repairs) {
    if (options.relaxation?.skipPaletteQuota)
        return products;
    if (!input.colors.length || products.length === 0)
        return products;
    const required = Math.ceil(input.minProductsPerSet * 0.5);
    let result = [...products];
    const forbiddenHints = (0, catalog_brief_relevance_util_1.parseBriefForbiddenColors)(input.userPrompt);
    while (countPaletteMatchedProducts(result, input.colors, input.userPrompt) < required && result.length > 0) {
        const matched = countPaletteMatchedProducts(result, input.colors, input.userPrompt);
        const pool = options.catalog
            .filter((p) => hasValidProductImage(p) &&
            !isBlockedFromOtherConcepts(p, options, result) &&
            (0, catalog_color_match_util_1.scoreBriefPaletteMatch)(p, input.colors, forbiddenHints) > 0 &&
            canAddToSet(p, result, input))
            .sort((a, b) => scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, result) -
            scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, result));
        const candidate = pool[0];
        if (candidate) {
            result.push(candidate);
            repairs.push({ action: 'added', reason: 'palette_quota_fill', productId: candidate.id });
            continue;
        }
        const replaceIdx = result
            .map((p, i) => ({
            i,
            palette: (0, catalog_color_match_util_1.scoreBriefPaletteMatch)(p, input.colors, forbiddenHints),
            score: scoreCandidate(p, input, options.filterInput, options.conceptTitle, options.conceptComposition, result, options.relaxation?.skipThematicScoring),
            displayType: displayTypeForCap(p),
        }))
            .filter((x) => x.palette <= 0)
            .sort((a, b) => a.score - b.score)[0]?.i;
        if (replaceIdx == null || replaceIdx < 0) {
            options.onWarn?.(`palette quota unmet: ${matched}/${required} palette-matched products`);
            break;
        }
        const rest = result.filter((_, idx) => idx !== replaceIdx);
        const replacedType = displayTypeForCap(result[replaceIdx]);
        const replacement = options.catalog
            .filter((p) => hasValidProductImage(p) &&
            !isBlockedFromOtherConcepts(p, options, rest) &&
            (0, catalog_color_match_util_1.scoreBriefPaletteMatch)(p, input.colors, forbiddenHints) > 0 &&
            canAddToSet(p, rest, input, 'strict', options.relaxation) &&
            (displayTypeForCap(p) === replacedType || !rest.some((r) => displayTypeForCap(r) === displayTypeForCap(p))))
            .sort((a, b) => scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, rest) -
            scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, rest))[0];
        if (!replacement) {
            options.onWarn?.(`palette quota unmet: ${matched}/${required}, no replacement for weak palette slot`);
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
function finalizeConceptSelection(initial, input, options) {
    const repairs = [];
    const budgetPerSet = resolveSelectionBudgetPerSet(input);
    const budgetCap = budgetPerSet != null && budgetPerSet > 0
        ? effectiveBudgetCap(budgetPerSet, input.budgetTolerancePct)
        : null;
    let products = [...initial];
    const typeIndex = options.typeIndex ?? (0, catalog_slot_picker_util_1.indexCatalogByProductType)(options.catalog);
    const maxRounds = options.maxRepairRounds ?? 5;
    for (let round = 0; round < maxRounds; round++) {
        products = repairWeakProducts(products, input, options, repairs);
        const deduped = dedupeSetByRoles(products, input, options);
        products = deduped.products;
        repairs.push(...deduped.removed);
        if (products.length > input.maxProductsPerSet) {
            const mandatory = input.mandatoryTypes ?? (0, concept_diversity_util_1.detectMandatoryConceptTypesFromBrief)(input.userPrompt);
            const mandatoryProducts = products.filter((p) => mandatory.some((mt) => (0, concept_diversity_util_1.hasMandatoryTypeInProducts)([p], mt)));
            const optional = products.filter((p) => !mandatoryProducts.includes(p));
            const sortedOptional = optional
                .sort((a, b) => scoreCandidate(b, input, options.filterInput, options.conceptTitle, options.conceptComposition, products) -
                scoreCandidate(a, input, options.filterInput, options.conceptTitle, options.conceptComposition, products))
                .slice(0, Math.max(0, input.maxProductsPerSet - mandatoryProducts.length));
            products = [...mandatoryProducts, ...sortedOptional].slice(0, input.maxProductsPerSet);
            repairs.push({ action: 'trimmed', reason: `trim_to_max_${input.maxProductsPerSet}` });
        }
        if (budgetCap != null && products.length > 0 && (0, set_budget_util_1.estimateSetTotalPrice)(products) > budgetCap) {
            const before = (0, set_budget_util_1.estimateSetTotalPrice)(products);
            products = (0, set_budget_util_1.enforceSetBudget)(products, options.catalog, budgetCap, new Set(products.map((p) => p.id)), new Set(products.map(catalog_variant_util_1.productVariantKey)), (options.seed ?? 0) + round * 17, input.minProductsPerSet);
            repairs.push({
                action: 'downgraded',
                reason: `budget_enforce ${before}→${(0, set_budget_util_1.estimateSetTotalPrice)(products)}`,
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
        const hardLeft = violations.filter((v) => [
            'duplicate_product_id',
            'duplicate_variant',
            'duplicate_role',
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
        ].includes(v.code));
        if (hardLeft.length === 0)
            break;
    }
    if (budgetCap != null && products.length > 0 && (0, set_budget_util_1.estimateSetTotalPrice)(products) > budgetCap) {
        products = (0, set_budget_util_1.enforceSetBudget)(products, options.catalog, budgetCap, new Set(), new Set(), options.seed ?? 0, input.minProductsPerSet);
        repairs.push({ action: 'downgraded', reason: 'final_budget_cap' });
    }
    const finalDedup = dedupeSetByRoles(products, input, options);
    products = finalDedup.products;
    repairs.push(...finalDedup.removed);
    products = tryFillMinCount(products, input, options, repairs, 'final_fill_min_count');
    products = enforcePaletteQuota(products, input, options, repairs);
    const violations = validateSetConstraints(products, input);
    const total = products.length > 0 ? (0, set_budget_util_1.estimateSetTotalPrice)(products) : 0;
    const budgetUsedPct = budgetPerSet != null && budgetPerSet > 0 && products.length > 0
        ? Math.round((total / budgetPerSet) * 100)
        : null;
    const budgetFitFailed = budgetCap != null &&
        products.length > 0 &&
        total > budgetCap;
    const softOnly = violations.every((v) => ['set_size_below_min', 'missing_mandatory_type', 'budget_unreachable'].includes(v.code));
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
function buildSetWithRelaxation(input, pool) {
    const { constraints, options, initial = [], targetCount, onLog } = input;
    const minTarget = Math.max(1, targetCount);
    let best = {
        products: [...initial],
        level: 0,
        relaxed: [],
    };
    const steps = [
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
        const relaxedConstraints = {
            ...constraints,
            minProductsPerSet: minTarget,
            requiredCategories: resolveRequiredCategories(constraints, pool, step.skipMissingMandatoryCategories, onLog),
        };
        const relaxedOptions = {
            ...options,
            relaxation: step,
            onWarn: options.onWarn ?? onLog,
        };
        let products = [...initial];
        products = fillMandatoryCategorySlotsFirst(products, relaxedConstraints, relaxedOptions, pool, minTarget);
        const { products: finalized } = finalizeConceptSelection(products, relaxedConstraints, relaxedOptions);
        products = finalized;
        onLog?.(`buildSetWithRelaxation L${step.level}: pool=${pool.length}, products=${products.length}, relaxed=[${(step.relaxedAspects ?? []).join(', ')}]`);
        if (products.length > best.products.length) {
            best = { products, level: step.level, relaxed: step.relaxedAspects ?? [] };
        }
        if (products.length >= minTarget) {
            return { products, level: step.level, relaxed: step.relaxedAspects ?? [] };
        }
    }
    return best;
}
function fillMandatoryCategorySlotsFirst(products, input, options, pool, targetCount) {
    let result = [...products];
    const requirements = resolveRequiredCategories(input, pool, options.relaxation?.skipMissingMandatoryCategories, options.onWarn);
    if (!requirements.length)
        return result;
    const repairs = [];
    for (const req of requirements) {
        while ((0, brief_category_buckets_util_1.countProductsInRequiredCategory)(result, req.key) < req.minCount && result.length < targetCount) {
            const candidate = pool
                .filter((p) => (0, brief_category_buckets_util_1.productMatchesRequiredCategory)(p, req.key) &&
                !isBlockedFromOtherConcepts(p, options, result) &&
                canAddToSet(p, result, input, 'strict', options.relaxation))
                .sort((a, b) => scoreCandidateInSet(b, input, options, result) - scoreCandidateInSet(a, input, options, result))[0];
            if (!candidate)
                break;
            result.push(candidate);
            repairs.push({ action: 'added', reason: `mandatory_category_first:${req.key}`, productId: candidate.id });
        }
    }
    return result;
}
function selectionConstraintsFromFilterInput(filterInput, countBounds) {
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
        mandatoryTypes: [...new Set((0, mandatory_types_util_1.resolveMandatoryTypesForBrief)(filterInput.userPrompt))],
        requiredCategories: (0, brief_required_categories_util_1.extractRequiredCategoriesFromBrief)(filterInput.userPrompt),
    };
}
function scoreConceptSetQuality(report, products) {
    let score = 85;
    score -= report.violations.length * 8;
    score -= report.budgetFitFailed ? 25 : 0;
    if (report.budgetUsedPct != null) {
        if (report.budgetUsedPct > 102)
            score -= 20;
        else if (report.budgetUsedPct >= 70)
            score += 5;
    }
    const withImage = products.filter(hasValidProductImage).length;
    const imageRatio = products.length > 0 ? withImage / products.length : 0;
    score += Math.round(imageRatio * 15);
    if (imageRatio < 1)
        score -= Math.round((1 - imageRatio) * 40);
    const roles = new Set(products.map((p) => (0, product_role_util_1.detectProductRole)(p).role));
    score += Math.min(12, roles.size * 2);
    const bundleCount = products.filter(product_role_util_1.isGiftBundleProduct).length;
    if (bundleCount > 1)
        score -= 25;
    return Math.max(0, Math.min(100, Math.round(score)));
}
//# sourceMappingURL=selection-constraints.js.map