import type { LogoSurface } from './logo-surface.util';

export type ImprintMethodCode =
  | 'PAD_PRINT'
  | 'SCREEN_PRINT_TEXTILE'
  | 'SCREEN_PRINT_HARD'
  | 'UV_PRINT'
  | 'LASER_ENGRAVING'
  | 'DECAL'
  | 'SUBLIMATION'
  | 'BLIND_DEBOSS'
  | 'FOIL_STAMP'
  | 'DTF_TRANSFER'
  | 'DOMING'
  | 'EMBROIDERY'
  | 'METAL_PLATE'
  | 'UNKNOWN';

/** full — CMYK; limited — до maxColors плашек; mono — один тон; foil — металлик; relief — бесцветный рельеф */
export type ImprintColorMode = 'full' | 'limited' | 'mono' | 'foil' | 'relief';

export interface ImprintMethod {
  code: ImprintMethodCode;
  labelRu: string;
  /** Как это физически выглядит — идёт прямо в image-промпт */
  physicsEn: string;
  colorMode: ImprintColorMode;
  /** null = полноцвет */
  maxColors: number | null;
  maxWidthMm: number | null;
  maxHeightMm: number | null;
  surfaces: LogoSurface[];
  /** Материалы, на которые метод ложится штатно (нижний регистр) */
  materialsRu: string[];
}

const ALL: ImprintMethod[] = [
  {
    code: 'PAD_PRINT',
    labelRu: 'Тампопечать',
    physicsEn:
      'a thin opaque ink layer transferred by a silicone pad; it conforms to curved and irregular hard surfaces, sits on top of the material with a barely perceptible edge, matte finish',
    colorMode: 'limited',
    maxColors: 4,
    maxWidthMm: 50,
    maxHeightMm: 50,
    surfaces: ['flat', 'cylinder'],
    materialsRu: ['пластик', 'металл', 'дерево', 'керамика', 'стекло', 'кожа'],
  },
  {
    code: 'SCREEN_PRINT_TEXTILE',
    labelRu: 'Шелкография по текстилю',
    physicsEn:
      'thick opaque ink pushed through a screen into the fabric weave; the print follows every fold and thread, slightly raised, matte, with visible textile texture through the ink',
    colorMode: 'limited',
    maxColors: 6,
    maxWidthMm: 297,
    maxHeightMm: 420,
    surfaces: ['fabric'],
    materialsRu: ['хлопок', 'текстиль', 'ткань', 'полиэстер'],
  },
  {
    code: 'SCREEN_PRINT_HARD',
    labelRu: 'Шелкография по твёрдому',
    physicsEn:
      'dense opaque screen ink on a hard surface, flat or wrapped around a cylinder, uniform solid color with crisp edges and a subtle raised feel',
    colorMode: 'limited',
    maxColors: 2,
    maxWidthMm: 200,
    maxHeightMm: 200,
    surfaces: ['flat', 'cylinder'],
    materialsRu: ['пластик', 'металл', 'стекло', 'керамика', 'бумага', 'картон'],
  },
  {
    code: 'UV_PRINT',
    labelRu: 'УФ-печать',
    physicsEn:
      'full-color CMYK inkjet cured by UV light, glossy, sits as a very thin lacquered film over the surface texture, photographic gradients preserved',
    colorMode: 'full',
    maxColors: null,
    maxWidthMm: 594,
    maxHeightMm: 841,
    surfaces: ['flat', 'cylinder'],
    materialsRu: ['пластик', 'металл', 'дерево', 'кожа', 'стекло', 'керамика'],
  },
  {
    code: 'LASER_ENGRAVING',
    labelRu: 'Лазерная гравировка',
    physicsEn:
      'a recessed mark burned into the material: no ink at all, the tone shift comes from the exposed sub-layer, edges catch a specular highlight and the groove casts a micro-shadow, always single tone',
    colorMode: 'mono',
    maxColors: 1,
    maxWidthMm: 25,
    maxHeightMm: 160,
    surfaces: ['flat', 'cylinder'],
    materialsRu: ['металл', 'дерево', 'кожа', 'пластик', 'бамбук'],
  },
  {
    code: 'DECAL',
    labelRu: 'Деколь',
    physicsEn:
      'a ceramic transfer fired into the glaze; the image is fused under a glossy vitreous surface, perfectly smooth to the touch, colors slightly softened by the glaze',
    colorMode: 'limited',
    maxColors: 8,
    maxWidthMm: 200,
    maxHeightMm: 100,
    surfaces: ['cylinder', 'flat'],
    materialsRu: ['керамика', 'фарфор', 'стекло'],
  },
  {
    code: 'SUBLIMATION',
    labelRu: 'Сублимация',
    physicsEn:
      'dye diffused into a white coated substrate; the image has no thickness whatsoever, the texture of the base material shows through completely, full photographic color',
    colorMode: 'full',
    maxColors: null,
    maxWidthMm: 450,
    maxHeightMm: 350,
    surfaces: ['fabric', 'flat', 'cylinder'],
    materialsRu: ['полиэстер', 'керамика', 'металл', 'текстиль'],
  },
  {
    code: 'BLIND_DEBOSS',
    labelRu: 'Блинтовое тиснение',
    physicsEn:
      'a colorless pressed relief: the mark is stamped INTO the material, no pigment at all, readable only through the shadow in the depression and the highlight on its rim',
    colorMode: 'relief',
    maxColors: null,
    maxWidthMm: 95,
    maxHeightMm: 95,
    surfaces: ['flat', 'fabric'],
    materialsRu: ['кожа', 'экокожа', 'картон', 'бумага'],
  },
  {
    code: 'FOIL_STAMP',
    labelRu: 'Тиснение фольгой',
    physicsEn:
      'metallized foil pressed into the material under heat: a mirror-bright gold or silver mark sitting in a shallow depression, strong specular reflection that shifts with the light',
    colorMode: 'foil',
    maxColors: 1,
    maxWidthMm: 95,
    maxHeightMm: 95,
    surfaces: ['flat', 'fabric'],
    materialsRu: ['кожа', 'экокожа', 'картон', 'бумага'],
  },
  {
    code: 'DTF_TRANSFER',
    labelRu: 'DTF / термотрансфер',
    physicsEn:
      'a full-color printed film heat-pressed onto fabric; it forms a thin continuous layer with a faint satin sheen and a slightly perceptible edge, the weave shows only as a gentle relief underneath',
    colorMode: 'full',
    maxColors: null,
    maxWidthMm: 300,
    maxHeightMm: 400,
    surfaces: ['fabric'],
    materialsRu: ['хлопок', 'текстиль', 'полиэстер', 'кожа'],
  },
  {
    code: 'DOMING',
    labelRu: 'Объёмная смола',
    physicsEn:
      'a printed label sealed under a clear polymer dome: a thick glossy 3D lens with rounded edges that magnifies the artwork and throws a bright specular hotspot',
    colorMode: 'full',
    maxColors: null,
    maxWidthMm: 50,
    maxHeightMm: 50,
    surfaces: ['flat'],
    materialsRu: ['пластик', 'металл'],
  },
  {
    code: 'EMBROIDERY',
    labelRu: 'Вышивка',
    physicsEn:
      'raised satin stitching in thread: individual glossy filaments run in a clear stitch direction, the mark stands proud of the fabric and casts its own soft shadow, fine details are simplified by the stitch',
    colorMode: 'limited',
    maxColors: 8,
    maxWidthMm: 100,
    maxHeightMm: 100,
    surfaces: ['fabric'],
    materialsRu: ['хлопок', 'текстиль', 'ткань', 'фетр'],
  },
  {
    code: 'METAL_PLATE',
    labelRu: 'Шильд',
    physicsEn:
      'a separate thin metal plate with the engraved mark, mechanically fixed onto the product surface, with its own bevelled edge, thickness and cast shadow',
    colorMode: 'mono',
    maxColors: 1,
    maxWidthMm: 60,
    maxHeightMm: 30,
    surfaces: ['flat'],
    materialsRu: ['дерево', 'кожа', 'пластик', 'металл'],
  },
  {
    code: 'UNKNOWN',
    labelRu: 'Неизвестный способ',
    physicsEn:
      'a factory-applied branding mark integrated into the product surface, following its curvature, material and lighting, never a flat pasted sticker',
    colorMode: 'limited',
    maxColors: null,
    maxWidthMm: null,
    maxHeightMm: null,
    surfaces: ['flat', 'cylinder', 'fabric'],
    materialsRu: [],
  },
];

export const IMPRINT_METHODS: Record<ImprintMethodCode, ImprintMethod> = Object.fromEntries(
  ALL.map((m) => [m.code, m]),
) as Record<ImprintMethodCode, ImprintMethod>;

export function getImprintMethod(code: ImprintMethodCode): ImprintMethod {
  return IMPRINT_METHODS[code] ?? IMPRINT_METHODS.UNKNOWN;
}

/**
 * Порядок проверок важен: «тиснение (фольга)» должно попасть в FOIL_STAMP раньше,
 * чем в BLIND_DEBOSS по слову «тиснение».
 */
const RULES: Array<{ re: RegExp; code: ImprintMethodCode }> = [
  { re: /шильд/i, code: 'METAL_PLATE' },
  { re: /гравиров|лазер/i, code: 'LASER_ENGRAVING' },
  { re: /тиснени.*(фольг|foil)|фольг/i, code: 'FOIL_STAMP' },
  { re: /блинтов|тиснени|дебосс|deboss/i, code: 'BLIND_DEBOSS' },
  { re: /тампопечат|тампон/i, code: 'PAD_PRINT' },
  { re: /вышивк/i, code: 'EMBROIDERY' },
  { re: /декол/i, code: 'DECAL' },
  { re: /сублимац/i, code: 'SUBLIMATION' },
  { re: /смол|дойминг|doming/i, code: 'DOMING' },
  { re: /dtf|термотрансфер|термоперенос|шелкотрансфер|трансфер/i, code: 'DTF_TRANSFER' },
  { re: /уф|uv/i, code: 'UV_PRINT' },
  { re: /шелкограф|шелкотрафарет|трафаретн|шелк/i, code: 'SCREEN_PRINT_HARD' },
];

export function normalizeMethodName(raw: string): ImprintMethodCode | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  for (const { re, code } of RULES) {
    if (re.test(s)) return code;
  }
  return null;
}
