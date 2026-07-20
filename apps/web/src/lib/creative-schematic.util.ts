import type { GeneratedConcept, ConceptItem } from "@/lib/types";

const PRODUCT_LABELS: Record<string, string> = {
  pen: "Ручка",
  notebook: "Блокнот",
  mug: "Кружка",
  cup: "Чашка",
  tshirt: "Футболка",
  shirt: "Футболка",
  bag: "Сумка",
  backpack: "Рюкзак",
  thermos: "Термос",
  bottle: "Бутылка",
  hoodie: "Худи",
  cap: "Кепка",
  hat: "Кепка",
  powerbank: "Powerbank",
  charger: "Зарядка",
  umbrella: "Зонт",
  towel: "Полотенце",
  ball: "Мяч",
  keychain: "Брелок",
  sticker: "Стикер",
  badge: "Бейдж",
  lanyard: "Ланьярд",
  flashdrive: "Флешка",
  speaker: "Колонка",
  headphones: "Наушники",
  apron: "Фартук",
  pot: "Кастрюля",
  dish: "Посуда",
  plate: "Тарелка",
  spoon: "Ложка",
  other: "Аксессуар",
};

const KEYWORD_HINTS: Array<{ pattern: RegExp; type: string }> = [
  { pattern: /ручк/i, type: "pen" },
  { pattern: /кружк|чашк|mug/i, type: "mug" },
  { pattern: /блокнот|ежедневник/i, type: "notebook" },
  { pattern: /термос|бутылк/i, type: "bottle" },
  { pattern: /сумк|рюкзак/i, type: "bag" },
  { pattern: /футболк|худи|текстил/i, type: "tshirt" },
  { pattern: /кепк|шапк/i, type: "cap" },
  { pattern: /зонт/i, type: "umbrella" },
  { pattern: /мяч|футбол/i, type: "ball" },
  { pattern: /полотенц/i, type: "towel" },
  { pattern: /фартук|кухн|барбекю/i, type: "apron" },
  { pattern: /кастрюл|посуд/i, type: "pot" },
  { pattern: /powerbank|зарядк/i, type: "powerbank" },
  { pattern: /наушник/i, type: "headphones" },
  { pattern: /брелок|ланьярд/i, type: "keychain" },
];

export type SchematicElement = {
  id: string;
  label: string;
  productType: string;
  accentColor: string;
};

export function productTypeLabel(type: string): string {
  const key = type.trim().toLowerCase();
  return PRODUCT_LABELS[key] ?? (type.trim() || "Элемент");
}

export function mapIdeatorItemsToConceptItems(
  items: Array<{ productType?: string; notes?: string }> | undefined,
  colorPalette: string[] = [],
  briefColors: string[] = [],
): ConceptItem[] {
  const palette = [...briefColors, ...colorPalette].filter(Boolean);
  return (items ?? [])
    .filter((i) => i?.productType?.trim())
    .map((item, index) => {
      const type = item.productType!.trim().toLowerCase();
      return {
        id: type,
        name: item.notes?.trim() || productTypeLabel(type),
        description: productTypeLabel(type),
        price: 0,
        targetColor: palette[index % palette.length],
        colors: palette[index % palette.length] ? [palette[index % palette.length]] : undefined,
      };
    });
}

function extractTypesFromText(text: string): string[] {
  const found: string[] = [];
  const seen = new Set<string>();
  for (const { pattern, type } of KEYWORD_HINTS) {
    if (pattern.test(text) && !seen.has(type)) {
      seen.add(type);
      found.push(type);
    }
  }
  return found;
}

export function buildSchematicElements(
  concept: GeneratedConcept,
  briefColors: string[] = [],
): SchematicElement[] {
  const palette =
    briefColors.length > 0
      ? briefColors
      : concept.items
          .map((i) => i.targetColor ?? i.colors?.[0])
          .filter(Boolean) as string[];

  if (concept.items.length > 0) {
    return concept.items.slice(0, 8).map((item, index) => ({
      id: item.id ?? `${item.name}-${index}`,
      label: item.name,
      productType: item.id ?? item.name,
      accentColor: item.targetColor ?? palette[index % palette.length] ?? "#8b5cf6",
    }));
  }

  const blob = `${concept.name} ${concept.description} ${concept.tags.join(" ")}`;
  const types = extractTypesFromText(blob);
  if (types.length > 0) {
    return types.slice(0, 6).map((type, index) => ({
      id: type,
      label: productTypeLabel(type),
      productType: type,
      accentColor: palette[index % palette.length] ?? "#8b5cf6",
    }));
  }

  return concept.tags.slice(0, 4).map((tag, index) => ({
    id: `tag-${index}`,
    label: tag,
    productType: "other",
    accentColor: palette[index % palette.length] ?? "#8b5cf6",
  }));
}
