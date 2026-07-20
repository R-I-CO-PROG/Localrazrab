export interface RequiredCategoryRequirement {
    key: string;
    labelRu: string;
    minCount: number;
}
export declare function extractRequiredCategoriesFromBrief(text: string): RequiredCategoryRequirement[];
