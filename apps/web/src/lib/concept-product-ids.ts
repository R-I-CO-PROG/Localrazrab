/** Стабильный ключ набора SKU для сравнения «визуализация актуальна?» */
export function productIdsKey(ids: (string | undefined)[] | undefined): string {
  return [...(ids ?? [])].filter(Boolean).sort().join("|");
}

export function visualizationMatchesProducts(
  generatedProductIds: string[] | undefined,
  currentProductIds: (string | undefined)[],
): boolean {
  const current = currentProductIds.filter(Boolean) as string[];
  if (!generatedProductIds?.length) {
    // Нет привязки к SKU — считаем устаревшим, если в наборе уже есть товары
    return current.length === 0;
  }
  if (current.length === 0) return true;
  return productIdsKey(generatedProductIds) === productIdsKey(current);
}

export function visualizationMatchesConcept(
  storedTitle: string | undefined,
  sessionTitle: string | undefined,
): boolean {
  const session = sessionTitle?.trim();
  const stored = storedTitle?.trim();
  if (!session) return true;
  if (!stored) return false;
  return stored === session;
}

/** Совпадает ли снимок генерации на сервере с текущей концепцией и набором SKU */
export function generationSnapshotMatchesConcept(
  snapshot:
    | {
        chosenIdeaTitle?: string | null;
        productIds?: string[];
      }
    | null
    | undefined,
  sessionTitle: string | undefined,
  currentProductIds: (string | undefined)[],
): boolean {
  if (!snapshot) return false;
  const session = sessionTitle?.trim();
  const snapTitle = snapshot.chosenIdeaTitle?.trim();
  if (session && snapTitle && snapTitle !== session) return false;
  if (snapshot.productIds?.length) {
    return visualizationMatchesProducts(snapshot.productIds, currentProductIds);
  }
  return true;
}
