import type { GeneratedConcept } from "@/lib/types";
import type {
  ConceptPreviewItem,
  ConceptPreviewLayout,
  ConceptPreviewProps,
} from "./conceptPreview.types";

const ALL_ITEMS: ConceptPreviewItem[] = [
  "gift_box",
  "nfc_card",
  "metal_keychain",
  "powerbank",
  "notebook",
  "instruction_card",
  "bottle",
  "thermos",
  "tote_bag",
  "backpack",
  "sticker_pack",
  "badge",
  "envelope",
  "tube",
  "pen",
  "stylus",
  "headphones",
  "cable",
  "usb_drive",
  "trophy",
  "certificate",
  "pouch",
];

const PRODUCT_TYPE_MAP: Record<string, ConceptPreviewItem> = {
  pen: "pen",
  pencil: "pen",
  notebook: "notebook",
  mug: "bottle",
  cup: "bottle",
  bottle: "bottle",
  thermos: "thermos",
  tshirt: "badge",
  shirt: "badge",
  hoodie: "pouch",
  cap: "badge",
  hat: "badge",
  bag: "tote_bag",
  backpack: "backpack",
  powerbank: "powerbank",
  charger: "cable",
  cable: "cable",
  headphones: "headphones",
  keychain: "metal_keychain",
  sticker: "sticker_pack",
  badge: "badge",
  flashdrive: "usb_drive",
  usb: "usb_drive",
  speaker: "tube",
  umbrella: "pouch",
  ball: "trophy",
  trophy: "trophy",
  certificate: "certificate",
  envelope: "envelope",
  card: "nfc_card",
  nfc: "nfc_card",
  gift: "gift_box",
  box: "gift_box",
  stylus: "stylus",
  tube: "tube",
  pouch: "pouch",
  other: "gift_box",
};

const KEYWORD_ITEM_HINTS: Array<{ pattern: RegExp; item: ConceptPreviewItem }> = [
  { pattern: /ручк|карандаш|pen/i, item: "pen" },
  { pattern: /блокнот|ежедневник|notebook/i, item: "notebook" },
  { pattern: /кружк|чашк|mug|стакан/i, item: "bottle" },
  { pattern: /термос/i, item: "thermos" },
  { pattern: /бутылк|bottle/i, item: "bottle" },
  { pattern: /сумк|шоппер|tote/i, item: "tote_bag" },
  { pattern: /рюкзак|backpack/i, item: "backpack" },
  { pattern: /power\s?bank|зарядк|аккумулятор/i, item: "powerbank" },
  { pattern: /наушник|headphone/i, item: "headphones" },
  { pattern: /брелок|keychain/i, item: "metal_keychain" },
  { pattern: /стикер|sticker/i, item: "sticker_pack" },
  { pattern: /бейдж|badge|значок/i, item: "badge" },
  { pattern: /флеш|usb|flash/i, item: "usb_drive" },
  { pattern: /конверт|envelope|письм/i, item: "envelope" },
  { pattern: /сертификат|certificate/i, item: "certificate" },
  { pattern: /коробк|gift|набор|box/i, item: "gift_box" },
  { pattern: /карт[аы]|nfc|доступ|ключ/i, item: "nfc_card" },
  { pattern: /кабель|cable/i, item: "cable" },
  { pattern: /трубк|tube/i, item: "tube" },
  { pattern: /чехол|pouch|кошел/i, item: "pouch" },
  { pattern: /стилус|stylus/i, item: "stylus" },
  { pattern: /трофей|наград|trophy/i, item: "trophy" },
  { pattern: /инструкц|буклет|card/i, item: "instruction_card" },
];

const THEME_SETS: Array<{ pattern: RegExp; items: ConceptPreviewItem[] }> = [
  {
    pattern: /ключ|доступ|карт[аы]|nfc|pass/i,
    items: ["nfc_card", "metal_keychain", "envelope", "instruction_card", "gift_box"],
  },
  {
    pattern: /будущ|ai|tech|цифров|digital|futur|орбитал|космос/i,
    items: ["nfc_card", "powerbank", "usb_drive", "instruction_card", "badge"],
  },
  {
    pattern: /welcome|онбординг|нович/i,
    items: ["gift_box", "notebook", "bottle", "sticker_pack", "envelope"],
  },
  {
    pattern: /eco|эко|green|природ|natural/i,
    items: ["tote_bag", "bottle", "notebook", "envelope", "sticker_pack"],
  },
  {
    pattern: /premium|премиум|executive|luxury|vip/i,
    items: ["gift_box", "nfc_card", "metal_keychain", "certificate", "pouch"],
  },
  {
    pattern: /travel|дорог|мобильн|путешеств/i,
    items: ["backpack", "thermos", "powerbank", "cable", "envelope"],
  },
];

export const DEFAULT_PREVIEW_ITEMS: ConceptPreviewItem[] = [
  "gift_box",
  "nfc_card",
  "notebook",
  "metal_keychain",
  "sticker_pack",
];

const DEFAULT_FALLBACK = DEFAULT_PREVIEW_ITEMS;

function isPreviewItem(value: string): value is ConceptPreviewItem {
  return (ALL_ITEMS as string[]).includes(value);
}

export function mapProductTypeToPreviewItem(raw: string): ConceptPreviewItem | null {
  const key = raw.trim().toLowerCase();
  if (isPreviewItem(key)) return key;
  if (PRODUCT_TYPE_MAP[key]) return PRODUCT_TYPE_MAP[key];
  for (const { pattern, item } of KEYWORD_ITEM_HINTS) {
    if (pattern.test(key)) return item;
  }
  return null;
}

function uniqueItems(items: ConceptPreviewItem[]): ConceptPreviewItem[] {
  const out: ConceptPreviewItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

function inferItemsFromText(blob: string): ConceptPreviewItem[] {
  for (const { pattern, items } of THEME_SETS) {
    if (pattern.test(blob)) return [...items];
  }
  const found: ConceptPreviewItem[] = [];
  for (const { pattern, item } of KEYWORD_ITEM_HINTS) {
    if (pattern.test(blob) && !found.includes(item)) found.push(item);
  }
  return found.length >= 3 ? found : [...DEFAULT_FALLBACK];
}

function itemsFromConcept(concept: GeneratedConcept): ConceptPreviewItem[] {
  const fromItems = concept.items
    .map((item) => {
      const fromId = item.id ? mapProductTypeToPreviewItem(item.id) : null;
      if (fromId) return fromId;
      return mapProductTypeToPreviewItem(item.name) ?? mapProductTypeToPreviewItem(item.description);
    })
    .filter(Boolean) as ConceptPreviewItem[];

  if (fromItems.length >= 3) return uniqueItems(fromItems);

  const blob = `${concept.name} ${concept.description} ${concept.tags.join(" ")}`;
  const fromText = inferItemsFromText(blob);
  return uniqueItems([...fromItems, ...fromText]);
}

export function pickDisplayItems(
  items: ConceptPreviewItem[],
  heroItem?: ConceptPreviewItem,
): ConceptPreviewItem[] {
  const base = uniqueItems(items);
  if (base.length === 0) return DEFAULT_FALLBACK.slice(0, 4);

  let picked: ConceptPreviewItem[];
  if (base.length > 5) {
    const hero = heroItem && base.includes(heroItem) ? heroItem : base[0];
    const rest = base.filter((i) => i !== hero).slice(0, 4);
    picked = [hero, ...rest];
  } else if (base.length < 3) {
    const pad = DEFAULT_FALLBACK.filter((i) => !base.includes(i));
    picked = uniqueItems([...base, ...pad]).slice(0, 5);
  } else {
    picked = base.slice(0, 5);
  }

  if (heroItem && picked.includes(heroItem) && picked[0] !== heroItem) {
    picked = [heroItem, ...picked.filter((i) => i !== heroItem)].slice(0, 5);
  }

  return picked.slice(0, 5);
}

export function inferHeroItem(
  items: ConceptPreviewItem[],
  title?: string,
  description?: string,
): ConceptPreviewItem | undefined {
  const blob = `${title ?? ""} ${description ?? ""}`.toLowerCase();
  if (/ключ|key|nfc|карт[аы]|доступ/.test(blob) && items.includes("nfc_card")) return "nfc_card";
  if (/gift|короб|набор|box/.test(blob) && items.includes("gift_box")) return "gift_box";
  if (/badge|бейдж|значок/.test(blob) && items.includes("badge")) return "badge";
  if (/сертификат|certificate/.test(blob) && items.includes("certificate")) return "certificate";
  return items[0];
}

export function inferLayout(tags: string[] = [], title = "", description = ""): ConceptPreviewLayout {
  const blob = `${tags.join(" ")} ${title} ${description}`.toLowerCase();
  if (/mysterious|тайн|dark|noir|скан|scan|minimalist.*myster/.test(blob)) return "mysterious_scan";
  if (/tech|futur|blueprint|орбитал|цифров|ai|космос/.test(blob)) return "tech_blueprint";
  if (/eco|эко|natural|craft|organic|природ/.test(blob)) return "eco_craft";
  if (/minimal|минимал|clean|simple/.test(blob)) return "minimal_flatlay";
  if (/premium|luxury|executive|премиум/.test(blob)) return "premium_grid";

  const layouts: ConceptPreviewLayout[] = [
    "premium_grid",
    "minimal_flatlay",
    "mysterious_scan",
    "tech_blueprint",
    "eco_craft",
  ];
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash + title.charCodeAt(i) * (i + 1)) % layouts.length;
  return layouts[hash] ?? "premium_grid";
}

export function normalizePalette(colors: string[] = []): string[] {
  const cleaned = colors.map((c) => c?.trim()).filter(Boolean) as string[];
  if (cleaned.length > 0) return cleaned.slice(0, 6);
  return ["#8b5cf6", "#22d3ee", "#f4f4f5", "#a1a1aa"];
}

export function conceptPreviewFromGenerated(
  concept: GeneratedConcept,
  briefColors: string[] = [],
): ConceptPreviewProps {
  const items = itemsFromConcept(concept);
  const heroItem = inferHeroItem(items, concept.name, concept.description);
  const palette =
    briefColors.length > 0
      ? normalizePalette(briefColors)
      : normalizePalette(
          concept.items
            .map((i) => i.targetColor ?? i.colors?.[0])
            .filter(Boolean) as string[],
        );

  return {
    title: concept.name,
    tags: concept.tags,
    palette,
    items: pickDisplayItems(items, heroItem),
    heroItem,
    layout: inferLayout(concept.tags, concept.name, concept.description),
    showLabel: true,
    showPalette: true,
  };
}
