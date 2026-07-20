import type { CatalogIdeatorIdea, CriticOutput } from '../../agents/contracts';
import type { AgentBriefContext } from '../../agents/brief-context.util';
import { type GenerationHistory } from '../../agents/previous-generation.util';
export declare function pickTopCatalogIdeasLocally(ideas: CatalogIdeatorIdea[], brief: AgentBriefContext, limit: number, generationHistory?: GenerationHistory | null): CriticOutput;
