import { mkdirSync, existsSync } from 'fs';

import { dirname } from 'path';

import sharp from 'sharp';



/** Студийная карточка товара из силуэта — для каталога и AI-мокапа */

export async function renderCatalogPhoto(opts: {

  silhouettePath: string;

  outputPath: string;

  productName: string;

}): Promise<void> {

  const card = 512;

  const productSize = 340;



  if (!existsSync(opts.silhouettePath)) {

    throw new Error(`Silhouette not found: ${opts.silhouettePath}`);

  }



  mkdirSync(dirname(opts.outputPath), { recursive: true });



  const bgSvg = `

    <svg width="${card}" height="${card}" xmlns="http://www.w3.org/2000/svg">

      <defs>

        <radialGradient id="bg" cx="50%" cy="42%" r="68%">

          <stop offset="0%" stop-color="#3d3d45"/>

          <stop offset="55%" stop-color="#242428"/>

          <stop offset="100%" stop-color="#121216"/>

        </radialGradient>

        <linearGradient id="floor" x1="0" y1="0.72" x2="0" y2="1">

          <stop offset="0%" stop-color="#ffffff" stop-opacity="0.04"/>

          <stop offset="100%" stop-color="#000000" stop-opacity="0.35"/>

        </linearGradient>

      </defs>

      <rect width="100%" height="100%" rx="24" fill="url(#bg)"/>

      <rect width="100%" height="100%" rx="24" fill="url(#floor)"/>

    </svg>

  `;



  const silhouette = await sharp(opts.silhouettePath)

    .resize(productSize, productSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })

    .png()

    .toBuffer();



  const meta = await sharp(silhouette).metadata();

  const w = meta.width ?? productSize;

  const h = meta.height ?? productSize;



  const productShape = await sharp({

    create: { width: w, height: h, channels: 4, background: { r: 235, g: 235, b: 238, alpha: 255 } },

  })

    .png()

    .composite([{ input: silhouette, blend: 'dest-in' }])

    .png()

    .toBuffer();



  const lightingSvg = `

    <svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">

      <defs>

        <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">

          <stop offset="0%" stop-color="white" stop-opacity="0.45"/>

          <stop offset="45%" stop-color="white" stop-opacity="0.08"/>

          <stop offset="100%" stop-color="white" stop-opacity="0"/>

        </linearGradient>

      </defs>

      <rect width="100%" height="100%" fill="url(#shine)"/>

    </svg>

  `;



  const productLit = await sharp(productShape)

    .composite([{ input: Buffer.from(lightingSvg), blend: 'overlay' }])

    .png()

    .toBuffer();



  const shadowSvg = `

    <svg width="${Math.round(w * 0.85)}" height="${Math.round(h * 0.12)}" xmlns="http://www.w3.org/2000/svg">

      <ellipse cx="50%" cy="50%" rx="50%" ry="50%" fill="black" fill-opacity="0.38"/>

    </svg>

  `;

  const shadow = await sharp(Buffer.from(shadowSvg)).blur(5).png().toBuffer();

  const shadowMeta = await sharp(shadow).metadata();



  const left = Math.round((card - w) / 2);

  const top = Math.round((card - h) / 2) - 12;

  const shadowLeft = left + Math.round((w - (shadowMeta.width ?? w)) / 2);

  const shadowTop = top + h - Math.round(h * 0.06);



  const label = opts.productName.slice(0, 28).replace(/[<>&]/g, '');

  const labelSvg = `

    <svg width="${card}" height="40" xmlns="http://www.w3.org/2000/svg">

      <text x="50%" y="26" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" fill="#c8c8d0">${label}</text>

    </svg>

  `;



  await sharp(Buffer.from(bgSvg))

    .composite([

      { input: shadow, left: shadowLeft, top: shadowTop, blend: 'over' },

      { input: productLit, left, top, blend: 'over' },

      { input: Buffer.from(labelSvg), left: 0, top: card - 44, blend: 'over' },

    ])

    .png()

    .toFile(opts.outputPath);

}


