import type { CatalogProduct } from './catalog.util';
import { detectConceptProductType } from './concept-diversity.util';
import { productHasForbiddenColor } from './catalog-color-match.util';
import { extractBriefForbiddenColorHints } from '../../requests/brief-color-palette.util';

function isGiftBundleProductName(text: string): boolean {
  return /набор\s+(?:для|«|")|подарочн\w*\s+набор|gift\s*set/i.test(text);
}

function normalizeText(text: unknown): string {
  return String(text ?? '').toLowerCase().replace(/ё/g, 'е');
}

function colorLabel(color: unknown): string {
  if (typeof color === 'string') return color;
  if (color && typeof color === 'object') {
    const c = color as { name?: unknown; hex?: unknown };
    if (typeof c.name === 'string') return c.name;
    if (typeof c.hex === 'string') return c.hex;
  }
  return '';
}

function productText(product: CatalogProduct): string {
  return normalizeText(`${product.name} ${product.description ?? ''} ${product.subcategory ?? ''}`);
}

function colorNames(product: CatalogProduct): string[] {
  return (product.colors ?? []).map(colorLabel).map(normalizeText).filter(Boolean);
}

/** Запрещённые цвета из текста брифа */
export function parseBriefForbiddenColors(brief: string): string[] {
  return extractBriefForbiddenColorHints(brief);
}

function productViolatesColorBan(product: CatalogProduct, forbiddenColorHints: string[]): boolean {
  return productHasForbiddenColor(product, forbiddenColorHints);
}

const SUMMER_BRIEF = /летн|фестивал|outdoor|open\s*air|пляж|жарк/i;
const WINTER_BRIEF = /зимн|новогод|ёлоч|елоч|рождеств/i;
const COZY_WINTER_BRIEF = /уют|комфорт|тепл|hygge|зимн|благодарност|арендатор|холодн/i;
const TECH_BRIEF = /разработчик|инженер|it[\s-]|tech|конференц|минимализм|инновац|software|devops/i;
const SPORT_BRIEF = /спорт|болельщик|динамичн|фитнес|марафон/i;
const ECO_BRIEF = /эколог|земл|устойчив|волонтер|активист/i;

const PICNIC_BRIEF = /пикник|picnic|outdoor.*обед/i;
const OFFICE_BRIEF = /офис|office|корпоративн\w*\s+подарк|благодарност.*арендатор/i;
const JEWELRY_VIP_BRIEF = /ювелир|jewelry|vip|роскошн|luxury/i;

/** Релевантность SKU брифу: отрицательные значения = отсечь */
export function scoreBriefRelevance(
  product: CatalogProduct,
  brief: string,
  brandColors: string[] = [],
): number {
  const text = productText(product);
  const briefNorm = normalizeText(brief);
  let score = 0;

  const type = detectConceptProductType(product);

  if (SUMMER_BRIEF.test(briefNorm)) {
    if (type === 'christmas_decor' || /ёлочн|елочн|новогод|рождеств|игрушк/i.test(text)) {
      return -200;
    }
    if (type === 'car_accessory' || /шторк|автомобил|салон авто/i.test(text)) {
      return -150;
    }
    if (/летн|ярк|неон|фестивал/i.test(text)) score += 15;
  }

  if (WINTER_BRIEF.test(briefNorm) && type === 'sunglasses') {
    score -= 20;
  }

  if (!WINTER_BRIEF.test(briefNorm) && type === 'christmas_decor') {
    return -200;
  }

  if (type === 'keychain' || /обвес|брелок/i.test(text)) {
    const apparelBrief = /футболк|оверсайз|кепк|панам|очк|фестивал|летн|мерч|одежд/i.test(briefNorm);
    if (apparelBrief && !/брелок|обвес/i.test(briefNorm)) return -200;
  }

  if (type === 'other' && /фестивал|летн|футболк|мерч/i.test(briefNorm)) {
    score -= 30;
  }

  if (type === 'car_accessory' && !/(?:авто|машин|car\b|автомобил)/i.test(briefNorm)) {
    return -150;
  }

  if (/(?:vip|инвестор|premium|премиум|luxury|банк)/i.test(briefNorm)) {
    if (/инструмент|tire|шиномонтаж|набор из \d+/i.test(text)) return -220;
    if (/стикер|наклейк|брелок|обвес|бейдж/i.test(text) && (product.price ?? 0) < 80) {
      return -120;
    }
  }

  if (TECH_BRIEF.test(briefNorm)) {
    if (/подарочн\w*\s+набор|welcome\s*pack|superbag|hygge|шарф|косметич|разделочн|кухонн.*полотен/i.test(text)) {
      return -130;
    }
    if (['notebook', 'pen', 'powerbank', 'flash', 'speaker', 'bottle', 'thermos', 'thermos_mug', 'tech_accessory'].includes(type)) {
      score += 35;
    }
    if (type === 'gift_set' || type === 'welcome_pack' || type === 'scarf' || type === 'blanket') {
      score -= 60;
    }
  }

  if (SPORT_BRIEF.test(briefNorm)) {
    if (/разделочн|ежедневник|блокнот|кружк/i.test(text) && !/спорт|бутыл|полотенц/i.test(text)) {
      score -= 40;
    }
    if (/черн|black|темно[\s-]?син|серый|grey/i.test(text) && /запрещ.*темн|ярк.*оранж|ярк.*зелен/i.test(briefNorm)) {
      score -= 70;
    }
  }

  if (ECO_BRIEF.test(briefNorm)) {
    if (/рождеств|новогод|пластик|синтет/i.test(text)) score -= 50;
    if (/wood|дерев|бамбук|эко|переработ/i.test(text)) score += 25;
  }

  if (WINTER_BRIEF.test(briefNorm)) {
    if (/разделочн|путешеств|бейсболк/i.test(text) && !/новогод|рождеств|ёлоч|елоч/i.test(text)) {
      score -= 80;
    }
  }

  if (COZY_WINTER_BRIEF.test(briefNorm)) {
    if (type === 'fitness' || /фитнес|fitness|резинк|эспандер|cross/i.test(text)) {
      return -220;
    }
    if (type === 'raincoat' || /дождевик|ветровк|tornado/i.test(text)) {
      return -200;
    }
    if ((type === 'notebook' || type === 'diary') && !/уют|hygge|тепл/i.test(text)) {
      score -= 120;
    }
    if (type === 'socks' || /носк/i.test(text)) {
      score -= 100;
    }
    if (isGiftBundleProductName(text) && !/плед|термос|свеч|hygge|comfort|чай/i.test(text)) {
      score -= 150;
    }
    if (/плед|термос|термокруж|свеч|чай|какао|подушк|hygge|comfort|уют/i.test(text)) {
      score += 45;
    }
    if (/фляг|flask/i.test(text)) {
      return -180;
    }
  }

  if (PICNIC_BRIEF.test(briefNorm)) {
    if (/носк|обложк.*паспорт|кухонн.*полотен|ежедневник|блокнот/i.test(text) && !/пикник|outdoor/i.test(text)) {
      score -= 90;
    }
    if (/плед|термос|бутылк|корзин|набор.*пикник/i.test(text)) score += 35;
  }

  if (OFFICE_BRIEF.test(briefNorm) && !SPORT_BRIEF.test(briefNorm) && !TECH_BRIEF.test(briefNorm)) {
    if (type === 'fitness' || /фитнес|cross|марафон|спортивн.*инвент/i.test(text)) {
      return -180;
    }
    if (/бейсболк|кепк/i.test(text) && !/мерч|фестивал/i.test(briefNorm)) score -= 50;
  }

  if (JEWELRY_VIP_BRIEF.test(briefNorm)) {
    if ((product.price ?? 0) < 200 && /брелок|стикер|бейдж|обвес/i.test(text)) return -150;
    if (/кож|металл|дерев|хрустал|хрусталь|премиум|vip/i.test(text)) score += 40;
    if (/носк|полотенц|блокнот.*стикер/i.test(text)) score -= 80;
  }

  if (TECH_BRIEF.test(briefNorm)) {
    if (/бейсболк|носк|поло|футболк/i.test(text) && !/мерч|одежд/i.test(briefNorm)) {
      score -= 70;
    }
  }

  const forbiddenColors = parseBriefForbiddenColors(brief);
  if (productViolatesColorBan(product, forbiddenColors)) {
    return -200;
  }

  const briefTokens = briefNorm.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 4);
  for (const token of briefTokens) {
    if (text.includes(token)) score += 6;
  }

  const negativePatterns: Array<{ pattern: RegExp; penaltyTypes: string[]; penalty: number }> = [
    {
      pattern: /(?:избежа|без|не\s+использ|отклон).{0,30}(?:офис|стандартн|традицион)/i,
      penaltyTypes: ['pen', 'pencil', 'notebook', 'planner', 'diary'],
      penalty: -80,
    },
    {
      pattern: /(?:без|не\s+использ).{0,20}пластик/i,
      penaltyTypes: [],
      penalty: -100,
    },
  ];

  const briefLower = brief.toLowerCase();
  const productType = detectConceptProductType(product);
  const productTextFull = `${product.name} ${product.category ?? ''} ${product.description ?? ''}`.toLowerCase();

  for (const neg of negativePatterns) {
    if (!neg.pattern.test(briefLower)) continue;
    if (neg.penaltyTypes.length === 0) {
      if (/пластик|пластмасс|plastic|polypropylene|кукурузн.{0,10}крахмал/i.test(productTextFull)) {
        score += neg.penalty;
      }
    } else if (neg.penaltyTypes.includes(productType)) {
      score += neg.penalty;
    }
  }

  return score;
}

export function filterCatalogByBriefRelevance(
  catalog: CatalogProduct[],
  brief: string,
  brandColors: string[] = [],
  minKeep = 40,
): CatalogProduct[] {
  const briefNorm = brief.toLowerCase();
  const cozy = /уют|комфорт|тепл|hygge|зимн|благодарност/i.test(briefNorm);
  const premium = /vip|премиум|premium|luxury|роскошн|ювелир/i.test(briefNorm);
  const tech = /it[\s-]|tech|конференц|разработчик/i.test(briefNorm);
  const minScore = cozy || premium || tech ? -35 : -80;

  const scored = catalog
    .map((p) => ({ product: p, score: scoreBriefRelevance(p, brief, brandColors) }))
    .filter((s) => s.score > minScore)
    .sort((a, b) => b.score - a.score);

  if (scored.length >= minKeep) {
    return scored.map((s) => s.product);
  }
  return catalog;
}
