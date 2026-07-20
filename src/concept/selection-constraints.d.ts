import type { CatalogProduct } from '../providers/llm/catalog.util';
import { type CatalogFilterInput } from '../providers/llm/catalog-filter.util';
import { type RequiredCategoryRequirement } from '../requests/brief-required-categories.util';
export declare const DEFAULT_BUDGET_TOLERANCE_PCT = 2;
export declare const DEFAULT_SAME_TYPE_CAP = 2;
export declare const DISPLAY_TYPE_CAP = 1;
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
export declare function displayTypeForCap(product: CatalogProduct): string;
export declare function isDisplayCappedType(displayType: string): boolean;
export type ConstraintViolationCode = 'duplicate_product_id' | 'duplicate_variant' | 'duplicate_role' | 'same_type_overflow' | 'budget_exceeded' | 'set_size_below_min' | 'set_size_above_max' | 'missing_price' | 'missing_image' | 'insufficient_stock' | 'forbidden_item' | 'color_conflict' | 'forbidden_color' | 'bright_color_banned' | 'low_relevance_junk' | 'missing_mandatory_type' | 'missing_required_category' | 'budget_unreachable' | 'bundle_overflow' | 'other_type_overflow';
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
export declare function maxOtherRolesForSet(input: Pick<SelectionConstraintsInput, 'maxProductsPerSet'>): number;
export declare function getRoleFamily(type: string): string;
export declare function getProductRoleFamily(product: CatalogProduct): string;
export declare function effectiveBudgetCap(budgetPerSet: number, tolerancePct?: number): number;
export declare function resolveSelectionBudgetPerSet(input: SelectionConstraintsInput): number | null;
export declare function hasValidProductPrice(product: CatalogProduct): boolean;
export declare function hasValidProductImage(product: CatalogProduct): boolean;
export declare function hasSufficientStock(product: CatalogProduct, tirage: number): boolean;
export declare function hasRelaxedStock(product: CatalogProduct): boolean;
export declare function briefRejectsBrightColors(brief: string): boolean;
export declare function productLooksBright(product: CatalogProduct): boolean;
export declare function isLowRelevanceJunk(product: CatalogProduct, brief: string): boolean;
export declare function productPassesQualityGate(product: CatalogProduct, input: SelectionConstraintsInput): boolean;
export declare function validateSetConstraints(products: CatalogProduct[], input: SelectionConstraintsInput): ConstraintViolation[];
export interface FinalizeSelectionOptions {
    catalog: CatalogProduct[];
    filterInput?: CatalogFilterInput;
    conceptTitle?: string;
    conceptComposition?: string;
    typeIndex?: Map<string, CatalogProduct[]>;
    seed?: number;
    maxRepairRounds?: number;
    crossConceptBlockedIds?: Set<string>;
    crossConceptBlockedVariants?: Set<string>;
    onWarn?: (message: string) => void;
    relaxation?: SetRelaxationConfig;
}
export declare function dedupeSetByRoles(products: CatalogProduct[], input: SelectionConstraintsInput, refine?: Pick<FinalizeSelectionOptions, 'catalog' | 'filterInput' | 'conceptTitle' | 'conceptComposition' | 'relaxation'>): {
    products: CatalogProduct[];
    removed: SelectionRepairAction[];
};
export declare function finalizeConceptSelection(initial: CatalogProduct[], input: SelectionConstraintsInput, options: FinalizeSelectionOptions): {
    products: CatalogProduct[];
    report: SelectionValidationReport;
};
export declare function buildSetWithRelaxation(input: BuildSetWithRelaxationInput, pool: CatalogProduct[]): BuildSetWithRelaxationResult;
export declare function selectionConstraintsFromFilterInput(filterInput: CatalogFilterInput, countBounds: {
    min: number;
    max: number;
}): SelectionConstraintsInput;
export declare function scoreConceptSetQuality(report: SelectionValidationReport, products: CatalogProduct[]): number;
