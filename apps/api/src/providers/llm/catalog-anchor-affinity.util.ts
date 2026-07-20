import type { CatalogProduct } from './catalog.util';
import { detectConceptProductType } from './concept-diversity.util';

/**
 * ЯКОРНЫЙ ТОВАР + СОВМЕСТИМЫЙ КОМПЛЕМЕНТ. Когда пользователь просит КОНКРЕТНЫЙ товар (якорь —
 * повербанк/зарядка), к нему добирать надо СВЯЗАННОЕ (кабель/провод/зарядная станция/наушники/тех-
 * аксессуар), а если ничего супер-подходящего нет — оставить якорь СОЛО (лучше один повербанк, чем
 * повербанк + помада/несессер/сумка/блокнот). Карта расширяема (одна строка = один класс якоря).
 */
interface AnchorAffinity {
  id: string;
  /** slug-типы, распознаваемые как этот якорь */
  anchorTypes: Set<string>;
  /** якорь по имени (фолбэк, если тип не пойман таксономией) */
  anchorText: RegExp;
  /** slug-типы комплемента, совместимые с якорем */
  okTypes: Set<string>;
  /** совместимый комплемент по имени/категории */
  okText: RegExp;
}

const ANCHOR_AFFINITIES: AnchorAffinity[] = [
  {
    id: 'tech_charging',
    anchorTypes: new Set(['powerbank', 'charger', 'tech_accessory', 'flash', 'speaker', 'watch', 'hub', 'headphones']),
    anchorText:
      /повербанк|power\s*bank|внешн[а-яё]*\s+аккумул|(?<![а-яё])аккумулятор|беспроводн[а-яё]*\s+заряд|зарядн[а-яё]*\s+устройств|портативн[а-яё]*\s+зарядн|(?<![а-яё])колонк|наушник|(?<![а-яё])флешк|usb[\s-]?хаб/i,
    okTypes: new Set(['powerbank', 'tech_accessory', 'speaker', 'watch', 'flash', 'headphones', 'hub', 'charger', 'mouse']),
    okText:
      /кабель|провод|зарядн|адаптер|переходник|(?<![а-яё])usb|type-?c|док[\s-]?станц|подставк[а-яё]*\s+для\s+(?:телефон|планшет|ноут)|беспроводн[а-яё]*\s+заряд|(?<![а-яё])хаб(?![а-яё])|наушник|гарнитур|коврик\s+для\s+мыш|(?<![а-яё])стилус|держател[а-яё]*\s+для\s+(?:телефон|планшет)|(?<![а-яё])smart|(?<![а-яё])умн|салфетк[а-яё]*\s+для\s+(?:экран|техник|гаджет)|стеклоочистит/i,
  },
];

/** Найти класс якоря по slug-типу или по имени. null — якорь неизвестен (аффинити не применяем). */
export function anchorAffinityFor(anchorType: string, anchorLabel = ''): AnchorAffinity | null {
  const label = (anchorLabel || '').toLowerCase();
  for (const a of ANCHOR_AFFINITIES) {
    if (a.anchorTypes.has(anchorType) || (label && a.anchorText.test(label))) return a;
  }
  return null;
}

/** Есть ли для якоря карта совместимости (нужно ли вообще гейтить добор). */
export function hasAnchorAffinity(anchorType: string, anchorLabel = ''): boolean {
  return anchorAffinityFor(anchorType, anchorLabel) !== null;
}

/**
 * Совместим ли КОМПЛЕМЕНТ с якорём. Если у якоря нет карты (неизвестный класс) — true (не гейтим,
 * обычное поведение). Для тех-якоря совместимы только тех-зарядные аксессуары; помада/сумка/блокнот — нет.
 */
export function isCompatibleComplement(
  anchorType: string,
  anchorLabel: string,
  complement: CatalogProduct,
): boolean {
  const aff = anchorAffinityFor(anchorType, anchorLabel);
  if (!aff) return true;
  const ct = detectConceptProductType(complement);
  if (aff.okTypes.has(ct)) return true;
  const text = `${complement.name} ${complement.category ?? ''} ${complement.subcategory ?? ''}`
    .toLowerCase()
    .replace(/ё/g, 'е');
  return aff.okText.test(text);
}
