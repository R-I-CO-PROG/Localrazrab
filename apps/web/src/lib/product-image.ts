import type { CatalogProduct } from "@/lib/suvenir-types";
import type { ConceptItem, GeneratedConcept } from "@/lib/types";

import {
  catalogImageProxyQueryUrl,
  isCatalogImageProxyHost,
} from "@/lib/catalog-image-proxy";

function isMidoceanCdnUrl(url: string): boolean {
  return isCatalogImageProxyHost(url);
}

/** Преобразует URL CDN midocean в same-origin путь (route handler /midocean-img/...). */
export function catalogImageProxyPath(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return null;
  try {
    if (!isMidoceanCdnUrl(trimmed)) return null;
    const parsed = new URL(trimmed);
    return `/midocean-img${parsed.pathname}${parsed.search}`;
  } catch {
    return null;
  }
}

/** Альтернатива через query-proxy (нужен public path в middleware). */
export function catalogImageProxyApiPath(url: string): string | null {
  return catalogImageProxyQueryUrl(url);
}

export function normalizeCatalogImageSrc(url: string | null | undefined): string {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return "";

  if (trimmed.startsWith("/midocean-img/")) return trimmed;

  if (trimmed.startsWith("/api/catalog-image")) return trimmed;

  if (trimmed.startsWith("/api/backend/catalog-external-image")) {
    try {
      const raw = new URL(trimmed, "https://mercai.ru").searchParams.get("url");
      if (raw) return normalizeCatalogImageSrc(raw);
    } catch {
      /* ignore */
    }
  }

  const proxied = catalogImageProxyPath(trimmed);
  return proxied ?? trimmed;
}

/** Для <img> / <Image src> — всегда вызывать при отображении (в т.ч. URL из localStorage) */
export function displayCatalogImageSrc(url: string | null | undefined): string {
  return normalizeCatalogImageSrc(url);
}

export function productImageUrl(
  product: Pick<CatalogProduct, "catalogImageUrl" | "silhouetteImageUrl">,
): string {
  return (
    normalizeCatalogImageSrc(product.catalogImageUrl) ||
    normalizeCatalogImageSrc(product.silhouetteImageUrl)
  );
}

export function normalizeConceptItemImage(item: ConceptItem): ConceptItem {
  if (!item.imageUrl) return item;
  const imageUrl = displayCatalogImageSrc(item.imageUrl);
  return imageUrl === item.imageUrl ? item : { ...item, imageUrl };
}

export function normalizeGeneratedConceptImages(concept: GeneratedConcept): GeneratedConcept {
  const items = concept.items.map(normalizeConceptItemImage);
  const previewProductImageUrls = concept.previewProductImageUrls?.map(
    (u) => displayCatalogImageSrc(u) || u,
  );
  const changedItems = items.some((it, i) => it !== concept.items[i]);
  const changedPreviews =
    previewProductImageUrls &&
    concept.previewProductImageUrls &&
    previewProductImageUrls.some((u, i) => u !== concept.previewProductImageUrls![i]);
  if (!changedItems && !changedPreviews) return concept;
  return { ...concept, items, previewProductImageUrls };
}
