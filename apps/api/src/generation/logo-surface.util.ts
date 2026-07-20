import sharp from 'sharp';

export type LogoSurface = 'fabric' | 'cylinder' | 'flat';

export function detectLogoSurface(productName: string): LogoSurface {
  const n = productName.toLowerCase();
  if (
    n.includes('кружк') ||
    n.includes('стакан') ||
    n.includes('термокруж') ||
    n.includes('термос') ||
    n.includes('бутылк')
  ) {
    return 'cylinder';
  }
  if (
    n.includes('футбол') ||
    n.includes('поло') ||
    n.includes('худи') ||
    n.includes('свитшот') ||
    n.includes('кепк') ||
    n.includes('бини') ||
    n.includes('шарф') ||
    n.includes('носок') ||
    n.includes('мешок') ||
    n.includes('шоппер') ||
    n.includes('сумк') ||
    n.includes('рюкзак')
  ) {
    return 'fabric';
  }
  return 'flat';
}

function knockOutLogoBackground(data: Buffer, ch: number): void {
  for (let i = 0; i < data.length; i += ch) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const spread = Math.max(r, g, b) - Math.min(r, g, b);

    // Белый / светло-серый однородный фон.
    // Тёмные пиксели НЕ удаляем: это может быть сам чёрный/тёмный логотип.
    if (lum > 242 && spread < 22) {
      data[i + 3] = 0;
      continue;
    }
    if (lum > 228 && spread < 35) {
      data[i + 3] = Math.min(a, Math.round((255 - lum) * 5));
      continue;
    }
    if (lum > 200 && spread < 18) {
      data[i + 3] = Math.min(a, Math.round((228 - lum) * 4));
    }
  }
}

/** Убирает в основном светлый однородный фон, сохраняя тёмные элементы логотипа */
export async function prepareLogoForeground(logoPath: string, maxSide: number): Promise<Buffer> {
  const { data, info } = await sharp(logoPath)
    .resize(maxSide, maxSide, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const ch = info.channels;
  knockOutLogoBackground(data, ch);

  const knocked = await sharp(data, { raw: { width: info.width, height: info.height, channels: ch } })
    .png()
    .toBuffer();

  try {
    return await sharp(knocked).trim({ threshold: 8 }).png().toBuffer();
  } catch {
    return knocked;
  }
}

/** Лёгкая деформация под форму предмета */
export async function warpLogoForSurface(logoPng: Buffer, surface: LogoSurface): Promise<Buffer> {
  const meta = await sharp(logoPng).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;

  if (surface === 'cylinder') {
    const narrowW = Math.max(8, Math.round(w * 0.86));
    const pad = Math.round((w - narrowW) / 2);
    return sharp(logoPng)
      .resize(narrowW, h, { fit: 'fill' })
      .extend({
        left: pad,
        right: w - narrowW - pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  if (surface === 'fabric') {
    return sharp(logoPng)
      .resize(w, Math.max(8, Math.round(h * 0.94)), { fit: 'fill' })
      .png()
      .toBuffer();
  }

  return logoPng;
}

/** Тень/блик только по контуру знака — без квадрата от прозрачного фона */
async function buildPrintAccent(logoPng: Buffer, surface: LogoSurface): Promise<Buffer> {
  const meta = await sharp(logoPng).metadata();
  const w = meta.width ?? 1;
  const h = meta.height ?? 1;
  const blurred = await sharp(logoPng)
    .greyscale()
    .modulate({ brightness: surface === 'fabric' ? 0.55 : 0.38 })
    .blur(surface === 'fabric' ? 0.5 : surface === 'cylinder' ? 1.1 : 0.85)
    .png()
    .toBuffer();

  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([
      { input: blurred, blend: 'over' },
      { input: logoPng, blend: 'dest-in' },
    ])
    .png()
    .toBuffer();
}

export async function buildSurfacePrintLayer(
  logoPath: string,
  maxSide: number,
  surface: LogoSurface,
): Promise<Buffer> {
  const fg = await prepareLogoForeground(logoPath, maxSide);
  return warpLogoForSurface(fg, surface);
}

/** Вписывает логотип в вырезанный фрагмент сцены — один слой с альфой, без дублей */
export async function blendLogoIntoPatch(
  patchBuf: Buffer,
  logoPng: Buffer,
  surface: LogoSurface,
): Promise<Buffer> {
  const patchMeta = await sharp(patchBuf).metadata();
  const pw = patchMeta.width ?? 1;
  const ph = patchMeta.height ?? 1;

  const logoMeta = await sharp(logoPng).metadata();
  const lw = logoMeta.width ?? 1;
  const lh = logoMeta.height ?? 1;
  const left = Math.max(0, Math.round((pw - lw) / 2));
  const top = Math.max(0, Math.round((ph - lh) / 2));

  const logoBlend =
    surface === 'fabric' ? 'multiply' : surface === 'cylinder' ? 'soft-light' : 'multiply';
  const logoOpacity =
    surface === 'fabric' ? 0.58 : surface === 'cylinder' ? 0.66 : 0.72;
  const blurSigma = surface === 'fabric' ? 0.45 : surface === 'cylinder' ? 0.3 : 0;
  let mainLogoPipeline = sharp(logoPng);
  if (blurSigma >= 0.3) {
    mainLogoPipeline = mainLogoPipeline.blur(blurSigma);
  }
  const mainLogo = await mainLogoPipeline
    .modulate({ brightness: surface === 'fabric' ? 0.9 : 0.96 })
    .ensureAlpha()
    .linear([1, 1, 1, logoOpacity], [0, 0, 0, 0])
    .png()
    .toBuffer();

  const composites: sharp.OverlayOptions[] = [
    { input: mainLogo, left, top, blend: logoBlend },
  ];

  if (surface === 'fabric' || surface === 'cylinder') {
    const accentOpacity = surface === 'fabric' ? 0.34 : 0.24;
    const accent = await sharp(await buildPrintAccent(logoPng, surface))
      .ensureAlpha()
      .linear([1, 1, 1, accentOpacity], [0, 0, 0, 0])
      .png()
      .toBuffer();
    composites.unshift({
      input: accent,
      left: left + 1,
      top: top + 1,
      blend: 'multiply',
    });
  }

  return sharp(patchBuf).composite(composites).png().toBuffer();
}
