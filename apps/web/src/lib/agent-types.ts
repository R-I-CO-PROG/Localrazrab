export interface AgentConcept {
  title: string;
  narrative: string;
  description: string;
  score?: number;
  styleTags?: string[];
  whyItFits?: string;
  previewImageUrl?: string;
  previewProductImageUrls?: string[];
  productIds?: string[];
  items?: Array<{ productType?: string; notes?: string; priority?: string }>;
  colorPalette?: string[];
  catalogProducts?: Array<{
    id: string;
    name: string;
    category: string;
    price?: number | null;
    stockAvailable?: number;
    colors?: string[];
    targetColor?: string;
    catalogImageUrl?: string;
    imageUrl?: string | null;
    sourceUrl?: string | null;
  }>;
  budgetPerSet?: number | null;
}

export interface AgentRunState {
  id: string;
  requestId: string;
  status: string;
  currentStep?: string | null;
  conceptsOutput?: AgentConcept[] | null;
  criticOutput?: Record<string, unknown> | null;
  ideatorOutput?: Record<string, unknown> | null;
  chosenIdeaTitle?: string | null;
  error?: string | null;
}
