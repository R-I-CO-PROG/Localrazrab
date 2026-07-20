export declare const PG_INT_MAX = 2147483647;
export declare const LIMITS: {
    readonly budget: {
        readonly min: 0;
        readonly max: 50000000;
    };
    readonly quantity: {
        readonly min: 1;
        readonly max: 1000000;
    };
    readonly setItems: {
        readonly min: 1;
        readonly max: 50;
    };
    readonly conceptCount: {
        readonly min: 1;
        readonly max: 10;
    };
    readonly visualizationCount: {
        readonly min: 1;
        readonly max: 5;
    };
};
export declare function sanitizeInt(value: unknown, opts?: {
    min?: number;
    max?: number;
    fallback?: number | null;
}): number | null | undefined;
export interface RequestIntegerPayload {
    budgetMin?: number | null;
    budgetMax?: number | null;
    quantity?: number;
    setItemCount?: number;
    minProductsPerSet?: number;
    maxProductsPerSet?: number;
    conceptCount?: number;
    visualizationCount?: number;
    [key: string]: unknown;
}
export declare function sanitizeRequestPayload<T extends RequestIntegerPayload>(data: T): T;
