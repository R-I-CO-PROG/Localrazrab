/**
 * Категория и поиск обязаны жить в разных группах AND: обе используют OR,
 * и присвоение where.OR дважды молча потеряло бы фильтр категории.
 */
export function buildProductWhere(filters?: { category?: string; search?: string }): Record<string, unknown> {
  const and: Record<string, unknown>[] = [];

  if (filters?.category) {
    and.push({
      OR: [
        { category: filters.category },
        { subcategory: { contains: filters.category, mode: 'insensitive' } },
      ],
    });
  }

  const q = filters?.search?.trim();
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { externalId: { equals: q, mode: 'insensitive' } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}
