import { normalizeMethodName, type ImprintMethodCode } from '../generation/imprint-methods';

export interface ParsedBrandingZone {
  zoneName: string | null;
  methodRaw: string;
  methodCode: ImprintMethodCode;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
  maxAreaMm2: number | null;
  maxColors: number | null;
  setupCost: number | null;
  zoneImageUrl: string | null;
}

export interface ParsedProductBranding {
  sourceId: 'oasis' | 'midocean' | 'art24';
  externalId: string;
  material: string | null;
  zones: ParsedBrandingZone[];
}

function zone(partial: Partial<ParsedBrandingZone> & { methodRaw: string }): ParsedBrandingZone {
  return {
    zoneName: null,
    methodCode: normalizeMethodName(partial.methodRaw) ?? 'UNKNOWN',
    maxWidthMm: null,
    maxHeightMm: null,
    maxAreaMm2: null,
    maxColors: null,
    setupCost: null,
    zoneImageUrl: null,
    ...partial,
  };
}

function extractTag(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1].trim() : '';
}

function toInt(s: string): number | null {
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

/** «до 609.00 см²» → 60900 мм². 1 см² = 100 мм². */
export function parseOasisAreaToMm2(size: string): number | null {
  const m = (size ?? '').match(/([\d.,]+)\s*см\s*[²2]/i);
  if (!m) return null;
  const cm2 = Number.parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(cm2)) return null;
  return Math.round(cm2 * 100);
}

/**
 * Признак текстильного материала. Нужен, чтобы отличить шелкографию по ткани
 * (SCREEN_PRINT_TEXTILE: 6 цветов, A3) от шелкографии по твёрдому (SCREEN_PRINT_HARD:
 * 2 цвета, 200x200мм) — по названию метода их не различить, обе формулировки
 * («Шелкография» / «Шелкотрафаретная печать») резолвятся в normalizeMethodName
 * одинаково.
 */
const TEXTILE_SUBSTRING_KEYWORDS = [
  'хлопок',
  'текстиль',
  'ткан',
  'полиэстер',
  'фетр',
  'трикотаж',
  'джерси',
  'флис',
];

// 'лён'/'лен' — короткие корни, совпадающие как подстрока внутри несвязанных слов
// (клён/клен «maple», полено «log»). JS \b не годится для кириллицы, поэтому
// границу слова эмулируем явно: не-буква кириллицы (или начало/конец строки)
// по обе стороны совпадения.
const LINEN_WHOLE_WORD_RE = /(^|[^а-яё])(лён|лен)([^а-яё]|$)/i;

export function isTextileMaterial(materialRu: string | null | undefined): boolean {
  const s = (materialRu ?? '').trim().toLowerCase();
  if (!s) return false;
  if (TEXTILE_SUBSTRING_KEYWORDS.some((k) => s.includes(k))) return true;
  return LINEN_WHOLE_WORD_RE.test(s);
}

/**
 * Уточняет метод по материалу: SCREEN_PRINT_HARD на текстиле — это на самом деле
 * SCREEN_PRINT_TEXTILE (иные лимиты и физика). Никакой другой код не трогает —
 * это не общий даунгрейд, а точечное исправление одной неоднозначности имени.
 */
export function refineMethodByMaterial(
  code: ImprintMethodCode,
  materialRu: string | null | undefined,
): ImprintMethodCode {
  if (code === 'SCREEN_PRINT_HARD' && isTextileMaterial(materialRu)) return 'SCREEN_PRINT_TEXTILE';
  return code;
}

interface OasisAttribute {
  name?: string;
  value?: string;
}
interface OasisBranding {
  name?: string;
  size?: string;
  place?: string;
  setup?: number;
}

export function parseOasisProduct(p: Record<string, unknown>): ParsedProductBranding | null {
  const externalId = String((p.article as string) ?? (p.id as string) ?? '').trim();
  if (!externalId) return null;

  const attrs = (p.attributes as OasisAttribute[]) ?? [];
  const material = attrs.find((a) => /^материал\s+товара/i.test(a.name ?? ''))?.value?.trim() ?? null;

  const zones: ParsedBrandingZone[] = [];

  for (const b of (p.included_branding as OasisBranding[]) ?? []) {
    const methodRaw = (b.name ?? '').trim();
    if (!methodRaw) continue;
    zones.push(
      zone({
        methodRaw,
        zoneName: b.place?.trim() || null,
        maxAreaMm2: parseOasisAreaToMm2(b.size ?? ''),
        setupCost: typeof b.setup === 'number' ? b.setup : null,
      }),
    );
  }

  // Методы из attributes: зона неизвестна, но знать метод полезно
  const known = new Set(zones.map((z) => z.methodCode));
  for (const a of attrs) {
    if (!/^метод\s+нанесения/i.test(a.name ?? '')) continue;
    const methodRaw = (a.value ?? '').trim();
    if (!methodRaw) continue;
    const code = normalizeMethodName(methodRaw) ?? 'UNKNOWN';
    if (known.has(code)) continue;
    known.add(code);
    zones.push(zone({ methodRaw }));
  }

  if (zones.length === 0 && !material) return null;

  // Материал резолвится выше; уточняем методы зон вторым проходом, когда он уже известен.
  const refinedZones = zones.map((z) => ({ ...z, methodCode: refineMethodByMaterial(z.methodCode, material) }));

  return { sourceId: 'oasis', externalId, material, zones: refinedZones };
}

export function parseMidoceanProductBlock(block: string): ParsedProductBranding | null {
  const externalId = extractTag(block, 'code') || extractTag(block, 'id');
  if (!externalId) return null;

  const optionsBlock = extractTag(block, 'print_options');
  if (!optionsBlock) return null;

  const material = extractTag(block, 'material') || null;

  const zones: ParsedBrandingZone[] = [];
  for (const raw of optionsBlock.split(/<print_option>/i).slice(1)) {
    const opt = raw.split(/<\/print_option>/i)[0];
    const zoneName = extractTag(opt, 'position') || null;
    const w = toInt(extractTag(opt, 'printable_width'));
    const h = toInt(extractTag(opt, 'printable_height'));
    const zoneImageUrl = extractTag(opt, 'image') || null;

    for (const techRaw of opt.split(/<print_technique>/i).slice(1)) {
      const tech = techRaw.split(/<\/print_technique>/i)[0];
      const methodRaw = extractTag(tech, 'name');
      if (!methodRaw) continue;
      const z = zone({
        methodRaw,
        zoneName,
        maxWidthMm: w,
        maxHeightMm: h,
        maxAreaMm2: w != null && h != null ? w * h : null,
        maxColors: toInt(extractTag(tech, 'max_colors')),
        zoneImageUrl,
      });
      zones.push({ ...z, methodCode: refineMethodByMaterial(z.methodCode, material) });
    }
  }

  if (zones.length === 0) return null;
  return {
    sourceId: 'midocean',
    externalId,
    material,
    zones,
  };
}

export function parseArt24ItemBlock(block: string): ParsedProductBranding | null {
  const externalId = extractTag(block, 'sku') || extractTag(block, 'id');
  if (!externalId) return null;

  const m = block.match(/<[^>]*name="Виды нанесений"[^>]*>([^<]*)</i);
  const raw = m?.[1]?.trim();
  if (!raw) return null;

  const zones = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((methodRaw) => zone({ methodRaw }));

  if (zones.length === 0) return null;
  return { sourceId: 'art24', externalId, material: null, zones };
}
