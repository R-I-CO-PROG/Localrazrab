import type { CatalogProduct } from '../providers/llm/catalog.util';

export interface CatalogProductColorSpec {
  name: string;
  catalogColors: string[];
  /** Целевой цвет рендера — только если он есть в catalogColors */
  targetColor?: string;
}

function normalizeColorText(value: string): string {
  return value.toLowerCase().replace(/ё/g, 'е').trim();
}

function colorTokensMatch(a: string, b: string): boolean {
  const x = normalizeColorText(a);
  const y = normalizeColorText(b);
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const stem = (s: string) => s.slice(0, Math.min(4, s.length));
  return stem(x).length >= 3 && (x.includes(stem(y)) || y.includes(stem(x)));
}

/** targetColor допустим только если он перечислен у SKU */
export function resolveAllowedTargetColor(
  catalogColors: string[],
  targetColor?: string | null,
): string | undefined {
  const target = targetColor?.trim();
  if (!target) return undefined;
  const match = catalogColors.find((c) => colorTokensMatch(c, target));
  return match;
}

export function catalogColorNames(product: CatalogProduct): string[] {
  return (product.colors ?? [])
    .map((c) => (typeof c === 'string' ? c : c.name ?? ''))
    .filter(Boolean);
}

export function buildCatalogProductColorSpecs(
  products: CatalogProduct[],
  targetByProductId: Record<string, string> = {},
): CatalogProductColorSpec[] {
  return products.map((p) => {
    const catalogColors = catalogColorNames(p);
    const targetColor = resolveAllowedTargetColor(catalogColors, targetByProductId[p.id]);
    return { name: p.name, catalogColors, targetColor };
  });
}

/** Правила цвета для промптов финальной каталожной сцены */
export function formatCatalogColorRulesForPrompt(specs: CatalogProductColorSpec[]): string {
  if (!specs.length) return '';

  const perProduct = specs.map((s, i) => {
    const allowed =
      s.catalogColors.length > 0 ? s.catalogColors.join(', ') : 'as shown in reference photo';
    if (s.targetColor) {
      return `Product ${i + 1} "${s.name}": render in ${s.targetColor}. Reference photo may show another catalog variant — recolor ONLY to ${s.targetColor} because it is listed for this SKU. Allowed colors for this product: ${allowed}`;
    }
    return `Product ${i + 1} "${s.name}": match reference photo color and material. Allowed catalog colors for this SKU: ${allowed}. Do NOT recolor to any color outside this list`;
  });

  return [
    'Catalog color rule: NEVER paint a product in a color that is NOT listed in its allowed catalog colors.',
    'Recoloring from the reference photo is ALLOWED only when the target color is explicitly listed for that same SKU (multi-variant products).',
    ...perProduct,
  ].join('. ');
}

export function formatCatalogColorRulesShort(specs: CatalogProductColorSpec[]): string {
  return specs
    .map((s) => {
      const allowed = s.catalogColors.join(', ') || 'reference only';
      return s.targetColor
        ? `"${s.name}" → ${s.targetColor} (listed variant; allowed: ${allowed})`
        : `"${s.name}" → keep reference color (allowed: ${allowed})`;
    })
    .join('; ');
}

export function catalogColorNegativePromptAddendum(): string {
  return 'recolor to unlisted colors, wrong variant color, brand palette recolor, colors not in SKU catalog list';
}
