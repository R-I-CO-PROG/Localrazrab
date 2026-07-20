import { ProductTargetColorDto } from './product-target-color.dto';
export declare class GenerateRequestDto {
    debug?: boolean;
    mode?: 'mockup' | 'ai';
    productIds?: string[];
    aiStyle?: 'catalog' | 'creative';
    chosenIdeaTitle?: string;
    productTargetColors?: ProductTargetColorDto[];
    sceneBrief?: string;
}
