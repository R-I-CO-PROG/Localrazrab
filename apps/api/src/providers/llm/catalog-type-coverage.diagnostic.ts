import type { CatalogProduct } from './catalog.util';
import { detectConceptProductType } from './concept-diversity.util';

export interface TypeCoverageReport {
  total: number;
  matched: number;
  other: number;
  otherPercent: number;
  byType: Array<{ type: string; count: number; percent: number }>;
  topOtherCategories: Array<{ category: string; count: number; samples: string[] }>;
}

export function analyzeTypeCoverage(catalog: CatalogProduct[]): TypeCoverageReport {
  const byType = new Map<string, number>();
  const otherByCategory = new Map<string, { count: number; samples: string[] }>();

  for (const product of catalog) {
    const type = detectConceptProductType(product);
    byType.set(type, (byType.get(type) ?? 0) + 1);

    if (type === 'other') {
      const cat = product.subcategory?.trim() || product.category || 'Без категории';
      const entry = otherByCategory.get(cat) ?? { count: 0, samples: [] };
      entry.count++;
      if (entry.samples.length < 5) entry.samples.push(product.name);
      otherByCategory.set(cat, entry);
    }
  }

  const total = catalog.length;
  const otherCount = byType.get('other') ?? 0;

  return {
    total,
    matched: total - otherCount,
    other: otherCount,
    otherPercent: total > 0 ? Math.round((otherCount / total) * 100) : 0,
    byType: [...byType.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([type, count]) => ({ type, count, percent: Math.round((count / total) * 100) })),
    topOtherCategories: [...otherByCategory.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 15)
      .map(([category, data]) => ({ category, ...data })),
  };
}
