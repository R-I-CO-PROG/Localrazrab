export interface MockupProductInput {
  name: string;
  /** Каталожное фото или силуэт */
  imageUrl: string;
  /** @deprecated use imageUrl */
  silhouetteUrl?: string;
}

export interface ImageGenerationInput {
  prompt: string;
  negativePrompt: string;
  outputPath: string;
  width?: number;
  height?: number;
  /** Публичный URL референса (логотип) для image-to-image */
  referenceImageUrl?: string;
  /** Несколько референсов для kontext (сцена|логотип) */
  referenceImageUrls?: string[];
  /** Модель Pollinations (flux, kontext) */
  imageModel?: string;
  productNames?: string[];
  /** Точный список товаров с силуэтами (порядок = порядок выбора) */
  products?: MockupProductInput[];
  showLabels?: boolean;
  layoutMode?: 'grid' | 'scene';
  category?: string;
  quantity?: number | null;
  silhouetteUrls?: string[];
  /** Каталожные фото (приоритет над silhouetteUrls) */
  catalogImageUrls?: string[];
  colors?: string[];
  logoUrl?: string | null;
  hasLogo?: boolean;
  userPrompt?: string;
  generationMode?: 'mockup' | 'ai';
  aiStyle?: 'catalog' | 'creative';
  /** Промпт сцены от LLM (image_prompt + стиль) */
  llmImagePrompt?: string;
  llmComposition?: string;
  llmStyle?: string;
  /** Краткие правила цветов SKU для каталожной визуализации */
  catalogColorRules?: string;
  /** URL текущей визуализации для refine (img2img) */
  sourceSceneUrl?: string;
  /** Бриф перегенерации */
  refinementBrief?: string;
  /** true → полностью новая композиция (кнопка «Пересоздать»), не точечная правка. */
  wantsNewComposition?: boolean;
  /** Индекс попытки/ревизии для вариативности между пересозданиями. */
  variationSeed?: number;
  /** 0–100, обновление прогресса BullMQ job во время генерации изображения */
  onProgress?: (pct: number) => void | Promise<void>;
}

export interface ImageProvider {
  generate(input: ImageGenerationInput): Promise<string>;
}
