import { GenerationSnapshot } from './prompt-builder';

import {

  assignBrandColorsToProducts,

  buildPaletteComplianceNegative,

  colorizeProductDescription,

  formatBrandPalettePrompt,

  formatPerProductColorAssignments,

} from './brand-colors.util';

import { describeProductEn } from './product-visual-en.util';

import { buildLogoApplicationPrompt } from './product-logo-branding.util';



function describeProduct(name: string, productHex?: string): string {

  return colorizeProductDescription(

    describeProductEn(name) || `premium corporate ${name}`,

    productHex,

  );

}



function layoutHint(count: number): string {

  if (count === 2) return 'Two products side by side on dark studio surface.';

  if (count === 3) return 'Three products in balanced flat lay on dark desk.';

  if (count >= 4) {

    return 'Premium welcome pack flat lay: thermos or tall item back, notebook center, pen front, bag or box right.';

  }

  return 'Single hero product centered on dark studio surface.';

}



/** Один запрос: фотореалистичная сцена с точными товарами и вписанным логотипом */

export function buildAiRenderPrompt(

  snapshot: GenerationSnapshot & { userPrompt?: string },

  logoHint?: string,

) {

  const products = snapshot.productNames ?? [];

  const count = products.length;

  const assigned = assignBrandColorsToProducts(snapshot.colors, count);

  const items = products.map((n, i) => describeProduct(n, assigned[i])).join(', ');

  const palette = formatBrandPalettePrompt(snapshot.colors);

  const perProduct = formatPerProductColorAssignments(products, snapshot.colors);

  const brief = snapshot.userPrompt?.trim();

  const hasLogo = snapshot.hasLogo && Boolean(logoHint?.trim());



  const parts = [

    palette,

    perProduct,

    'Ultra photorealistic corporate merchandise product photography, 8k catalog shot.',

    `Exactly ${count} real physical products in one scene: ${items}.`,

    'Each product body in its assigned brand color — not all identical black when palette has chromatic colors.',

    layoutHint(count),

    'Studio background tinted by brand palette, natural shadows.',

  ];

  if (hasLogo) {

    parts.push(buildLogoApplicationPrompt(products, { hasLogo: true, logoHint }));

  } else {

    parts.push(

      'Products completely blank — no logos, no text, no prints, unbranded surfaces.',

    );

  }



  parts.push('No people, no hands, no watermarks, no captions, no extra objects.');

  if (brief) parts.push(`Mood: ${brief.slice(0, 80)}.`);



  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);

}



export function buildAiRenderNegative(snapshot: GenerationSnapshot) {

  const count = snapshot.productNames?.length ?? 0;

  const hasLogo = snapshot.hasLogo;



  const products = snapshot.productNames ?? [];

  const drinkware = products.some((n) => /кружк|стакан|термокруж|термос|бутылк|бамбуков/i.test(n));



  const parts = [

    `not ${count} items, wrong count, extra products, missing items,`,

    'flat vector, silhouette, clip art, cartoon, 2d,',

    'blurry, low quality, people, hands, white background, cluttered',

    buildPaletteComplianceNegative(snapshot.colors),

  ];



  if (drinkware) {

    parts.push(

      'disposable paper cup, plastic takeaway cup, coffee lid, single-use cup, fast-food cup,',

    );

  }



  const hasHoodie = products.some((n) => /худи/i.test(n));

  const hasSweatshirt = products.some((n) => /свитшот/i.test(n));

  const hasCap = products.some((n) => /кепк/i.test(n));

  const hasNotebook = products.some((n) => /блокнот|блок для/i.test(n));

  if (!hasHoodie && !hasSweatshirt) {

    parts.push('hoodie, sweatshirt, zip-up jacket, bomber jacket,');

  }

  if (!hasCap) parts.push('baseball cap,');

  if (!hasNotebook) parts.push('notebook, notepad,');



  if (hasLogo) {

    parts.unshift(

      'sticker logo, floating logo, pasted overlay, decal,',

      'wrong logo, fake branding, random text, watermark,',

      'deformed products,',

    );

  } else {

    parts.unshift('logo, branding, text, letters, watermark,');

  }



  return parts.join(' ');

}



/** @deprecated use buildAiRenderPrompt */

export function buildAiScenePrompt(

  snapshot: GenerationSnapshot & { userPrompt?: string },

) {

  return buildAiRenderPrompt(snapshot);

}



/** @deprecated use buildAiRenderPrompt */

export function buildAiBrandingPassPrompt(

  snapshot: GenerationSnapshot & { userPrompt?: string },

  logoHint: string,

) {

  return buildAiRenderPrompt(snapshot, logoHint);

}



/** @deprecated use buildAiRenderPrompt */

export function buildAiBrandedSinglePassPrompt(

  snapshot: GenerationSnapshot & { userPrompt?: string },

  logoHint: string,

) {

  return buildAiRenderPrompt(snapshot, logoHint);

}



/** @deprecated use buildAiRenderNegative */

export function buildAiSceneNegative(snapshot: GenerationSnapshot) {

  return buildAiRenderNegative({ ...snapshot, hasLogo: false });

}



/** @deprecated use buildAiRenderNegative */

export function buildAiBrandingNegative(snapshot: GenerationSnapshot) {

  return buildAiRenderNegative(snapshot);

}



/** @deprecated aliases */

export const buildAiStudioPrompt = buildAiScenePrompt;

export const buildAiStudioNegative = buildAiSceneNegative;

export const buildAiEnhancePrompt = buildAiBrandedSinglePassPrompt;

export const buildAiEnhanceNegative = buildAiBrandingNegative;


