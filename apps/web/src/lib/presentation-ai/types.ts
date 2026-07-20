import type { PresentationIconKey } from "@/lib/brand-palette";

export type PresentationStylePreset =
  | "premium_dark_tech"
  | "minimal_luxury"
  | "corporate_light"
  | "new_year_dark"
  | "sport_energy"
  | "eco_natural";

export type PresentationQuality = "draft" | "standard" | "premium";

export type SlideType =
  | "cover"
  | "collection_overview"
  | "product"
  | "category"
  | "comparison"
  | "thank_you";

export type SlideLayout =
  | "cover"
  | "collection_overview"
  | "product_left_image_right_text"
  | "product_right_image_left_text"
  | "product_full_bleed"
  | "thank_you";

export type PresentationJobStatus =
  | "queued"
  | "analyzing_brand"
  | "generating_concept"
  | "generating_copy"
  | "generating_images"
  | "rendering_slides"
  | "exporting"
  | "completed"
  | "failed";

export type OutputFormat = "pdf" | "pptx" | "html";

export interface ProductInput {
  id: string;
  name: string;
  category?: string;
  description?: string;
  price?: number | string;
  images?: string[];
  attributes?: Record<string, string>;
  /** id of the source visualization this product came from (for grouping overview slides). */
  sourceVisualizationId?: string;
}

export interface BrandInput {
  name: string;
  logoUrl?: string;
  description?: string;
  colors?: string[];
  website?: string;
}

export interface PresentationGenerationInput {
  brand: BrandInput;
  userId?: string | null;
  products: ProductInput[];
  occasion?: string;
  audience?: string;
  language?: string;
  slideCount?: number;
  stylePreset?: PresentationStylePreset;
  quality?: PresentationQuality;
  outputFormats?: OutputFormat[];
  references?: string[];
  visualizationIds?: string[];
  visualizationImages?: string[];
  showPrices?: boolean;
}

export interface AssetRef {
  id: string;
  url: string;
  mimeType?: string;
  width?: number;
  height?: number;
}

export interface Benefit {
  title: string;
  text: string;
  icon: PresentationIconKey;
}

export interface BottomHighlight {
  label: string;
  accent: string;
}

export interface Placement {
  position: "top-right" | "top-left" | "bottom-right" | "product" | "packaging";
  scale?: number;
}

export interface BrandAnalysis {
  brandName: string;
  brandPersonality: string[];
  visualTone: string;
  primaryColors: string[];
  accentColors: string[];
  typographyMood: string;
  logoUsageRules: {
    preferredBackground: "dark" | "light";
    minimumContrast: "high" | "medium";
    placement: Placement["position"][];
  };
  designKeywords: string[];
}

export interface StyleDirection {
  theme: string;
  background: string;
  composition: string;
  visualDensity: string;
  mood: string;
}

export interface ConceptSlideOutline {
  type: SlideType;
  title: string;
  subtitle?: string;
  caption?: string;
  productId?: string;
  layout?: SlideLayout;
  /** For collection_overview slides: the product ids this overview actually introduces. */
  groupProductIds?: string[];
  /** For collection_overview slides: the source visualization id whose photo/products this slide represents. */
  sourceVisualizationId?: string;
}

export interface PresentationConcept {
  presentationTitle: string;
  bigIdea: string;
  narrative: string;
  styleDirection: StyleDirection;
  slides: ConceptSlideOutline[];
}

export interface ProductStory {
  productId: string;
  title: string;
  subtitle: string;
  description: string;
  benefits: Benefit[];
  bottomHighlights: BottomHighlight[];
  imagePrompt: string;
  backgroundPrompt: string;
  logoPlacement: Placement;
  altText: string;
}

export interface SlideVariantSnapshot {
  title: string;
  subtitle?: string;
  description?: string;
  caption?: string;
  benefits?: Benefit[];
  bottomHighlights?: BottomHighlight[];
  heroImage?: AssetRef;
  backgroundImage?: AssetRef;
  logoPlacement?: Placement;
  overviewItems?: Array<{ name: string; icon?: PresentationIconKey }>;
  bullets?: string[];
  speakerNotes?: string;
  price?: number | string;
  showPrice?: boolean;
}

export interface SlideVariant {
  id: string;
  createdAt: string;
  refinementPrompt?: string;
  snapshot: SlideVariantSnapshot;
}

export interface GeneratedSlide {
  id: string;
  type: SlideType;
  title: string;
  subtitle?: string;
  description?: string;
  caption?: string;
  productId?: string;
  groupProductIds?: string[];
  sourceVisualizationId?: string;
  layout: SlideLayout;
  backgroundImage?: AssetRef;
  heroImage?: AssetRef;
  logoPlacement?: Placement;
  benefits?: Benefit[];
  bottomHighlights?: BottomHighlight[];
  overviewItems?: Array<{ name: string; icon?: PresentationIconKey }>;
  bullets?: string[];
  speakerNotes?: string;
  price?: number | string;
  showPrice?: boolean;
  variants?: SlideVariant[];
  activeVariantIndex?: number;
}

export interface PresentationTheme {
  id: PresentationStylePreset;
  name: string;
  colors: {
    background: string;
    backgroundSecondary: string;
    primary: string;
    accent: string;
    text: string;
    mutedText: string;
    border: string;
    card: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    headingWeight: number;
    bodyWeight: number;
  };
  effects: {
    glow: boolean;
    glassmorphism: boolean;
    noise: boolean;
    gradients: boolean;
    reflections: boolean;
  };
  layout: {
    aspectRatio: "16:9";
    safeMargin: number;
    gridColumns: number;
  };
}

export interface SlideQaResult {
  score: number;
  issues: Array<{
    type: string;
    severity: "low" | "medium" | "high";
    description: string;
  }>;
  shouldRegenerate: boolean;
  suggestedFixes: string[];
}

export interface GeneratedPresentation {
  id: string;
  userId?: string | null;
  status: PresentationJobStatus;
  progress: number;
  progressMessage?: string;
  error?: string;
  title: string;
  brand: BrandInput;
  products?: ProductInput[];
  visualizationIds?: string[];
  visualizationImages?: string[];
  theme: PresentationTheme;
  brandAnalysis?: BrandAnalysis;
  concept?: PresentationConcept;
  productStories?: ProductStory[];
  slides: GeneratedSlide[];
  assets: AssetRef[];
  outputs: {
    pdfUrl?: string;
    pptxUrl?: string;
    htmlUrl?: string;
  };
  quality: PresentationQuality;
  language: string;
  aiCalls: number;
  createdAt: string;
  updatedAt: string;
}

export interface PresentationJobResponse {
  presentationId: string;
  jobId: string;
  status: PresentationJobStatus;
}
