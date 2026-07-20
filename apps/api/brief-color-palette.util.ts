import { normalizeHex } from './brief-color-hex.util';

const COLOR_NAME_MAP: Array<{ keys: string[]; hex: string }> = [
  { keys: ['тёмно-син', 'темно-син', 'темносин', 'dark blue', 'navy'], hex: '#1E3A8A' },
  { keys: ['белый', 'white'], hex: '#FFFFFF' },
  { keys: ['черн', 'black'], hex: '#1A1A1A' },
  { keys: ['серый', 'grey', 'gray', 'серебр', 'silver'], hex: '#9CA3AF' },
  { keys: ['синий', 'blue'], hex: '#3B82F6' },
  { keys: ['голуб'], hex: '#06B6D4' },
  { keys: ['фиолет', 'purple', 'violet'], hex: '#7C5CFC' },
  { keys: ['индиго'], hex: '#6366F1' },
  { keys: ['зелен', 'green', 'эко'], hex: '#22C55E' },
  { keys: ['красн', 'red'], hex: '#EF4444' },
  { keys: ['бордов', 'maroon'], hex: '#9F1239' },
  { keys: ['оранж', 'orange'], hex: '#F97316' },
  { keys: ['желт', 'yellow', 'gold', 'золот'], hex: '#EAB308' },
  { keys: ['розов', 'pink'], hex: '#EC4899' },
  { keys: ['коричн', 'brown'], hex: '#92400E' },
  { keys: ['беж', 'beige', 'крем', 'cream', 'экрю'], hex: '#D4A574' },
  { keys: ['терракот', 'terracotta'], hex: '#C65D3B' },
  { keys: ['охр', 'ochre'], hex: '#CC7722' },
  { keys: ['горчич', 'mustard'], hex: '#C9A227' },
  { keys: ['бирюз', 'turquoise', 'teal'], hex: '#14B8A6' },
  { keys: ['олив', 'olive'], hex: '#6B8E23' },
];

const WARM_PALETTE_HEX = [
  '#D4A574',
  '#92400E',
  '#C65D3B',
  '#CC7722',
  '#C9A227',
  '#9F1239',
  '#EF4444',
  '#F97316',
  '#EAB308',
];

const COOL_PALETTE_HEX = ['#3B82F6', '#06B6D4', '#6366F1', '#1E3A8A', '#7C5CFC'];
const BRIGHT_PALETTE_HEX = [
  '#EF4444',
  '#22C55E',
  '#3B82F6',
  '#F97316',
  '#EAB308',
  '#EC4899',
  '#14B8A6',
];
const NATURAL_PALETTE_HEX = ['#92400E', '#D4A574', '#22C55E', '#C65D3B', '#CC7722', '#6B8E23'];
const TECH_METAL_PALETTE_HEX = ['#1A1A1A', '#9CA3AF', '#FFFFFF', '#C0C0C0', '#1E3A8A'];

/** Специальные маркеры для HSV-классификатора */
export const FORBIDDEN_TONE_BRIGHT = '__bright__';
export const FORBIDDEN_TONE_NEON = '__neon__';
export const FORBIDDEN_TONE_WARM = '__warm__';
export const FORBIDDEN_TONE_COOL = '__cool__';

export interface BriefColorPalette {
  allowedColors: string[];
  forbiddenHints: string[];
}

function normalizeBriefText(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е');
}

function isColorNegated(lower: string, key: string): boolean {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `(?:не|без|категорически не|запрещ\\w*|нельзя|избега\\w*)\\s+(?:\\w+[\\s-]){0,5}${escaped}`,
    'i',
  ).test(lower);
}

function extractExplicitColorSection(lower: string): string {
  const sections = [
    lower.match(/основн\w*\s+цвет[а-я]*\s*[—\-:.]\s*([^.!\n]{3,120})/i)?.[1] ?? '',
    lower.match(/цветов\w*\s+гамм\w*\s*[—\-:.]\s*([^.!\n]{3,120})/i)?.[1] ?? '',
    lower.match(/палитр\w*\s*[—\-:.]\s*([^.!\n]{3,120})/i)?.[1] ?? '',
    lower.match(/цвет[а-я]*\s*[—\-:]\s*([^.!\n]{3,120})/i)?.[1] ?? '',
  ];
  return sections.filter(Boolean).join(' ');
}

function parseAllowedHexFromText(text: string): string[] {
  const found: string[] = [];
  const lower = normalizeBriefText(text);
  const hexMatches = text.match(/#(?:[0-9a-fA-F]{3}){1,2}\b/g) ?? [];
  for (const raw of hexMatches) {
    const hex = normalizeHex(raw);
    if (hex && !found.includes(hex)) found.push(hex);
  }

  const colorSection = extractExplicitColorSection(lower);
  const searchIn = colorSection || lower;

  for (const { keys, hex } of COLOR_NAME_MAP) {
    const matched = keys.some((k) => searchIn.includes(k) && !isColorNegated(lower, k));
    if (matched && !found.includes(hex)) found.push(hex);
  }

  if (/темно[\s-]?син|тёмно[\s-]?син|dark\s*blue|navy/i.test(lower)) {
    const navy = '#1E3A8A';
    if (!found.includes(navy)) found.unshift(navy);
    const brightIdx = found.indexOf('#3B82F6');
    if (brightIdx >= 0) found.splice(brightIdx, 1);
  }

  const abstractRules: Array<{ re: RegExp; hex: string[] }> = [
    { re: /тепл[а-я]*\s+(?:цвет|гамм|тон)|warm\s+color|warm\s+palette|уютн[а-я]*\s+тон/i, hex: WARM_PALETTE_HEX },
    { re: /холодн[а-я]*\s+(?:цвет|гамм|тон)|cool\s+color|cool\s+palette/i, hex: COOL_PALETTE_HEX },
    {
      re: /(?:только\s+)?ярк[а-я]*\s+(?:цвет|гамм|тон)|bright\s+color|кислотн/i,
      hex: BRIGHT_PALETTE_HEX,
    },
    { re: /натуральн|earth|землист|эко.*цвет|organic/i, hex: NATURAL_PALETTE_HEX },
    {
      re: /технологич|tech.*цвет|металл|metal|футурист|futurist|минималист/i,
      hex: TECH_METAL_PALETTE_HEX,
    },
    { re: /золот[а-я]*\s+и\s+черн|gold\s+and\s+black|vip.*цвет/i, hex: ['#EAB308', '#1A1A1A', '#C0C0C0'] },
    {
      re: /новогод|рождеств|ёлоч|елоч/i,
      hex: ['#EF4444', '#22C55E', '#EAB308'],
    },
  ];

  for (const { re, hex } of abstractRules) {
    if (!re.test(lower)) continue;
    for (const h of hex) {
      if (!found.includes(h)) found.push(h);
    }
  }

  if (/тепл[а-я]*\s+цвет|тепл[а-я]*\s+гамм|warm\s+color/i.test(lower)) {
    const cool = ['#3B82F6', '#06B6D4', '#22C55E', '#6366F1', '#9CA3AF', '#1A1A1A', '#14B8A6'];
    for (const c of cool) {
      const idx = found.indexOf(c);
      if (idx >= 0) found.splice(idx, 1);
    }
  }

  return found.slice(0, 14);
}

function parseForbiddenColorHints(text: string): string[] {
  const lower = normalizeBriefText(text);
  const hints = new Set<string>();

  const negColorPatterns: Array<{ re: RegExp; hints: string[] }> = [
    {
      re: /(?:запрещ|нельзя|без|избега|не\s+использ|категорически\s+не|отказ).{0,35}(?:черн|black)/i,
      hints: ['черн', 'black'],
    },
    {
      re: /(?:запрещ|нельзя|без|избега|не\s+использ).{0,35}(?:сер|grey|gray|графит)/i,
      hints: ['сер', 'grey', 'gray'],
    },
    {
      re: /(?:запрещ|нельзя|без|избега|не\s+использ).{0,35}(?:бел|white|молочн)/i,
      hints: ['бел', 'white'],
    },
    {
      re: /(?:запрещ|нельзя|без|избега|отказ).{0,35}(?:ярк|неон|neon|кислот|fuchsia|фукси)/i,
      hints: [FORBIDDEN_TONE_BRIGHT, FORBIDDEN_TONE_NEON],
    },
    {
      re: /(?:запрещ|нельзя|без|избега).{0,35}(?:син|blue|голуб|navy)/i,
      hints: ['син', 'blue', 'голуб'],
    },
    {
      re: /(?:запрещ|нельзя|без|избега).{0,35}(?:красн|red|оранж|orange)/i,
      hints: ['красн', 'red', 'оранж', 'orange'],
    },
    {
      re: /(?:запрещ|нельзя|без|избега).{0,35}(?:зелен|green|олив)/i,
      hints: ['зелен', 'green', 'олив'],
    },
    {
      re: /(?:запрещ|нельзя|без|избега).{0,35}(?:желт|yellow|золот|gold)/i,
      hints: ['желт', 'yellow', 'золот', 'gold'],
    },
    {
      re: /(?:запрещ|нельзя|без|избега).{0,35}(?:розов|pink|фиолет|purple)/i,
      hints: ['розов', 'pink', 'фиолет', 'purple'],
    },
    {
      re: /(?:запрещ|нельзя|без|избега).{0,35}(?:коричн|brown|беж|beige|крем)/i,
      hints: ['коричн', 'brown', 'беж', 'beige', 'крем'],
    },
    {
      re: /(?:запрещ|нельзя|без|избега).{0,35}(?:бирюз|turquoise|teal)/i,
      hints: ['бирюз', 'turquoise', 'teal'],
    },
    {
      re: /без\s+темн|запрет\s+на\s+темн|не\s+темн/i,
      hints: ['черн', 'black', 'темно'],
    },
    {
      re: /спокойн|приглушен|muted|no\s+bright|не\s+ярк/i,
      hints: [FORBIDDEN_TONE_BRIGHT, FORBIDDEN_TONE_NEON],
    },
  ];

  for (const { re, hints: h } of negColorPatterns) {
    if (re.test(lower)) {
      for (const hint of h) hints.add(hint);
    }
  }

  for (const { keys } of COLOR_NAME_MAP) {
    for (const key of keys) {
      if (isColorNegated(lower, key)) {
        hints.add(key.length > 4 ? key.slice(0, 5) : key);
      }
    }
  }

  if (/холодн[а-я]*\s+(?:цвет|гамм)/i.test(lower) && !/запрещ.*тепл/i.test(lower)) {
    hints.add(FORBIDDEN_TONE_WARM);
  }
  if (/тепл[а-я]*\s+(?:цвет|гамм)/i.test(lower) && !/запрещ.*холод/i.test(lower)) {
    hints.add(FORBIDDEN_TONE_COOL);
  }

  return [...hints];
}

export function extractBriefColorPalette(text: string): BriefColorPalette {
  return {
    allowedColors: parseAllowedHexFromText(text),
    forbiddenHints: parseForbiddenColorHints(text),
  };
}

export function extractBriefColorsFromText(text: string): string[] {
  return extractBriefColorPalette(text).allowedColors;
}

export function extractBriefForbiddenColorHints(text: string): string[] {
  return extractBriefColorPalette(text).forbiddenHints;
}

export function briefPrefersWarmColors(text: string): boolean {
  const lower = normalizeBriefText(text);
  return /тепл[а-я]*\s+цвет|тепл[а-я]*\s+гамм|тепл[а-я]*\s+цветов|warm\s+color|warm\s+palette|уютн[а-я]*\s+тон/i.test(
    lower,
  );
}

export function briefPrefersBrightColors(text: string): boolean {
  const lower = normalizeBriefText(text);
  return /(?:только\s+)?ярк[а-я]*\s+(?:цвет|гамм)|bright\s+color|кислотн/i.test(lower);
}

export function briefAvoidsCoolColors(text: string): boolean {
  return briefPrefersWarmColors(text);
}
