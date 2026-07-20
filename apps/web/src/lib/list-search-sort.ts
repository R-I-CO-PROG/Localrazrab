export type ListSortKey =
  | "date-desc"
  | "date-asc"
  | "name-asc"
  | "name-desc"
  | "concepts-desc"
  | "budget-desc"
  | "slides-desc";

export const LIST_SORT_LABELS: Record<ListSortKey, string> = {
  "date-desc": "Сначала новые",
  "date-asc": "Сначала старые",
  "name-asc": "По названию А–Я",
  "name-desc": "По названию Я–А",
  "concepts-desc": "Больше концепций",
  "budget-desc": "По бюджету",
  "slides-desc": "Больше слайдов",
};

export function normalizeSearchQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function matchesSearch(text: string | undefined, query: string): boolean {
  if (!query) return true;
  return (text ?? "").toLowerCase().includes(query);
}

function compareDates(
  a: string | undefined,
  b: string | undefined,
  ascending: boolean,
): number {
  const ta = a ? Date.parse(a) : 0;
  const tb = b ? Date.parse(b) : 0;
  return ascending ? ta - tb : tb - ta;
}

function compareStrings(
  a: string | undefined,
  b: string | undefined,
  ascending: boolean,
): number {
  const cmp = (a ?? "").localeCompare(b ?? "", "ru", { sensitivity: "base" });
  return ascending ? cmp : -cmp;
}

function compareNumbers(a: number, b: number, descending: boolean): number {
  return descending ? b - a : a - b;
}

export function sortByListKey<T>(
  items: T[],
  sort: ListSortKey,
  accessors: {
    name?: (item: T) => string | undefined;
    date?: (item: T) => string | undefined;
    conceptsCount?: (item: T) => number;
    budget?: (item: T) => number;
    slideCount?: (item: T) => number;
  },
): T[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    switch (sort) {
      case "date-desc":
        return compareDates(accessors.date?.(a), accessors.date?.(b), false);
      case "date-asc":
        return compareDates(accessors.date?.(a), accessors.date?.(b), true);
      case "name-asc":
        return compareStrings(accessors.name?.(a), accessors.name?.(b), true);
      case "name-desc":
        return compareStrings(accessors.name?.(a), accessors.name?.(b), false);
      case "concepts-desc":
        return compareNumbers(
          accessors.conceptsCount?.(a) ?? 0,
          accessors.conceptsCount?.(b) ?? 0,
          true,
        );
      case "budget-desc":
        return compareNumbers(accessors.budget?.(a) ?? 0, accessors.budget?.(b) ?? 0, true);
      case "slides-desc":
        return compareNumbers(
          accessors.slideCount?.(a) ?? 0,
          accessors.slideCount?.(b) ?? 0,
          true,
        );
      default:
        return 0;
    }
  });
  return sorted;
}
