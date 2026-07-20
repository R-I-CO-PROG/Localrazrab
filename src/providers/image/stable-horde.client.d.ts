import { Logger } from '@nestjs/common';
export interface HordeSubmitOptions {
    prompt: string;
    width: number;
    height: number;
    steps?: number;
    model?: string;
    sourceImageBase64?: string;
    extraSourceImagesBase64?: string[];
    denoisingStrength?: number;
    apiKey?: string;
    clientAgent?: string;
    baseUrl?: string;
    pollMs?: number;
    timeoutMs?: number;
    logger?: Logger;
}
export declare function stableHordeGenerate(opts: HordeSubmitOptions): Promise<Buffer>;
