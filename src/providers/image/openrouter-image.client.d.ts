import { Logger } from '@nestjs/common';
export type OpenRouterImageModality = 'image' | 'text';
export interface OpenRouterImageRequest {
    apiKey: string;
    model: string;
    prompt: string;
    modalities: OpenRouterImageModality[];
    imageConfig?: {
        aspect_ratio?: string;
        image_size?: string;
    };
    referenceImageUrls?: string[];
    referenceImages?: Array<{
        url: string;
        preamble?: string;
    }>;
    timeoutMs?: number;
    logger?: Logger;
}
export interface OpenRouterChatMessageContentPart {
    type: 'text' | 'image_url';
    text?: string;
    image_url?: {
        url?: string;
    };
}
export declare function openrouterGenerateImageBuffer(req: OpenRouterImageRequest): Promise<Buffer>;
