import sharp from 'sharp';
import { prepareLogoForeground } from '../generation/logo-surface.util';
import { getImprintMethod, type ImprintMethodCode } from '../generation/imprint-methods';

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const FONTS: Record<string, string> = {
  sans: 'DejaVu Sans, Arial, sans-serif',
  serif: 'DejaVu Serif, Georgia, serif',
  mono: 'DejaVu Sans Mono, monospace',
};

const FALLBACK_COLOR = '#000000';
/** #rgb / #rrggbb / #rrggbbaa, или короткое имя CSS-цвета (lowercase). Ничего больше — это attribute-контекст SVG, который рендерит librsvg. */
const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const NAMED_COLOR_RE = /^[a-z]{3,20}$/;

/**
 * Аллоулист для значения, которое подставляется в атрибут SVG без дальнейшего экранирования.
 * Экранирование текстовых узлов (escapeXml) не защищает атрибуты — там достаточно закрывающей
 * кавычки, чтобы вырваться из fill="..." и внедрить произвольный SVG (в т.ч. <image href> → SSRF).
 * Поэтому здесь не экранируем, а строго проверяем по формату и иначе откатываемся на дефолт.
 */
export function sanitizeColorHex(colorHex: string | undefined | null): string {
  const trimmed = colorHex?.trim();
  if (!trimmed) return FALLBACK_COLOR;
  if (HEX_COLOR_RE.test(trimmed) || NAMED_COLOR_RE.test(trimmed)) return trimmed;
  return FALLBACK_COLOR;
}

export async function renderTextToPng(
  text: string,
  opts: { colorHex: string; font?: string; fontSize?: number },
): Promise<Buffer> {
  const clean = text?.trim();
  if (!clean) throw new Error('Текст нанесения пуст');

  const fontSize = opts.fontSize ?? 96;
  const family = FONTS[opts.font ?? 'sans'] ?? FONTS.sans;
  const safeColor = sanitizeColorHex(opts.colorHex);
  const width = Math.max(64, Math.round(clean.length * fontSize * 0.62));
  const height = Math.round(fontSize * 1.4);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle"
          font-family="${family}" font-size="${fontSize}" font-weight="700"
          fill="${safeColor}">${escapeXml(clean)}</text>
  </svg>`;

  return sharp(Buffer.from(svg)).ensureAlpha().png().toBuffer();
}

/** Приводит арт к цветовой семантике метода: лазер — монохром, тиснение — рельеф без пигмента */
export async function conformArtToMethod(artPng: Buffer, methodCode: ImprintMethodCode): Promise<Buffer> {
  const mode = getImprintMethod(methodCode).colorMode;
  if (mode === 'mono' || mode === 'relief') {
    return sharp(artPng).greyscale().png().toBuffer();
  }
  if (mode === 'foil') {
    return sharp(artPng).greyscale().modulate({ brightness: 1.15 }).png().toBuffer();
  }
  return artPng;
}

export async function loadLogoArt(logoPath: string, maxSide = 1024): Promise<Buffer> {
  return prepareLogoForeground(logoPath, maxSide);
}
