import { resolveImageForPptx } from "@/lib/presentation/presentation-images";
import type { PresentationGenerationInput, ProductInput } from "../types";

async function resolveOne(url?: string): Promise<string | undefined> {
  if (!url?.trim()) return undefined;
  return resolveImageForPptx(url.trim());
}

export async function resolveManyReferenceUrls(urls: string[]): Promise<string[]> {
  const unique = [...new Set(urls.filter(Boolean))];
  const resolved = await Promise.all(unique.map((url) => resolveOne(url)));
  return resolved.filter((url): url is string => Boolean(url));
}

export async function resolveProductImages(product: ProductInput): Promise<ProductInput> {
  const images = await resolveManyReferenceUrls(product.images ?? []);
  return { ...product, images: images.length ? images : undefined };
}

export async function resolvePresentationInputImages(
  input: PresentationGenerationInput,
): Promise<PresentationGenerationInput> {
  const products = await Promise.all(input.products.map((p) => resolveProductImages(p)));
  const references = await resolveManyReferenceUrls(input.references ?? []);
  const logoUrl = input.brand.logoUrl ? await resolveOne(input.brand.logoUrl) : undefined;

  return {
    ...input,
    brand: { ...input.brand, logoUrl: logoUrl ?? input.brand.logoUrl },
    products,
    references: references.length ? references : input.references,
  };
}

/** Уникальные фото каталога всех товаров (для обложки и overview). */
export function collectAllCatalogImageUrls(products: ProductInput[]): string[] {
  return [...new Set(products.flatMap((p) => p.images ?? []).filter(Boolean))];
}

/** Фото конкретного товара — только каталожные, без чужих. */
export function collectProductImageUrls(
  product: ProductInput | undefined,
  logoUrl?: string,
): string[] {
  const urls: string[] = [];
  if (logoUrl) urls.push(logoUrl);
  for (const img of product?.images ?? []) {
    if (img && !urls.includes(img)) urls.push(img);
  }
  return urls;
}

export function findProductForSlide(
  products: ProductInput[],
  slide: { productId?: string; title: string },
): ProductInput | undefined {
  if (slide.productId) {
    const byId = products.find((p) => p.id === slide.productId);
    if (byId) return byId;
  }
  const title = slide.title.trim().toLowerCase();
  return products.find(
    (p) =>
      p.name.trim().toLowerCase() === title ||
      title.includes(p.name.trim().toLowerCase()) ||
      p.name.trim().toLowerCase().includes(title),
  );
}
