"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processRefineVisualizationJob = processRefineVisualizationJob;
exports.ensureInitialVisualizationVariant = ensureInitialVisualizationVariant;
const path_1 = require("path");
const fs_1 = require("fs");
const client_1 = require("@prisma/client");
const persist_result_image_util_1 = require("./persist-result-image.util");
const refine_visualization_prompt_1 = require("./refine-visualization.prompt");
const concept_result_util_1 = require("./concept-result.util");
const logo_reference_util_1 = require("./logo-reference.util");
function getUploadsDir() {
    return process.env.UPLOADS_DIR || (0, path_1.join)(process.cwd(), '../../uploads');
}
async function processRefineVisualizationJob(job, deps) {
    const { generationId, requestId, refinementBrief, sourceImageUrl: rawSourceUrl, chosenIdeaTitle: jobConceptTitle } = job.data;
    const sourceImageUrl = (0, logo_reference_util_1.normalizeAssetPath)(rawSourceUrl ?? '');
    if (!refinementBrief?.trim() || !sourceImageUrl) {
        throw new Error('Refine job missing refinementBrief or sourceImageUrl');
    }
    const generation = await deps.prisma.generation.findUniqueOrThrow({
        where: { id: generationId },
        include: { variants: { orderBy: { sortOrder: 'asc' } } },
    });
    const snapshot = generation.inputSnapshot;
    const productNames = snapshot.productNames ?? [];
    const hasLogo = Boolean(snapshot.hasLogo);
    const logoUrl = snapshot.logoUrl ?? null;
    const userPrompt = snapshot.userPrompt ?? '';
    const composition = typeof generation.llmOutput === 'object' &&
        generation.llmOutput &&
        'composition' in generation.llmOutput
        ? String(generation.llmOutput.composition ?? '')
        : '';
    await job.updateProgress(15);
    const generatedDir = (0, path_1.join)(getUploadsDir(), 'generated');
    if (!(0, fs_1.existsSync)(generatedDir))
        (0, fs_1.mkdirSync)(generatedDir, { recursive: true });
    const variantId = `${generationId}-ref-${Date.now()}`;
    const outputPath = (0, path_1.join)(generatedDir, `${variantId}.png`);
    const prompt = (0, refine_visualization_prompt_1.buildRefinementImagePrompt)({
        refinementBrief,
        userPrompt,
        composition,
        productNames,
        hasLogo,
        isCatalog: snapshot.aiStyle === 'catalog',
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
        hasLogo,
        logoUrl,
        generationMode: 'ai',
        aiStyle: snapshot.aiStyle ?? 'catalog',
        onProgress: async (pct) => {
            try {
                await job.updateProgress(Math.min(95, Math.max(35, pct)));
            }
            catch {
            }
        },
    });
    await job.updateProgress(92);
    const imageUrl = await (0, persist_result_image_util_1.persistGenerationResultImage)(outputPath, outputPath);
    const sortOrder = generation.variants.length > 0
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
    const chosenIdeaTitle = jobConceptTitle?.trim() ||
        snapshot.chosenIdeaTitle?.trim() ||
        '';
    const conceptResults = chosenIdeaTitle
        ? (0, concept_result_util_1.mergeConceptResult)(generation.conceptResults, {
            chosenIdeaTitle,
            resultImageUrl: imageUrl,
            productIds: snapshot.productIds ?? [],
            revision: Number(snapshot.revision) || 1,
            finishedAt: new Date(),
            refinementBrief,
            variantId: variant.id,
        })
        : undefined;
    await deps.prisma.generation.update({
        where: { id: generationId },
        data: {
            status: client_1.GenerationStatus.done,
            resultImageUrl: imageUrl,
            ...(conceptResults ? { conceptResults: conceptResults } : {}),
            finishedAt: new Date(),
        },
    });
    await deps.prisma.request.update({
        where: { id: requestId },
        data: { status: client_1.RequestStatus.done, generationLockedAt: null },
    });
    await job.updateProgress(100);
    deps.logger.log(`Refinement ${variantId} saved for generation ${generationId}`);
    return { variantId: variant.id, imageUrl };
}
async function ensureInitialVisualizationVariant(prisma, generationId, imageUrl, imagePrompt) {
    const count = await prisma.visualizationVariant.count({ where: { generationId } });
    if (count > 0)
        return;
    await prisma.visualizationVariant.create({
        data: {
            generationId,
            imageUrl,
            imagePrompt: imagePrompt?.slice(0, 500) ?? null,
            sortOrder: 0,
        },
    });
}
//# sourceMappingURL=refine-visualization.processor.js.map