export type BrandStyle =
  | "minimal"
  | "premium"
  | "vibrant"
  | "strict"
  | "tech"
  | "classic"
  | "neutral";

export const BRAND_STYLE_LABELS: Record<BrandStyle, string> = {
  minimal: "Минималистичный",
  premium: "Премиальный",
  vibrant: "Яркий",
  strict: "Строгий",
  tech: "Технологичный",
  classic: "Классический",
  neutral: "Нейтральный",
};

export const DEFAULT_BRAND_COLORS = ["#1A1A1A", "#7C3AED", "#F5F5F5"];

export interface BrandPaletteSettings {
  /** Цвета, распознанные из лого/брендбука */
  detectedColors: string[];
  /** Активная палитра (ручные правки или detected) */
  activeColors: string[];
  /** Распознанный стиль бренда */
  detectedStyle: BrandStyle;
  /** Активный стиль */
  activeStyle: BrandStyle;
  /** Есть ли ручные изменения поверх detected */
  manualOverride: boolean;
  lastAnalyzedAt?: string;
  lastAnalyzedSource?: "LOGO" | "BRANDBOOK";
}

export function createDefaultBrandPalette(): BrandPaletteSettings {
  return {
    detectedColors: [],
    activeColors: [],
    detectedStyle: "neutral",
    activeStyle: "neutral",
    manualOverride: false,
  };
}

export type BlacklistItemType = "product" | "supplier";

export interface BlacklistItem {
  id: string;
  userId?: string;
  projectId?: string;
  itemType: BlacklistItemType;
  itemId: string;
  title: string;
  createdAt: string;
}

export type PresentationIconKey =
  | "gift"
  | "shield"
  | "team"
  | "star"
  | "leaf"
  | "laptop"
  | "magnet"
  | "thermo"
  | "spark"
  | "heart";

export interface PresentationBenefit {
  icon?: PresentationIconKey;
  title: string;
  text: string;
}

export interface PresentationOverviewItem {
  name: string;
  icon?: PresentationIconKey;
  thumbUrl?: string;
}

export interface PresentationSlide {
  type:
    | "agencyCover"
    | "agencyOverview"
    | "agencyProduct"
    | "agencyClosing"
    | "title"
    | "agenda"
    | "section"
    | "content"
    | "concept"
    | "insight"
    | "conceptsIntro"
    | "visualization"
    | "conceptShowcase"
    | "conceptGrid"
    | "howItWorks"
    | "quote"
    | "products"
    | "summary"
    | "closing";
  title?: string;
  subtitle?: string;
  body?: string;
  bullets?: string[];
  speakerNotes?: string;
  visualizationId?: string;
  imageUrl?: string;
  galleryImages?: string[];
  benefits?: PresentationBenefit[];
  footerLeft?: string;
  footerRight?: string;
  overviewItems?: PresentationOverviewItem[];
  productName?: string;
  price?: number;
  products?: Array<{
    name: string;
    description?: string;
    price?: number;
    imageUrl?: string;
    article?: string;
    supplier?: string;
  }>;
}

export interface GeneratedPresentation {
  id: string;
  title: string;
  prompt: string;
  projectId?: string;
  visualizationIds: string[];
  /** legacy = PPTX из /api/presentations/generate; ai = AI-визард с перегенерацией слайдов */
  kind?: "legacy" | "ai";
  status: "generating" | "done" | "failed";
  slideCount?: number;
  downloadUrl?: string;
  htmlUrl?: string;
  fileName?: string;
  error?: string;
  createdAt: string;
}

export interface BrandColorAnalysisResult {
  colors: string[];
  style: BrandStyle;
  source: "image" | "pdf" | "unsupported";
  message?: string;
}
