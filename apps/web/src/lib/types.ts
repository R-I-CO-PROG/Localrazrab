export const PROJECT_CATEGORIES = [
  { value: "WELCOME_PACK", label: "Welcome Pack" },
  { value: "CORPORATE_MERCH", label: "Корпоративный мерч" },
  { value: "CLIENT_GIFTS", label: "Подарки клиентам" },
  { value: "PARTNER_GIFTS", label: "Подарки партнёрам" },
  { value: "CONFERENCE", label: "Конференция" },
  { value: "EXHIBITION", label: "Выставка" },
  { value: "NEW_YEAR", label: "Новый год" },
  { value: "HR_EVENT", label: "HR-мероприятие" },
  { value: "BRANDED_SET", label: "Брендированный набор" },
  { value: "SPECIAL_PROJECT", label: "Спецпроект" },
] as const;

// Основные категории нового каталога — синхронизировано с
// apps/api/src/catalog/brief-category-buckets.util.ts (BRIEF_ALLOWED_BUCKETS)
export const ALLOWED_CATEGORIES = [
  "Одежда",
  "Сумки и рюкзаки",
  "Термосы и бутылки",
  "Кружки",
  "Ручки",
  "Ежедневники и блокноты",
  "Электроника",
  "Подарочные наборы",
  "Отдых и спорт",
  "Зонты",
  "Посуда",
  "Офис и канцелярия",
  "Сувениры и награды",
  "Солнцезащитные очки",
  "Свечи и подсвечники",
  "Аксессуары для путешествий",
  "Кошельки и монетницы",
  "Мультитулы",
  "Текстиль",
] as const;

export const EXCLUDED_CATEGORIES = [
  "Алкоголь",
  "Еда",
  "Одежда",
  "Косметика",
  "Стекло",
  "Другое",
] as const;

export const ACCEPTED_FILE_TYPES = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/svg+xml": [".svg"],
  "application/pdf": [".pdf"],
  "application/postscript": [".ai"],
  "image/vnd.adobe.photoshop": [".psd"],
};

export const DESCRIPTION_MAX_LENGTH = 10000;

export const CREDIT_COSTS = {
  CONCEPT_GENERATION: 5,
  VISUALIZATION: 10,
  PDF_EXPORT: 5,
  PPTX_EXPORT: 5,
  DOCX_EXPORT: 5,
} as const;

export const PLAN_CREDITS = {
  STARTER: 50,
  BUSINESS: 500,
  ENTERPRISE: -1,
} as const;

export interface ConceptItem {
  name: string;
  description: string;
  price: number;
  id?: string;
  stockAvailable?: number;
  colors?: string[];
  /** Целевой цвет для AI-визуализации (должен быть в colors) */
  targetColor?: string;
  imageUrl?: string;
  /** Ссылка на страницу товара у поставщика (видна только ADMIN) */
  sourceUrl?: string | null;
}

export interface GeneratedConcept {
  id?: string;
  name: string;
  description: string;
  items: ConceptItem[];
  totalCost: number;
  tags: string[];
  isFavorite?: boolean;
  /** Flux-превью с этапа Ideator→Critic */
  previewImageUrl?: string;
  /** Фото товаров каталога (без AI-превью) */
  previewProductImageUrls?: string[];
  catalogProductIds?: string[];
  /** Cap бюджета одного набора (₽) с API */
  budgetPerSet?: number | null;
  /** SKU, для которых последний раз генерировали AI-фото */
  visualizationProductIds?: string[];
  /** Состав набора изменился после генерации — нужна перегенерация */
  visualizationOutdated?: boolean;
  /** Все варианты AI-визуализации (оригинал + перегенерации) */
  visualizationVariants?: ConceptVisualizationVariant[];
}

export interface ConceptVisualizationVariant {
  id: string;
  imageUrl: string;
  /** Относительный путь для API (/uploads/...) */
  pathUrl?: string;
  refinementBrief?: string | null;
  createdAt: string;
}

export interface ConceptVisualization {
  id: string;
  conceptId: string;
  conceptName: string;
  projectId?: string;
  imageUrl: string;
  createdAt: string;
  variants?: ConceptVisualizationVariant[];
  activeVariantIndex?: number;
  /** SKU набора на момент генерации визуализации */
  generatedProductIds?: string[];
  /** Название концепции (chosenIdeaTitle) на момент генерации */
  chosenIdeaTitle?: string;
  /** revision с бекенда — для cache-bust URL */
  generationRevision?: number;
  /** Путь /uploads/... подтверждённый сервером для этой концепции */
  sourceImagePath?: string;
}

/** Связь карточки концепции с backend-request для AI render */
export interface ConceptRenderSession {
  requestId: string;
  projectId: string;
  chosenIdeaTitle: string;
}

export type BudgetMode = "per_unit" | "total";
export type GenerationMode = "catalog" | "creative";

export interface ProjectFormData {
  description: string;
  generationMode: GenerationMode;
  categoryPreset: string;
  categoryCustom: string;
  budget: number;
  totalBudget: number;
  budgetMode: BudgetMode;
  quantity: number;
  setItemCount: number;
  useProductCountLimit: boolean;
  /** Собирать финальное фото набора в подарочной коробке (ложемент). По умолчанию вкл. */
  giftBoxEnabled: boolean;
  minProductsPerSet: number;
  maxProductsPerSet: number;
  conceptCount: number;
  visualizationCount: number;
  colors: string[];
  allowedItems: string[];
  excludedItems: string[];
  selectedLogoId?: string;
  selectedBrandbookId?: string;
  files: UploadedFile[];
  selectedProductIds: string[];
}

export interface UploadedFile {
  id: string;
  name: string;
  url: string;
  type: string;
  size: number;
  fileType: "LOGO" | "BRANDBOOK" | "PRESENTATION" | "REFERENCE" | "OTHER";
  /** Стабильный URL с сервера (не blob) */
  storageUrl?: string;
  thumbnailUrl?: string;
  createdAt?: string;
}

export interface ProjectSummary {
  id: string;
  title: string;
  category: string;
  budget: number;
  /** Фактическая сумма набора после правок состава (каталог) */
  setTotalCost?: number;
  quantity: number;
  conceptsCount: number;
  createdAt: string;
  updatedAt?: string;
  status: "draft" | "concepts" | "generating" | "completed" | "failed" | string;
  /** Backend request id — для продолжения генерации */
  requestId?: string;
  generationMode?: GenerationMode;
  selectedConceptTitle?: string;
  resultImageUrl?: string;
  briefExcerpt?: string;
  /** Проект скопирован из аккаунта другого пользователя (админ-обзор). Правится как свой. */
  isForeignCopy?: boolean;
  /** Email автора оригинала — для бейджа «Проект <email>». */
  copiedFromEmail?: string;
}

export interface DashboardStats {
  totalProjects: number;
  totalConcepts: number;
  averageBudget: number;
  creditsUsed: number;
  creditsRemaining: number;
}

export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  categoryPreset: string;
  categoryCustom?: string;
  budget: number;
  quantity: number;
  allowedItems: string[];
  excludedItems?: string[];
  isSystem: boolean;
  createdAt?: string;
}
