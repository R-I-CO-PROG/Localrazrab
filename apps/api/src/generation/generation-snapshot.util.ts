import { resolveCatalogImageUrl } from '../products/product-image.util';

type RequestWithRelations = {
  title: string;
  userPrompt: string;
  category: string;
  budgetMin: number | null;
  budgetMax: number | null;
  quantity: number | null;
  colors: unknown;
  allowedItems: unknown;
  forbiddenItems: unknown;
  notes: string | null;
  items: Array<{
    productId: string;
    product: {
      name: string;
      category: string;
      silhouetteImageUrl: string;
      catalogImageUrl?: string | null;
    };
  }>;
  assets: Array<{ type: string; url: string }>;
};

export function buildGenerationInputSnapshot(
  request: RequestWithRelations,
  options: {
    mode: 'mockup' | 'ai';
    aiStyle: 'catalog' | 'creative';
    debug: boolean;
    publicApiUrl: string;
    revision?: number;
    chosenIdeaTitle?: string;
    productTargetColors?: Array<{ productId: string; color: string }>;
    sceneBrief?: string;
    giftBoxEnabled?: boolean;
  },
) {
  const logoAsset = request.assets.find((a) => a.type === 'logo');
  const publicApiUrl = options.publicApiUrl.replace(/\/$/, '');

  return {
    title: request.title,
    userPrompt: request.userPrompt,
    category: request.category,
    budgetMin: request.budgetMin,
    budgetMax: request.budgetMax,
    quantity: request.quantity,
    colors: request.colors,
    allowedItems: request.allowedItems,
    forbiddenItems: request.forbiddenItems,
    notes: request.notes,
    productNames: request.items.map((i) => i.product.name),
    productIds: request.items.map((i) => i.productId),
    silhouetteUrls: request.items.map((i) => resolveCatalogImageUrl(i.product)),
    catalogImageUrls: request.items.map((i) => resolveCatalogImageUrl(i.product)),
    products: request.items.map((i) => ({
      id: i.productId,
      name: i.product.name,
      category: i.product.category,
    })),
    productTargetColors: options.productTargetColors ?? [],
    assets: request.assets.map((a) => ({ type: a.type, url: a.url })),
    hasLogo: Boolean(logoAsset),
    logoUrl: logoAsset?.url ?? null,
    logoPublicUrl: logoAsset && publicApiUrl ? `${publicApiUrl}${logoAsset.url}` : null,
    generationMode: options.mode,
    aiStyle: options.aiStyle,
    debug: options.debug,
    revision: options.revision ?? 1,
    chosenIdeaTitle: options.chosenIdeaTitle ?? null,
    sceneBrief: options.sceneBrief?.trim() || null,
    giftBoxEnabled: options.giftBoxEnabled !== false,
  };
}
