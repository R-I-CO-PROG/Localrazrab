export interface CatalogProduct {
  id: string;
  slug: string;
  name: string;
  category: string;
  subcategory?: string | null;
  description?: string | null;
  price?: number | null;
  currency?: string | null;
  stockAvailable?: number;
  colors?: Array<{ name: string; hex?: string | null }>;
  silhouetteImageUrl: string;
  catalogImageUrl?: string | null;
}

export interface SuvenirAsset {
  id: string;
  type: "logo" | "reference";
  url: string;
}

export interface RequestItem {
  id: string;
  productId: string;
  product: CatalogProduct;
}

export type GenerationImageMode = "mockup" | "ai";

export interface GenerationResultMeta {
  generationMode?: GenerationImageMode;
  imageProvider?: string;
  aiEnhanced?: boolean;
  isBrandedMockup?: boolean;
  productCount?: number;
  usedAiFallback?: boolean;
}

export interface GenerationLlmOutput {
  composition?: string;
  style?: string;
  image_prompt?: string;
  _error?: string;
  _resultMeta?: GenerationResultMeta;
}

export interface Generation {
  id: string;
  status: "queued" | "generating" | "done" | "failed";
  resultImageUrl?: string | null;
  llmOutput?: GenerationLlmOutput | null;
  inputSnapshot?: {
    aiStyle?: "catalog" | "creative";
    generationMode?: GenerationImageMode;
    chosenIdeaTitle?: string | null;
    productIds?: string[];
    revision?: number;
  } | null;
  conceptResults?: Record<
    string,
    {
      chosenIdeaTitle: string;
      resultImageUrl: string;
      productIds: string[];
      revision: number;
      finishedAt: string;
      variants?: Array<{
        id: string;
        imageUrl: string;
        revision: number;
        finishedAt: string;
        refinementBrief?: string | null;
      }>;
    }
  > | null;
  variants?: VisualizationVariant[];
}

export interface VisualizationVariant {
  id: string;
  imageUrl: string;
  refinementBrief?: string | null;
  imagePrompt?: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface AgentRun {
  id: string;
  requestId: string;
  status:
    | "queued"
    | "running"
    | "awaiting_product_selection"
    | "awaiting_idea_selection"
    | "idea_selected"
    | "done"
    | "failed";
  currentStep?: string | null;
  ideatorOutput?: Record<string, unknown> | null;
  criticOutput?: Record<string, unknown> | null;
  conceptsOutput?: Array<{
    title: string;
    narrative?: string;
    description: string;
    score?: number;
  }> | null;
  chosenIdeaTitle?: string | null;
  error?: string | null;
}

export interface SuvenirRequest {
  id: string;
  title: string;
  userPrompt: string;
  category: string;
  budgetMin?: number | null;
  budgetMax?: number | null;
  quantity?: number | null;
  colors: string[];
  allowedItems: string[];
  forbiddenItems: string[];
  notes?: string | null;
  status: "draft" | "ready" | "generating" | "done" | "failed";
  generationCount: number;
  items: RequestItem[];
  assets: SuvenirAsset[];
  generation?: Generation | null;
  agentRun?: AgentRun | null;
  generationProgress?: number | null;
}

export type RequestPayload = Partial<{
  title: string;
  userPrompt: string;
  category: string;
  budgetMin: number;
  budgetMax: number;
  quantity: number;
  colors: string[];
  allowedItems: string[];
  forbiddenItems: string[];
  notes: string;
  productIds: string[];
}>;

export type AiGenerationStyle = "catalog" | "creative";
