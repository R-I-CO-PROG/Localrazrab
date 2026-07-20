export interface PresentationVisualizationInput {
  id: string;
  conceptName: string;
  imageUrl: string;
  description?: string;
  isCatalog?: boolean;
  items?: Array<{
    id?: string;
    name: string;
    description?: string;
    price?: number;
    imageUrl?: string;
    article?: string;
    supplier?: string;
  }>;
}
