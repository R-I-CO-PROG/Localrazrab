import type { IdeatorItem } from '../agents/contracts';
export declare const CREATIVE_MERCH_SCENE_GUARDRAILS: string;
export declare const CREATIVE_MERCH_NEGATIVE_EXTRA: string;
export declare function inferProductTypeFromHint(hint: string): string;
export declare function creativeProductDisplayName(item: IdeatorItem): string;
export declare function formatCreativeProductList(items: IdeatorItem[]): string;
export declare function mapProductRolesToItems(idea: {
    items?: IdeatorItem[];
    productRoles?: Array<{
        role?: string;
        categoryHint?: string;
    }>;
}): IdeatorItem[];
