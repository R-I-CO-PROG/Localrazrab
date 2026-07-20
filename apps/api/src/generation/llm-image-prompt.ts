import { LlmGenerationOutput } from '../providers/llm/llm.interface';
import { GenerationSnapshot } from './prompt-builder';
import { buildAiRenderPrompt, buildAiRenderNegative } from './ai-enhance.prompt';
import {
  enforceBrandColorsInPrompt,
  formatBrandPalettePrompt,
  formatPerProductColorAssignments,
} from './brand-colors.util';
import {
  buildCatalogAiLogoReferencePrompt,
  buildCreativeLogoApplicationPrompt,
  buildLogoApplicationPrompt,
  CATALOG_LOGO_INTEGRATION_FOOTER,
  CATALOG_LOGO_NEGATIVE_PROMPT,
  stripBlankLogoPhrases,
} from './product-logo-branding.util';
import {
  CREATIVE_MERCH_NEGATIVE_EXTRA,
  CREATIVE_MERCH_SCENE_GUARDRAILS,
  formatCreativeProductList,
} from './creative-merch-visual.util';
import type { IdeatorItem } from '../agents/contracts';

/** AI-режим: LLM image_prompt + обязательная палитра брифа */
export function buildAiImagePrompt(
  llmOutput: LlmGenerationOutput,
  snapshot: GenerationSnapshot & { userPrompt?: string },
  logoHint?: string,
  usedRealLlm = false,
): string {
  const count = snapshot.productNames?.length ?? llmOutput.items.length;

  const names = snapshot.productNames ?? llmOutput.items ?? [];
  const palette = formatBrandPalettePrompt(snapshot.colors);

  let core: string;
  if (usedRealLlm && llmOutput.image_prompt?.trim().length > 40) {
    const sanitized = snapshot.hasLogo
      ? stripBlankLogoPhrases(llmOutput.image_prompt.trim())
      : llmOutput.image_prompt.trim();
    core = enforceBrandColorsInPrompt(sanitized, snapshot.colors, names);
  } else {
    core = buildAiRenderPrompt(snapshot, logoHint);
  }

  const perProduct = formatPerProductColorAssignments(names, snapshot.colors);
  const parts = [palette, perProduct, core];
  if (snapshot.hasLogo) {
    parts.push(
      buildLogoApplicationPrompt(names, { hasLogo: true, logoHint: logoHint || undefined }),
    );
  }
  parts.push(`Exactly ${count} products, no extra objects.`);

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 1200);
}

/** Креативный режим: LLM image_prompt + палитра + обязательный логотип с референса */
export function buildCreativeAiImagePrompt(
  llmOutput: LlmGenerationOutput,
  snapshot: GenerationSnapshot & { userPrompt?: string },
  logoHint?: string,
  usedRealLlm = false,
  sceneBrief?: string,
  options?: { deferLogoToPostComposite?: boolean; conceptItems?: IdeatorItem[] },
): string {
  const deferLogo = Boolean(options?.deferLogoToPostComposite);
  const includeLogo = snapshot.hasLogo && !deferLogo;
  const palette = formatBrandPalettePrompt(snapshot.colors, { creative: true });
  const conceptItems = options?.conceptItems ?? [];
  const productList = formatCreativeProductList(conceptItems);
  const productNamesFromSnapshot = snapshot.productNames?.filter(Boolean) ?? [];
  const productLine =
    productList ||
    (productNamesFromSnapshot.length > 0
      ? `Exactly ${productNamesFromSnapshot.length} physical branded products in frame: ${productNamesFromSnapshot.join('; ')}.`
      : '');

  let core = llmOutput.image_prompt?.trim() ?? '';
  if (usedRealLlm && core.length > 40) {
    core = snapshot.hasLogo ? stripBlankLogoPhrases(core) : core;
  } else if (snapshot.userPrompt?.trim()) {
    core = [
      'Ultra photorealistic corporate merch product photograph, 8k studio quality.',
      productLine,
      palette,
    ]
      .filter(Boolean)
      .join(' ');
  }

  // ПОЖЕЛАНИЕ ПОЛЬЗОВАТЕЛЯ К ФОНУ/СЦЕНЕ — авторитетно и В НАЧАЛЕ (переживает лимит 2400, не
  // жертвует лого-блоками в хвосте). Форвард-референс перебивает и guardrails, и LLM-интерьер в
  // core. Раньше это была слабая приписка «follow as ADDITIONAL creative direction», проигрывавшая.
  const sceneOverride = sceneBrief?.trim()
    ? `USER BACKGROUND & SCENE OVERRIDE — HIGHEST PRIORITY (applies to the setting only): ${sceneBrief.trim().slice(0, 400)}. ` +
      `The background, surface and setting MUST be exactly this and OVERRIDE any other background, surface, interior or scene mentioned anywhere else below. ` +
      `Keep every product identical — change ONLY the background/scene.`
    : '';

  // При явном переопределении сцены укорачиваем core (это и есть перебиваемая LLM-сцена/интерьер):
  // освобождает место под добавленный в начало override, чтобы лого-блоки в хвосте не ушли за 2400.
  const coreForParts = sceneOverride ? core.slice(0, 700) : core;
  const parts = [sceneOverride, CREATIVE_MERCH_SCENE_GUARDRAILS, palette, productLine, coreForParts];

  if (includeLogo) {
    const names = productNamesFromSnapshot.length
      ? productNamesFromSnapshot
      : conceptItems.map((i) => i.notes || i.productType);
    if (names.length > 0) {
      parts.push(
        buildCatalogAiLogoReferencePrompt(names, {
          logoHint: logoHint || undefined,
          refLayout: 'logo-only',
        }),
      );
      parts.push(buildLogoApplicationPrompt(names, { hasLogo: true, logoHint: logoHint || undefined }));
      parts.push(CATALOG_LOGO_INTEGRATION_FOOTER);
    } else {
      parts.push(buildCreativeLogoApplicationPrompt(logoHint));
    }
  } else if (deferLogo) {
    parts.push(
      'All branded objects must have clean blank surfaces without any logos, text or branding marks.',
    );
  }
  if (includeLogo) {
    parts.push(
      'Client logo from reference image ONLY — integrate on each product surface; NEVER invent a different emblem, cube icon, or paste reference as floating overlay.',
    );
  }
  parts.push('No watermarks, no extra text overlays unless part of the logo.');
  parts.push(
    'FORBIDDEN in frame: taxis, cars, streets, traffic, office interiors, people — only the merch products listed above.',
  );

  // Лимит 3000 (было 2400): провайдер длину не режет; при override core укорочен до 700, так что
  // лого-блоки в хвосте помещаются с запасом.
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
}

export function buildCreativeAiNegativePrompt(
  llmOutput: LlmGenerationOutput,
  snapshot: GenerationSnapshot,
  usedRealLlm = false,
  options?: { deferLogoToPostComposite?: boolean },
): string {
  const deferLogo = Boolean(options?.deferLogoToPostComposite);
  const includeLogo = snapshot.hasLogo && !deferLogo;
  if (usedRealLlm && llmOutput.negative_prompt?.trim()) {
    const base = llmOutput.negative_prompt.trim();
    if (includeLogo) {
      return `${base}, ${CATALOG_LOGO_NEGATIVE_PROMPT}`;
    }
    if (deferLogo) {
      return `${base}, any logos on products, branding marks, printed emblems, stickers`;
    }
    return base;
  }
  const parts = [
    'blurry, low quality, watermark, text overlay, distorted logo, sticker overlay, cartoon, clip art',
    CREATIVE_MERCH_NEGATIVE_EXTRA,
  ];
  if (includeLogo) {
    parts.unshift(CATALOG_LOGO_NEGATIVE_PROMPT);
  } else if (deferLogo) {
    parts.unshift('any logos on products, branding marks, printed emblems, stickers,');
  }
  return parts.join(' ');
}

export function buildAiNegativePrompt(
  llmOutput: LlmGenerationOutput,
  snapshot: GenerationSnapshot,
  usedRealLlm = false,
): string {
  if (usedRealLlm && llmOutput.negative_prompt?.trim()) {
    return llmOutput.negative_prompt.trim();
  }
  return buildAiRenderNegative(snapshot);
}
