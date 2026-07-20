import { readFile } from "fs/promises";
import { join } from "path";

function uploadsDir(): string {
  return process.env.UPLOADS_DIR || join(process.cwd(), "../../uploads");
}

function internalApiBase(): string {
  return (
    process.env.SUVENIR_API_URL ||
    process.env.PUBLIC_API_URL ||
    "http://127.0.0.1:3001"
  ).replace(/\/$/, "");
}

/** Base URL of THIS Next.js app (not the NestJS API) — needed to fetch its own proxy routes server-side. */
function webAppBase(): string {
  return (
    process.env.NEXT_INTERNAL_WEB_URL || `http://127.0.0.1:${process.env.PORT || 3000}`
  ).replace(/\/$/, "");
}

function uploadsPathFromUrl(url: string): string | null {
  try {
    const parsed = url.startsWith("http") ? new URL(url) : null;
    const pathname = parsed?.pathname ?? url;
    const match = pathname.match(/\/uploads\/(.+)$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  } catch {
    const match = url.match(/\/uploads\/(.+)$/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
}

async function readLocalUpload(relativePath: string): Promise<string | undefined> {
  try {
    const buffer = await readFile(join(uploadsDir(), relativePath));
    const ext = relativePath.split(".").pop()?.toLowerCase() ?? "png";
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : ext === "gif"
            ? "image/gif"
            : "image/png";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

async function fetchAsDataUrl(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return undefined;
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) return undefined;
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 32) return undefined;
    const mime = contentType.split(";")[0]?.trim() || "image/png";
    if (!mime.startsWith("image/")) return undefined;
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}

/** Готовит URL изображения для PptxGenJS: только data: или локальный путь (без HTTPS self-fetch). */
export async function resolveImageForPptx(url: string | undefined): Promise<string | undefined> {
  if (!url?.trim()) return undefined;
  const trimmed = url.trim();
  if (trimmed.startsWith("data:")) return trimmed;

  const relative = uploadsPathFromUrl(trimmed);
  if (relative) {
    const local = await readLocalUpload(relative);
    if (local) return local;
    const internal = `${internalApiBase()}/uploads/${relative}`;
    const fetched = await fetchAsDataUrl(internal);
    if (fetched) return fetched;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const fetched = await fetchAsDataUrl(trimmed);
    if (fetched) return fetched;
    if (relative) {
      return fetchAsDataUrl(`${internalApiBase()}/uploads/${relative}`);
    }
  }

  if (trimmed.startsWith("/uploads/")) {
    const rel = trimmed.replace(/^\/uploads\//, "");
    const local = await readLocalUpload(rel);
    if (local) return local;
    return fetchAsDataUrl(`${internalApiBase()}/uploads/${rel}`);
  }

  // Same-origin Next.js proxy routes (e.g. /midocean-img/..., /catalog-handoff/..., /api/catalog-image,
  // /api/backend/...) serve product photos from third-party supplier CDNs. They only resolve against
  // THIS app's own origin (not the NestJS API, and not meaningfully as a bare relative path outside a
  // browser) — without this branch resolution silently failed and callers fell back to an unrelated image.
  if (
    trimmed.startsWith("/midocean-img/") ||
    trimmed.startsWith("/catalog-handoff/") ||
    trimmed.startsWith("/api/catalog-image") ||
    trimmed.startsWith("/api/backend/")
  ) {
    return fetchAsDataUrl(`${webAppBase()}${trimmed}`);
  }

  return undefined;
}

export async function resolveSlidesImagesForPptx<
  T extends {
    imageUrl?: string;
    galleryImages?: string[];
    products?: Array<{ imageUrl?: string }>;
  },
>(slides: T[]): Promise<T[]> {
  const cache = new Map<string, string | undefined>();

  async function cached(url?: string) {
    if (!url) return undefined;
    if (!cache.has(url)) {
      cache.set(url, await resolveImageForPptx(url));
    }
    return cache.get(url);
  }

  return Promise.all(
    slides.map(async (slide) => {
      const imageUrl = await cached(slide.imageUrl);
      const galleryImages = slide.galleryImages
        ? (
            await Promise.all(slide.galleryImages.map((url) => cached(url)))
          ).filter((url): url is string => Boolean(url))
        : slide.galleryImages;
      const products = slide.products
        ? await Promise.all(
            slide.products.map(async (p) => ({
              ...p,
              imageUrl: (await cached(p.imageUrl)) ?? undefined,
            })),
          )
        : slide.products;
      return { ...slide, imageUrl, galleryImages, products };
    }),
  );
}
