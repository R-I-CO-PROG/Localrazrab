import type { ConfigService } from '@nestjs/config';
import type { Concept } from '../../agents/contracts';
import type { OpenrouterAgentClient } from '../../agents/openrouter-agent.client';
import type { CatalogFilterInput } from './catalog-filter.util';
import type { CatalogProduct } from './catalog.util';
export declare function critiqueConceptSetsWithLlm(concepts: Concept[], brief: string, catalog: CatalogProduct[], colors: string[], openrouter: OpenrouterAgentClient, config: ConfigService, logWarn: (message: string) => void, filterInput?: CatalogFilterInput, minProductsPerSet?: number, maxProductsPerSet?: number): Promise<Concept[]>;
