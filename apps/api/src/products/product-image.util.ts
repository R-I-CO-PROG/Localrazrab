/** URL картинки для каталога / мокапа / AI */

const DEFAULT_SILHOUETTE = '/uploads/silhouettes/pen.png';

/** Старый прокси mercai.ru/p/… не отдаёт файлы (404) — не использовать для AI/OpenRouter */
export function isBrokenMercaiImageProxy(url: string): boolean {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return false;
  try {
    const host = new URL(trimmed).hostname.replace(/^www\./, '');
    return host === 'mercai.ru' && new URL(trimmed).pathname.startsWith('/p/');
  } catch {
    return /^mercai\.ru\/p\//i.test(trimmed) || trimmed.startsWith('/p/');
  }
}

export function isLocallyResolvableCatalogImage(url: string): boolean {
  const trimmed = url?.trim() ?? '';
  return trimmed.startsWith('/uploads/') || trimmed.startsWith('/catalog-handoff/');
}

function pickResolvableImageUrl(...candidates: Array<string | null | undefined>): string {
  for (const raw of candidates) {
    const url = raw?.trim();
    if (!url || isBrokenMercaiImageProxy(url)) continue;
    if (isLocallyResolvableCatalogImage(url)) return url;
  }
  for (const raw of candidates) {
    const url = raw?.trim();
    if (!url || isBrokenMercaiImageProxy(url)) continue;
    if (!url.startsWith('http://') && !url.startsWith('https://')) return url;
  }
  for (const raw of candidates) {
    const url = raw?.trim();
    if (!url || isBrokenMercaiImageProxy(url)) continue;
    return url;
  }
  return DEFAULT_SILHOUETTE;
}

export function resolveCatalogImageUrl(product: {
  catalogImageUrl?: string | null;
  silhouetteImageUrl: string;
}): string {
  return pickResolvableImageUrl(product.catalogImageUrl, product.silhouetteImageUrl);
}



export function isRasterCatalogImage(url: string): boolean {

  return /\.(png|jpe?g|webp)$/i.test(url.split('?')[0] ?? '');

}


