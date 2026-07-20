import type { ProjectFormData } from "@/lib/types";
import { PROJECT_CATEGORIES } from "@/lib/types";
import { clampInt, LIMITS } from "@/lib/sanitize-int";

export type BudgetScope = "per_set" | "total";

export interface ParsedBriefResponse {
  category?: string;
  quantity?: number;
  setItemCount?: number;
  setItemCountMin?: number;
  setItemCountMax?: number;
  budgetMin?: number;
  budgetMax?: number;
  budgetScope?: BudgetScope;
  colors?: string[];
  allowedItems?: string[];
  namedItems?: string[];
  forbiddenItems?: string[];
  forbiddenNamed?: string[];
  notes?: string;
  updatedFields: string[];
  source?: string;
}

function mapCategoryToPreset(category: string): Pick<ProjectFormData, "categoryPreset" | "categoryCustom"> {
  const normalized = category.trim().toLowerCase();
  const byLabel = PROJECT_CATEGORIES.find(
    (c) => c.label.toLowerCase() === normalized || c.value.toLowerCase() === normalized,
  );
  if (byLabel) return { categoryPreset: byLabel.value, categoryCustom: "" };

  const aliases: Record<string, string> = {
    "welcome pack": "WELCOME_PACK",
    "корпоративные подарки": "CLIENT_GIFTS",
    "мерч": "CORPORATE_MERCH",
    "event kit": "CONFERENCE",
  };
  const preset = aliases[normalized];
  if (preset) return { categoryPreset: preset, categoryCustom: "" };

  return { categoryPreset: "SPECIAL_PROJECT", categoryCustom: category };
}

function applyParsedBudget(
  next: ProjectFormData,
  parsed: ParsedBriefResponse,
): ProjectFormData {
  const hasBudget =
    parsed.updatedFields.includes("budgetMin") || parsed.updatedFields.includes("budgetMax");
  if (!hasBudget) return next;

  const min = parsed.budgetMin;
  const max = parsed.budgetMax;
  const scope = parsed.budgetScope ?? "per_set";
  const qty = Math.max(1, next.quantity);

  // PER-SET — единственный драйвер подбора. Общий бюджет из брифа делим на тираж, чтобы
  // получить бюджет набора; общий = набор × тираж (справочно). Режим всегда per_unit.
  let perSet: number | undefined;
  if (scope === "total") {
    const total = max ?? min;
    if (total != null && total > 0) perSet = Math.round(total / qty);
  } else {
    perSet = max ?? min ?? undefined;
  }

  if (perSet != null && perSet > 0) {
    next.budget = clampInt(perSet, LIMITS.budget);
    next.totalBudget = Math.max(0, next.budget * qty);
    next.budgetMode = "per_unit";
  }
  return next;
}

export function applyParsedBrief(
  prev: ProjectFormData,
  parsed: ParsedBriefResponse,
): ProjectFormData {
  if (!parsed.updatedFields.length) return prev;

  const next = { ...prev };

  for (const field of parsed.updatedFields) {
    switch (field) {
      case "category":
        if (parsed.category) {
          const mapped = mapCategoryToPreset(parsed.category);
          next.categoryPreset = mapped.categoryPreset;
          next.categoryCustom = mapped.categoryCustom;
        }
        break;
      case "quantity":
        if (parsed.quantity != null && parsed.quantity > 0) {
          next.quantity = clampInt(parsed.quantity, LIMITS.quantity);
        }
        break;
      case "setItemCount":
        if (parsed.setItemCount != null && parsed.setItemCount >= 1) {
          const count = clampInt(parsed.setItemCount, LIMITS.setItems);
          // Сохраняем диапазон «1-2 товара», а не схлопываем в одно число.
          const lo =
            parsed.setItemCountMin != null
              ? clampInt(parsed.setItemCountMin, LIMITS.setItems)
              : count;
          const hi =
            parsed.setItemCountMax != null
              ? clampInt(parsed.setItemCountMax, LIMITS.setItems)
              : count;
          next.setItemCount = count;
          next.useProductCountLimit = true;
          next.minProductsPerSet = Math.min(lo, hi);
          next.maxProductsPerSet = Math.max(lo, hi);
        }
        break;
      case "colors":
        if (parsed.colors?.length) next.colors = parsed.colors;
        break;
      case "allowedItems":
        if (parsed.allowedItems?.length) next.allowedItems = parsed.allowedItems;
        break;
      case "namedItems":
        if (parsed.namedItems?.length) {
          next.allowedItems = [...new Set([...(next.allowedItems ?? []), ...parsed.namedItems])];
        }
        break;
      case "forbiddenItems": {
        // Категории-запреты (enum) + свободный текст («колонки», «пауэрбанки»).
        const merged = [
          ...(next.excludedItems ?? []),
          ...(parsed.forbiddenItems ?? []),
          ...(parsed.forbiddenNamed ?? []),
        ]
          .map((s) => s.trim())
          .filter(Boolean);
        if (merged.length) next.excludedItems = [...new Set(merged)];
        break;
      }
      default:
        break;
    }
  }

  return applyParsedBudget(next, parsed);
}
