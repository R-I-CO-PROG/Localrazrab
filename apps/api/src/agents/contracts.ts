export type AgentRouteType = 'DIRECT_PRODUCT' | 'IDEATION_PIPELINE';

export interface DirectProductQuery {
  keywords: string[];
  colors: string[];
  categoryHints: string[];
  mustInclude: string[];
  mustNotInclude: string[];
}

export interface RouterOutput {
  route: AgentRouteType;
  confidence: number;
  reason: string;
  directProductQuery: DirectProductQuery;
}

export interface IdeatorItem {
  productType: string;
  notes?: string;
  priority: 'must' | 'nice';
}

export interface IdeatorIdea {
  title: string;
  /** Одна яркая визуальная деталь — «деньги кадра» */
  hook?: string;
  description: string;
  items: IdeatorItem[];
  styleTags: string[];
  colorPalette: string[];
  whyItFits: string;
}

export interface IdeatorOutput {
  ideas: IdeatorIdea[];
}

/** Идея набора из каталога (Ideator catalog mode) */
export interface CatalogProductSlot {
  type: string;
  priority: 'must' | 'nice';
  notes?: string;
  positionLabel?: string;
}

export interface CatalogIdeatorIdea {
  title: string;
  composition: string;
  style: string;
  /** Слоты типов товаров — подбор SKU из полного каталога */
  productSlots: CatalogProductSlot[];
  /** @deprecated legacy — точные name; используйте productSlots */
  items: string[];
  themeAxis?: string;
  whyItFits: string;
  /** Уровень смелости концепции: 0 = стандартный/базовый, 1 = около-стандартный/интересный, 2 = нестандартный но подходящий. Используется для распределения 1+3+1. */
  boldness?: number;
}

export interface CatalogIdeatorOutput {
  ideas: CatalogIdeatorIdea[];
}

export interface CriticTopIdea {
  title: string;
  /** @deprecated use briefFitScore — kept for backward compat */
  score: number;
  briefFitScore?: number;
  /** 2–4 предложения на русском — полное словесное описание для клиента */
  conceptSummary?: string;
  reasons: string[];
  risks: string[];
  suggestedEdits: string[];
}

export interface CriticOutput {
  topIdeas: CriticTopIdea[];
}

/** Текстовая концепция для показа пользователю */
export interface Concept {
  title: string;
  /** Главный текст для карточки — связное описание словами */
  narrative: string;
  description: string;
  items: IdeatorItem[];
  styleTags: string[];
  colorPalette: string[];
  whyItFits: string;
  score?: number;
  reasons?: string[];
  risks?: string[];
  suggestedEdits?: string[];
  /** Дешёвое Flux-превью (~$0.003) — до финальной Nano Banana 2 */
  previewImageUrl?: string;
  /** Фото товаров каталога для превью карточки (без AI) */
  previewProductImageUrls?: string[];
  /** Каталожный режим: подобранные SKU */
  productIds?: string[];
  catalogProducts?: Array<{
    id: string;
    name: string;
    category: string;
    productType?: string;
    price?: number | null;
    stockAvailable?: number;
    /** Нехватка остатка под тираж (0 — хватает); >0 — сколько единиц не хватает */
    stockShortfall?: number;
    colors?: string[];
    catalogImageUrl?: string;
    imageUrl?: string;
    /** Алиас для внешних тестеров, ожидающих поле image */
    image?: string;
    sourceUrl?: string | null;
    hasCatalogImage?: boolean;
  }>;
  composition?: string;
  style?: string;
  /** Фактический cap бюджета одного набора (₽), для UI */
  budgetPerSet?: number | null;
  /** Реализуемость набора под тираж: статус + позиции с нехваткой остатка */
  fulfillment?: {
    status: 'ok' | 'partial' | 'risky';
    tirage: number;
    totalCount: number;
    coveredCount: number;
    shortItems: Array<{ id: string; name: string; stockAvailable: number; shortfall: number }>;
  };
}

export interface PromptBuilderOutput {
  chosenIdeaTitle: string;
  imagePrompt: string;
  negativePrompt: string;
  style: string;
  background: string;
  loopSafe: boolean;
}

export interface DirectProductResult {
  productIds: string[];
  products: Array<{ id: string; name: string; category: string }>;
}

export type AgentPipelineStep =
  | 'ideator'
  | 'critic'
  | 'previews'
  | 'await_selection'
  | 'prompt_builder'
  | 'image';

export const PRODUCT_TYPE_WHITELIST = [
  'pen',
  'pencil',
  'notebook',
  'mug',
  'tshirt',
  'hoodie',
  'bag',
  'thermos',
  'bottle',
  'cap',
  'umbrella',
  'socks',
  'powerbank',
  'usb',
  'badge',
] as const;

export const AGENT_BLACKLIST = [
  'weapon',
  'gun',
  'alcohol',
  'wine',
  'beer',
  'vodka',
  'оружие',
  'алкоголь',
  'вино',
  'пиво',
];
