import type { CatalogProduct } from '../providers/llm/catalog.util';
import {
  type ProductRole,
  colorHintsFromProduct,
  detectTypeSlug,
  familyForType,
  metaForType,
} from './product-taxonomy';

export type { ProductRole };

export interface NormalizedProductRole {
  role: ProductRole;
  /** Узкий slug типа (tshirt, thermos, …) — единый из таксономии. */
  legacyType: string;
  isGiftBundle: boolean;
  isWearable: boolean;
  isTech: boolean;
  isOffice: boolean;
  colorHints: string[];
}

/** Нормализованная роль товара — выводится из единой таксономии типов. */
export function detectProductRole(product: CatalogProduct): NormalizedProductRole {
  const slug = detectTypeSlug(product);
  const meta = metaForType(slug);
  return {
    role: meta.role,
    legacyType: slug,
    isGiftBundle: Boolean(meta.giftBundle),
    isWearable: Boolean(meta.wearable),
    isTech: Boolean(meta.tech),
    isOffice: Boolean(meta.office),
    colorHints: colorHintsFromProduct(product),
  };
}

export function isGiftBundleProduct(product: CatalogProduct): boolean {
  return Boolean(metaForType(detectTypeSlug(product)).giftBundle);
}

/** Семейство роли для лимитов в наборе (один экземпляр на семейство). */
export function roleFamilyForProduct(product: CatalogProduct): string {
  return familyForType(detectTypeSlug(product));
}

const PACKAGING_TEXT_RE =
  /мешоч|мешок\s+(?:из\s+)?(?:спанбонд|сатин|л[её]н|лент|organza|атлас)|подарочн\w*\s+(?:меш|упаков|пакет|сумк)|(?:gift|подарочн)\s*bag|упаковочн|зип.?pak|zip.?pak|(?:очищающ|чистящ|cleansing|neat).*салфет|салфетк.*(?:микрофибр|очист|экран|чист|neat)|(?:^|\s)салфетк(?:а|и)?(?:\s|$)|микрофибр.*(?:салфет|чехол|полотен)|(?:^|\s)neat(?:\s|$)|(?:^|\s)полотенц(?:е|а|о)?(?:\s|$)|лен,\s*средн|льн[яеой]\w*\s+мешоч/i;

const TECH_IRRELEVANT_FILLER_RE =
  /войлок.*чехол|чехол.*войлок|гостев\w*\s+полотен|туалетн\w*\s+принадлеж|банн\w*\s+принадлеж|«\s*neat\s*»|neat.*микрофибр|twinkle|lavrik.*холодильник|superbag|фетр.*(?:чехол|сумк)|чехол.*фетр|мешочек\s+подароч/i;

/** Подарочная упаковка / чистящие салфетки — не содержимое корпоративного набора. */
export function isPackagingProduct(product: CatalogProduct): boolean {
  return detectProductRole(product).role === 'packaging';
}

export function briefAllowsPackaging(brief: string): boolean {
  return /упаковк|мешоч|пакет\s+для\s+подар|gift\s*wrap/i.test(String(brief ?? '').toLowerCase());
}

const TOWEL_TEXT_RE = /полотенц|towel|махров|банн\w*\s+принадлеж/i;
const COOLER_BAG_RE = /сумк[аи][\s-]*холодильник|cooler\s*bag|изотерм\w*\s+сумк/i;

/** Бриф явно просит полотенца / банный контекст. */
export function briefAllowsTowels(brief: string): boolean {
  return /полотенц|towel|банн|спа|wellness|спорт|фитнес|пляж|бассейн|hygge|уют/i.test(
    String(brief ?? '').toLowerCase(),
  );
}

/** Сумка-холодильник уместна только для outdoor/пикника. */
export function briefAllowsCoolerBags(brief: string): boolean {
  return /пикник|picnic|outdoor|пляж|обед|кемпинг|фестивал/i.test(String(brief ?? '').toLowerCase());
}

function isTechBrief(brief: string): boolean {
  return /разработчик|инженер|(?<![а-яёa-z])it(?![а-яёa-z])|айти|tech|хакатон|hackathon|кодер|coder|геймдев|software|devops|программист/i.test(
    String(brief ?? '').toLowerCase(),
  );
}

/** Дешёвый филлер каталога: мешочки, салфетки-протирки, гостевые полотенца, сумки-холодильники вне контекста. */
export function isCorporateSetFiller(product: CatalogProduct, brief = ''): boolean {
  if (briefAllowsPackaging(brief)) return false;
  if (isPackagingProduct(product)) return true;
  const text = `${product.name ?? ''} ${product.description ?? ''} ${product.category ?? ''} ${product.subcategory ?? ''}`.toLowerCase();
  const catText = `${product.category ?? ''} ${product.subcategory ?? ''}`.toLowerCase();
  if (PACKAGING_TEXT_RE.test(text)) return true;
  if (isTechBrief(brief) && /текстил/i.test(catText) && !/футболк|худи|кепк|tshirt|hoodie|cap\b/i.test(text)) {
    return true;
  }
  if (/текстил|банн|туалетн|упаков/i.test(catText) && !briefAllowsTowels(brief) && !briefAllowsPackaging(brief)) {
    if (isTechBrief(brief) || !/мерч|одежд|футболк|худи|кепк|спа|wellness/i.test(String(brief ?? '').toLowerCase())) {
      return true;
    }
  }
  if (/банн\w*\s+принадлеж|туалетн\w*\s+принадлеж/i.test(catText) && !briefAllowsTowels(brief)) return true;
  if (/^(?:❓\s*)?(?:текстил|банн|туалетн)/i.test(String(product.category ?? '').trim()) && !briefAllowsTowels(brief) && !briefAllowsPackaging(brief)) {
    if (isTechBrief(brief) || !/мерч|одежд|футболк|худи|кепк|спа|wellness/i.test(String(brief ?? '').toLowerCase())) {
      return true;
    }
  }
  if (TOWEL_TEXT_RE.test(text) && !briefAllowsTowels(brief)) return true;
  if (COOLER_BAG_RE.test(text) && !briefAllowsCoolerBags(brief)) return true;
  if (isTechBrief(brief) && TECH_IRRELEVANT_FILLER_RE.test(text)) return true;
  const merchBrief = /мерч|хакатон|hackathon|конференц|корпоративн\w*\s+подарк/i.test(
    String(brief ?? '').toLowerCase(),
  );
  if (
    merchBrief &&
    !briefAllowsTowels(brief) &&
    /полотенц|салфет|мешоч|микрофибр|гостев/i.test(text)
  ) {
    return true;
  }
  return false;
}
