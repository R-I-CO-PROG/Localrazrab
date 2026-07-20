import { Job } from 'bullmq';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OpenrouterImageProvider } from '../providers/image/openrouter-image.provider';
import { GenerationJobData } from './generation.queue';
import { GenerationStatus, RequestStatus } from '@prisma/client';
import { persistGenerationResultImage } from './persist-result-image.util';
import { buildRefinementImagePrompt } from './refine-visualization.prompt';
import { mergeConceptResult } from './concept-result.util';
import { normalizeAssetPath } from './logo-reference.util';

function getUploadsDir() {
  return process.env.UPLOADS_DIR || join(process.cwd(), '../../uploads');
}

export async function processRefineVisualizationJob(
  job: Job<GenerationJobData>,
  deps: {
    prisma: PrismaService;
    openrouter: OpenrouterImageProvider;
    logger: Logger;
  },
): Promise<{ variantId: string; imageUrl: string }> {
  const { generationId, requestId, refinementBrief, sourceImageUrl: rawSourceUrl, chosenIdeaTitle: jobConceptTitle } =
    job.data;
  const sourceImageUrl = normalizeAssetPath(rawSourceUrl ?? '');
  if (!refinementBrief?.trim() || !sourceImageUrl) {
    throw new Error('Refine job missing refinementBrief or sourceImageUrl');
  }

  const generation = await deps.prisma.generation.findUniqueOrThrow({
    where: { id: generationId },
    include: { variants: { orderBy: { sortOrder: 'asc' } } },
  });
  const snapshot = generation.inputSnapshot as Record<string, unknown>;
  const productNames = (snapshot.productNames as string[]) ?? [];
  const hasLogo = Boolean(snapshot.hasLogo);
  const logoUrl = (snapshot.logoUrl as string) ?? null;
  const userPrompt = (snapshot.userPrompt as string) ?? '';
  const composition =
    typeof generation.llmOutput === 'object' &&
    generation.llmOutput &&
    'composition' in generation.llmOutput
      ? String((generation.llmOutput as { composition?: string }).composition ?? '')
      : '';

  await job.updateProgress(15);

  const generatedDir = join(getUploadsDir(), 'generated');
  if (!existsSync(generatedDir)) mkdirSync(generatedDir, { recursive: true });

  const variantId = `${generationId}-ref-${Date.now()}`;
  const outputPath = join(generatedDir, `${variantId}.png`);

  // «Пересоздать» (без точечной правки) → полностью новая композиция. Точечные слова
  // («сделай кружку красной», «добавь…») оставляем как conservative-edit.
  const briefLower = refinementBrief.toLowerCase();
  const wantsNewComposition =
    /перегенер|пересозда|заново|друг(ой|ое|ая|ому)|по-?друг|обнови|вариант|друга\w*\s+сцен|regenerate|another|new\s+(look|variant|version|scene)|variation/i.test(
      briefLower,
    ) || refinementBrief.trim().length < 12;
  const catalogImageUrls = ((snapshot.catalogImageUrls as string[]) ?? []).filter(Boolean);
  const variationSeed = generation.variants.length;

  const prompt = buildRefinementImagePrompt({
    refinementBrief,
    userPrompt,
    composition,
    productNames,
    hasLogo,
    isCatalog: (snapshot.aiStyle as string) === 'catalog',
    wantsNewComposition,
    variationIndex: variationSeed,
  });

  await job.updateProgress(30);

  await deps.openrouter.generateRefinement({
    prompt,
    negativePrompt: '',
    outputPath,
    sourceSceneUrl: sourceImageUrl,
    refinementBrief,
    userPrompt,
    llmComposition: composition,
    productNames,
    catalogImageUrls,
    wantsNewComposition,
    variationSeed,
    hasLogo,
    logoUrl,
    generationMode: 'ai',
    aiStyle: (snapshot.aiStyle as 'catalog' | 'creative') ?? 'catalog',
    onProgress: async (pct) => {
      try {
        await job.updateProgress(Math.min(95, Math.max(35, pct)));
      } catch {
        /* ignore */
      }
    },
  });

  await job.updateProgress(92);

  const imageUrl = await persistGenerationResultImage(outputPath, outputPath);
  const sortOrder =
    generation.variants.length > 0
      ? Math.max(...generation.variants.map((v) => v.sortOrder)) + 1
      : 1;

  const variant = await deps.prisma.visualizationVariant.create({
    data: {
      id: variantId,
      generationId,
      imageUrl,
      refinementBrief,
      imagePrompt: prompt,
      sortOrder,
    },
  });

  const chosenIdeaTitle =
    jobConceptTitle?.trim() ||
    (snapshot.chosenIdeaTitle as string | null)?.trim() ||
    '';
  const conceptResults = chosenIdeaTitle
    ? mergeConceptResult(generation.conceptResults, {
        chosenIdeaTitle,
        resultImageUrl: imageUrl,
        productIds: (snapshot.productIds as string[]) ?? [],
        revision: Number(snapshot.revision) || 1,
        finishedAt: new Date(),
        refinementBrief,
        variantId: variant.id,
      })
    : undefined;

  await deps.prisma.generation.update({
    where: { id: generationId },
    data: {
      status: GenerationStatus.done,
      resultImageUrl: imageUrl,
      ...(conceptResults ? { conceptResults: conceptResults as object } : {}),
      finishedAt: new Date(),
    },
  });

  await deps.prisma.request.update({
    where: { id: requestId },
    data: { status: RequestStatus.done, generationLockedAt: null },
  });

  await job.updateProgress(100);
  deps.logger.log(`Refinement ${variantId} saved for generation ${generationId}`);

  return { variantId: variant.id, imageUrl };
}

export async function ensureInitialVisualizationVariant(
  prisma: PrismaService,
  generationId: string,
  imageUrl: string,
  imagePrompt?: string | null,
): Promise<void> {
  const count = await prisma.visualizationVariant.count({ where: { generationId } });
  if (count > 0) return;

  await prisma.visualizationVariant.create({
    data: {
      generationId,
      imageUrl,
      imagePrompt: imagePrompt?.slice(0, 500) ?? null,
      sortOrder: 0,
    },
  });
}
