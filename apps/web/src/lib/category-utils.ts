import { PROJECT_CATEGORIES } from "@/lib/types";

export function getCategoryLabel(value: string): string {
  return PROJECT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function getEffectiveCategory(preset: string, custom: string): string {
  const trimmed = custom.trim();
  if (trimmed) return trimmed;
  return getCategoryLabel(preset);
}

export function isPresetCategory(value: string): boolean {
  return PROJECT_CATEGORIES.some((c) => c.value === value);
}
