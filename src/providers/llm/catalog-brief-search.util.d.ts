import type { Prisma } from '@prisma/client';
export declare function extractBriefSearchTerms(brief: string, maxTerms?: number): string[];
export declare function buildPrismaBriefSearchFilter(brief: string): Prisma.ProductWhereInput | null;
