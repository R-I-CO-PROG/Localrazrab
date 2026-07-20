import { ConfigService } from '@nestjs/config';
import { OpenrouterImageProvider } from '../providers/image/openrouter-image.provider';
import type { Concept } from './contracts';
export declare class ConceptPreviewService {
    private readonly config;
    private readonly openrouterImage;
    private readonly logger;
    constructor(config: ConfigService, openrouterImage: OpenrouterImageProvider);
    isEnabled(): boolean;
    attachPreviews(concepts: Concept[], opts: {
        agentRunId: string;
        colors: string[];
    }): Promise<Concept[]>;
}
