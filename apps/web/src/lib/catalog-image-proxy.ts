/** HTTP-only CDN поставщиков — проксируем через same-origin (mixed content на HTTPS). */
export const CATALOG_IMAGE_PROXY_HOSTS = new Set(["cdn.midoceanbrands.ru"]);

export function isCatalogImageProxyHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return CATALOG_IMAGE_PROXY_HOSTS.has(host);
  } catch {
    return false;
  }
}

export function isAllowedCatalogImageProxyUrl(raw: string): boolean {
  const trimmed = raw?.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (parsed.protocol === "https:" && CATALOG_IMAGE_PROXY_HOSTS.has(host)) {
      // midocean HTTPS часто недоступен (битый TLS) — всё равно проксируем по HTTP upstream
      return true;
    }
    if (parsed.protocol === "http:") return CATALOG_IMAGE_PROXY_HOSTS.has(host);
    return true;
  } catch {
    return false;
  }
}

/** Upstream fetch URL (midocean — только HTTP). */
export function resolveCatalogImageUpstreamUrl(raw: string): string | null {
  if (!isAllowedCatalogImageProxyUrl(raw)) return null;
  try {
    const parsed = new URL(raw.trim());
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    if (CATALOG_IMAGE_PROXY_HOSTS.has(host)) {
      return `http://${host}${parsed.pathname}${parsed.search}`;
    }
    return raw.trim();
  } catch {
    return null;
  }
}

export async function fetchCatalogImageUpstream(raw: string): Promise<Response> {
  const upstream = resolveCatalogImageUpstreamUrl(raw);
  if (!upstream) {
    return new Response(JSON.stringify({ error: "Invalid or disallowed image URL" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  return fetch(upstream, {
    headers: { "User-Agent": "Mercai-Catalog-Image-Proxy/1.0" },
    signal: AbortSignal.timeout(15_000),
    cache: "force-cache",
  });
}

export function catalogImageProxyQueryUrl(raw: string): string | null {
  if (!isCatalogImageProxyHost(raw)) return null;
  return `/api/catalog-image?url=${encodeURIComponent(raw.trim())}`;
}
