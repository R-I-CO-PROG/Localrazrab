import type { BudgetMode, GenerationMode, ProjectFormData } from "@/lib/types";
import { getEffectiveCategory } from "@/lib/category-utils";
import type { BlacklistItem } from "@/lib/brand-palette";
import { sanitizeFormBudget } from "@/lib/sanitize-int";

export interface ConceptGenerationInput {
  description: string;
  generationMode: GenerationMode;
  category: string;
  budget: number;
  totalBudget: number;
  budgetMode: BudgetMode;
  quantity: number;
  setItemCount: number;
  useProductCountLimit: boolean;
  giftBoxEnabled: boolean;
  minProductsPerSet: number;
  maxProductsPerSet: number;
  conceptCount: number;
  visualizationCount: number;
  colors: string[];
  allowedItems: string[];
  excludedItems: string[];
  blacklistedProductIds?: string[];
  blacklistedSupplierIds?: string[];
  files: ProjectFormData["files"];
  selectedProductIds?: string[];
  selectedLogoId?: string;
  selectedBrandbookId?: string;
  requestId?: string;
}

export function toGenerationPayload(
  form: ProjectFormData,
  blacklistItems: BlacklistItem[] = [],
): ConceptGenerationInput {
  const safe = sanitizeFormBudget(form);
  return {
    description: form.description,
    generationMode: form.generationMode ?? "catalog",
    category: getEffectiveCategory(form.categoryPreset, form.categoryCustom),
    budget: safe.budget,
    totalBudget: safe.totalBudget,
    budgetMode: form.budgetMode,
    quantity: safe.quantity,
    setItemCount: safe.setItemCount ?? form.setItemCount,
    useProductCountLimit: form.useProductCountLimit,
    giftBoxEnabled: form.giftBoxEnabled !== false,
    minProductsPerSet: safe.minProductsPerSet ?? form.minProductsPerSet,
    maxProductsPerSet: safe.maxProductsPerSet ?? form.maxProductsPerSet,
    conceptCount: safe.conceptCount ?? form.conceptCount,
    visualizationCount: safe.visualizationCount ?? form.visualizationCount,
    colors: form.colors,
    allowedItems: form.generationMode === "catalog" ? form.allowedItems : [],
    excludedItems: form.generationMode === "catalog" ? form.excludedItems : [],
    blacklistedProductIds: blacklistItems
      .filter((i) => i.itemType === "product")
      .map((i) => i.itemId),
    blacklistedSupplierIds: blacklistItems
      .filter((i) => i.itemType === "supplier")
      .map((i) => i.itemId),
    files: form.files,
    selectedProductIds: form.selectedProductIds,
    selectedLogoId: form.selectedLogoId,
    selectedBrandbookId: form.selectedBrandbookId,
  };
}
