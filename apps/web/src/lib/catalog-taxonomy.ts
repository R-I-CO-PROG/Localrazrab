/** Разбор поля Product.subcategory (путь IMBA) для UI-фильтров */

export const WITHOUT_SUBCATEGORY = "Без подкатегории";
export const WITHOUT_SUBSUBCATEGORY = "Без подподкатегории";

/** Уровень 2: сегменты пути после первого (или часть до «|») */
export function parseCatalogSubcategory(subcategory: string | null | undefined): string {
  const raw = subcategory?.trim() ?? "";
  if (!raw) return WITHOUT_SUBCATEGORY;

  if (raw.includes("|")) {
    const pipe = raw.split("|").map((s) => s.trim()).filter(Boolean);
    if (pipe[0]) return pipe[0];
  }

  const parts = raw.split("/").map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) return parts.slice(1, 3).join(" / ");
  if (parts.length === 1) return parts[0];
  return WITHOUT_SUBCATEGORY;
}

/** Уровень 3: хвост пути, часть после «|» или slug из sourceUrl */
export function parseCatalogSubsubcategory(
  subcategory: string | null | undefined,
  sourceUrl?: string | null,
): string {
  const raw = subcategory?.trim() ?? "";

  if (raw.includes("|")) {
    const parts = raw.split("|").map((s) => s.trim()).filter(Boolean);
    if (parts[1]) return parts[1];
  }

  if (raw && !raw.includes("|")) {
    const parts = raw.split("/").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 4) return parts.slice(3).join(" / ");
    if (parts.length === 3) return parts[2];
  }

  if (sourceUrl) {
    try {
      const segs = new URL(sourceUrl).pathname.split("/").filter(Boolean);
      const ci = segs.indexOf("catalog");
      if (ci >= 0 && segs[ci + 1]) {
        return decodeURIComponent(segs[ci + 1]).replace(/_/g, " ");
      }
    } catch {
      /* skip */
    }
  }

  return WITHOUT_SUBSUBCATEGORY;
}

export function catalogPathLabel(
  category: string,
  subcategory: string | null | undefined,
  sourceUrl?: string | null,
): string {
  const sub = parseCatalogSubcategory(subcategory);
  const subsub = parseCatalogSubsubcategory(subcategory, sourceUrl);
  const parts = [category];
  if (sub !== WITHOUT_SUBCATEGORY) parts.push(sub);
  if (subsub !== WITHOUT_SUBSUBCATEGORY) parts.push(subsub);
  return parts.join(" → ");
}
