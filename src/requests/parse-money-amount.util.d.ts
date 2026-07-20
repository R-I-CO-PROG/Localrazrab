export declare function parseRussianMoneyAmount(fragment: string): number | null;
export type BudgetScope = 'per_set' | 'total';
export declare function inferBudgetScope(text: string, amount: number): BudgetScope;
