import { join, sep } from 'path';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import sharp from 'sharp';
import { prepareLogoForeground } from './logo-surface.util';

function getUploadsDir() {
  return process.env.UPLOADS_DIR || join(process.cwd(), '../../uploads');
}

function getCatalogHandoffDir() {
  return process.env.CATALOG_HANDOFF_DIR || join(process.cwd(), '../../data/catalog-handoff-full');
}

export function resolveUploadPath(url: string) {
  return join(getUploadsDir(), url.replace(/^\/uploads\/?/, ''));
}

/** Локальный путь к файлу каталога (/catalog-handoff/...) или uploads */
export function resolveCatalogAssetPath(url: string): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/catalog-handoff/')) {
    const rel = trimmed.replace(/^\/catalog-handoff\/?/, '').replace(/\//g, sep);
    return join(getCatalogHandoffDir(), rel);
  }
  if (trimmed.startsWith('/uploads/')) {
    return resolveUploadPath(trimmed);
  }
  return null;
}

export async function loadImageBase64(filePath: string): Promise<string | null> {
  if (!existsSync(filePath)) return null;
  const buf = await readFile(filePath);
  return buf.toString('base64');
}

export async function loadLogoBase64(logoUrl: string, maxSide = 512): Promise<string | null> {
  const path = resolveUploadPath(logoUrl);
  if (!existsSync(path)) return null;
  try {
    const buf = await prepareLogoForeground(path, maxSide);
    return buf.toString('base64');
  } catch {
    return loadImageBase64(path);
  }
}

/** Data URI для провайдеров с base64 image input (фон вырезан — без белого квадрата) */
export async function loadLogoDataUri(logoUrl: string, maxSide = 512): Promise<string | null> {
  const path = resolveUploadPath(logoUrl);
  if (!existsSync(path)) return null;
  try {
    const buf = await prepareLogoForeground(path, maxSide);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch {
    const base64 = await loadImageBase64(path);
    if (!base64) return null;
    const ext = path.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/png';
    return `data:${mime};base64,${base64}`;
  }
}

export function resolvePublicAssetUrl(
  assetPath: string,
  publicApiUrl: string,
): string | null {
  const trimmed = assetPath?.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.split('?')[0].split('#')[0];
  }
  const base = publicApiUrl.replace(/\/$/, '');
  if (!base) return null;
  const normalized = normalizeAssetPath(trimmed);
  const path = normalized.startsWith('/') ? normalized : `/${normalized}`;
  return `${base}${path}`;
}

async function fetchRemoteImageDataUri(url: string, maxSide: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { Accept: 'image/*' },
    });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (!contentType.includes('image') && !/\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) {
      return null;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 64) return null;
    const out = await sharp(buf)
      .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString('base64')}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Локальный файл, /uploads, /catalog-handoff или публичный https — в data URI для OpenRouter */
export async function loadImageDataUriFromUrl(
  imageUrl: string,
  maxSide = 768,
): Promise<string | null> {
  const trimmed = imageUrl?.trim();
  if (!trimmed) return null;

  const local = await loadCatalogImageDataUri(trimmed, maxSide);
  if (local) return local;

  if (/^https?:\/\//i.test(trimmed)) {
    return fetchRemoteImageDataUri(trimmed.split('?')[0].split('#')[0], maxSide);
  }

  return null;
}

/** /uploads/... или полный URL → локальный путь для API */
export function normalizeAssetPath(url: string): string {
  const trimmed = url?.trim() ?? '';
  if (!trimmed) return '';
  const withoutQuery = trimmed.split('?')[0].split('#')[0];
  if (withoutQuery.startsWith('http://') || withoutQuery.startsWith('https://')) {
    try {
      return new URL(withoutQuery).pathname;
    } catch {
      return withoutQuery;
    }
  }
  return withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`;
}

/** Data URI фото товара из каталога (для Gemini reference) */
export async function loadCatalogImageDataUri(
  imageUrl: string,
  maxSide = 768,
): Promise<string | null> {
  const path = resolveCatalogAssetPath(imageUrl);
  if (!path || !existsSync(path)) return null;

  try {
    const buf = await sharp(path)
      .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${buf.toString('base64')}`;
  } catch {
    const base64 = await loadImageBase64(path);
    if (!base64) return null;
    const ext = path.split('.').pop()?.toLowerCase();
    const mime =
      ext === 'jpg' || ext === 'jpeg'
        ? 'image/jpeg'
        : ext === 'webp'
          ? 'image/webp'
          : 'image/png';
    return `data:${mime};base64,${base64}`;
  }
}

/** Краткое описание логотипа для промпта (цвета, форма) */
export async function describeLogoForPrompt(logoUrl: string): Promise<string> {
  const path = resolveUploadPath(logoUrl);
  if (!existsSync(path)) return 'company logo from reference image';

  try {
    const { data, info } = await sharp(path)
      .resize(64, 64, { fit: 'inside' })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const channels = info.channels ?? 3;
    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let count = 0;

    for (let i = 0; i < data.length; i += channels) {
      const a = channels === 4 ? data[i + 3] : 255;
      if (a < 32) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (lum > 235 && spread < 30) continue;
      rSum += r;
      gSum += g;
      bSum += b;
      count++;
    }

    if (count === 0) return 'company logo from reference image';

    const meta = await sharp(path).metadata();
    const aspect = (meta.width ?? 1) / (meta.height ?? 1);
    const shape = aspect > 1.2 ? 'horizontal' : aspect < 0.85 ? 'vertical' : 'square or circular';

    return `${shape} company logo mark — reproduce exact design from reference image only`;
  } catch {
    return 'company logo from reference image';
  }
}
