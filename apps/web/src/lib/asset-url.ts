import { normalizeCatalogImageSrc } from "@/lib/product-image";

/** Базовый URL API: в браузере — same-origin BFF; на сервере — прямой upstream */
export function resolveApiBase(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_API_BASE || "/api/backend";
  }
  return (
    process.env.SUVENIR_API_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    "http://localhost:3001"
  );
}

/** @deprecated use resolveApiBase() */
export const API_URL = typeof window !== "undefined"
  ? (process.env.NEXT_PUBLIC_API_BASE || "/api/backend")
  : (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001");

export function assetUrl(path: string, cacheKey?: string | number): string {
  // data:/blob: URL — уже готовый ресурс (base64-фото товара в презентации). НЕЛЬЗЯ
  // приписывать к нему API-базу, иначе получается битый '/api/backenddata:image/...'.
  if (path.startsWith("data:") || path.startsWith("blob:")) return path;
  if (path.startsWith("http")) {
    const proxied = normalizeCatalogImageSrc(path);
    if (proxied !== path) {
      if (cacheKey == null) return proxied;
      const sep = proxied.includes("?") ? "&" : "?";
      return `${proxied}${sep}v=${encodeURIComponent(String(cacheKey))}`;
    }
    if (cacheKey == null) return path;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}v=${encodeURIComponent(String(cacheKey))}`;
  }

  const isSameOriginPath =
    path.startsWith("/uploads/") ||
    path.startsWith("/catalog-handoff/") ||
    path.startsWith("/midocean-img/") ||
    path.startsWith("/api/catalog-image") ||
    path.startsWith("/api/backend/");

  const base = isSameOriginPath
    ? path
    : `${resolveApiBase()}${path.startsWith("/") ? "" : "/"}${path}`;

  if (cacheKey == null) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}v=${encodeURIComponent(String(cacheKey))}`;
}
