import type {
  ConceptVisualization,
  DashboardStats,
  GeneratedConcept,
  ProjectFormData,
  ProjectSummary,
  TaskTemplate,
  UploadedFile,
} from "@/lib/types";
import type { ConceptGenerationInput } from "@/lib/generation-payload";
import type { BlacklistItem, BrandPaletteSettings, GeneratedPresentation } from "@/lib/brand-palette";
import type { ConceptRenderSession } from "@/lib/types";

export interface WorkspacePayload {
  projects: ProjectSummary[];
  concepts: GeneratedConcept[];
  projectConcepts: Record<string, GeneratedConcept[]>;
  conceptRenderSessions: Record<string, ConceptRenderSession>;
  generationInputs: Record<string, ConceptGenerationInput>;
  favoriteProjectIds: string[];
  visualizations: ConceptVisualization[];
  customTemplates: TaskTemplate[];
  stats: DashboardStats;
  currentProjectId: string | null;
  brandLibrary: UploadedFile[];
  brandPalette: BrandPaletteSettings;
  blacklistItems: BlacklistItem[];
  presentations: GeneratedPresentation[];
  formData: Partial<ProjectFormData>;
}
