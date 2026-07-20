import type { CatalogProduct } from './catalog.util';

export interface LlmGenerationInput {
  userPrompt: string;
  category: string;
  quantity?: number | null;
  budgetMin?: number | null;
  budgetMax?: number | null;
  colors: string[];
  allowedItems: string[];
  forbiddenItems: string[];
  productNames: string[];
  catalogProducts?: CatalogProduct[];
  /** Сколько товаров нужно подобрать (из брифа или 4 по умолчанию) */
  desiredItemCount?: number;
  hasLogo?: boolean;
  logoUrl?: string | null;
  notes?: string | null;
  /** Товары зафиксированы — LLM только пишет composition/style/image_prompt */
  sceneOnly?: boolean;
  /** Свободная генерация по идее клиента (без каталога) */
  creativeMode?: boolean;
  /** Подбор товаров из каталога по брифу */
  suggestMode?: boolean;
  /** Извлечение параметров брифа из текста */
  briefParseMode?: boolean;
  /** 5 наборов из каталога (каталожный режим) */
  catalogConceptsMode?: boolean;
  /** Типы товаров, явно запрошенные в брифе (для разнообразия концепций) */
  mandatoryConceptTypes?: string[];
  /** Добавить один товар к существующему набору */
  productAddMode?: boolean;
  /** Имена товаров уже в наборе (для productAddMode) */
  currentSetProductNames?: string[];
  /** Ключи вариантов, которые нельзя предлагать (productAddMode) */
  excludeVariantKeys?: string[];
  /** Текст нового запроса на добавление товара */
  addRequestHint?: string;
}

export type LlmInterpretMode = 'suggest' | 'generation';

export interface LlmGenerationOutput {
  items: string[];
  composition: string;
  style: string;
  image_prompt: string;
  negative_prompt: string;
}

export interface LlmProvider {
  generate(input: LlmGenerationInput): Promise<LlmGenerationOutput>;
}
