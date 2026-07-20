import { readFile } from 'fs/promises';

const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46];
const PDF = [0x25, 0x50, 0x44, 0x46];

function startsWith(buf: Buffer, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  return sig.every((b, i) => buf[i] === b);
}

function detectImageFormat(buf: Buffer): 'png' | 'jpeg' | 'webp' | 'pdf' | null {
  if (startsWith(buf, PNG)) return 'png';
  if (startsWith(buf, JPEG)) return 'jpeg';
  if (startsWith(buf, WEBP_RIFF) && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (startsWith(buf, PDF)) return 'pdf';
  return null;
}

/** Проверка magic bytes после загрузки (не доверяем client mimetype / расширению) */
export async function validateUploadedImageFile(
  filePath: string,
  _ext: string,
): Promise<boolean> {
  const buf = await readFile(filePath);
  if (buf.length < 12) return false;
  return detectImageFormat(buf) !== null;
}

export function isSvgUploadAllowed(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ALLOW_SVG_UPLOAD === 'true';
}
