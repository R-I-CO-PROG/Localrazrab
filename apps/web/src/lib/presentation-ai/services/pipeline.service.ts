import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import type { GeneratedPresentation, PresentationGenerationInput, ProductInput } from "../types";
import { getSimpleWhitePresentationTheme } from "../simple-white-theme";
import { analyzeBrand } from "./brand-analysis.service";
import { generatePresentationConcept } from "./concept.service";
import { generateClosingCopy, generateProductStories } from "./copywriting.service";
import {
  buildSlidesFromConcept,
  generateSlideImages,
} from "./image-generation.service";
import { mergeConceptWithStructure } from "./slide-structure.service";
import { createInitialJob, loadJob, saveJob, updateJob } from "../storage/job-store";
import { renderHtmlDeck } from "../renderer/html-deck";
import { renderSlidesToPdf } from "../renderer/html-to-pdf";
import { generatePremiumPptxBuffer } from "../renderer/slide-compositor";
import {
  addSlideVariant,
  applyVariantToSlide,
  ensureSlideVariants,
  initializeSlidesVariants,
  toSlideSnapshot,
} from "./slide-version.util";
import { refineSlideCopy } from "./slide-regenerate.service";

function uploadsDir() {
  return process.env.UPLOADS_DIR || join(process.cwd(), "../../uploads");
}

async function exportOutputs(
  presentation: GeneratedPresentation,
  input: PresentationGenerationInput,
): Promise<GeneratedPresentation["outputs"]> {
  const outputs: GeneratedPresentation["outputs"] = {};
  const formats = input.outputFormats ?? ["pptx", "html"];
  const dir = join(uploadsDir(), "presentations", "ai", presentation.id);
  await mkdir(dir, { recursive: true });
  const safeName = presentation.title.replace(/[^\wа-яА-Я\d_-]+/gi, "_").slice(0, 60);

  if (formats.includes("html")) {
    const html = renderHtmlDeck({
      presentation,
      logoUrl: input.brand.logoUrl,
    });
    const htmlName = `${safeName}.html`;
    await writeFile(join(dir, htmlName), html, "utf-8");
    outputs.htmlUrl = `/uploads/presentations/ai/${presentation.id}/${htmlName}`;
  }

  if (formats.includes("pptx")) {
    const buffer = await generatePremiumPptxBuffer({
      title: presentation.title,
      slides: presentation.slides,
      theme: presentation.theme,
      logoUrl: input.brand.logoUrl,
      brandName: input.brand.name,
      brandWebsite: input.brand.website,
    });
    const pptxName = `${safeName}.pptx`;
    await writeFile(join(dir, pptxName), buffer);
    outputs.pptxUrl = `/uploads/presentations/ai/${presentation.id}/${pptxName}`;
  }

  if (formats.includes("pdf")) {
    try {
      const pdfBuffer = await renderSlidesToPdf(presentation.slides, presentation.theme);
      const pdfName = `${safeName}.pdf`;
      await writeFile(join(dir, pdfName), pdfBuffer);
      outputs.pdfUrl = `/uploads/presentations/ai/${presentation.id}/${pdfName}`;
    } catch (error) {
      console.error("[presentation-ai/pdf-export]", error);
      outputs.pdfUrl = outputs.pptxUrl ?? outputs.htmlUrl;
    }
  }

  return outputs;
}

async function reexportPresentation(
  job: GeneratedPresentation,
  input: PresentationGenerationInput,
): Promise<GeneratedPresentation["outputs"]> {
  return exportOutputs(job, input);
}

function buildPipelineInputFromJob(job: GeneratedPresentation): PresentationGenerationInput {
  return {
    brand: job.brand,
    products: job.products ?? [],
    quality: "draft",
    stylePreset: "corporate_light",
    language: job.language,
    outputFormats: ["pptx", "html", "pdf"],
    visualizationIds: job.visualizationIds,
    visualizationImages: job.visualizationImages,
  };
}

export async function runPresentationPipeline(
  presentationId: string,
  input: PresentationGenerationInput,
): Promise<void> {
  let aiCalls = 0;

  const setStatus = async (
    status: GeneratedPresentation["status"],
    progress: number,
    progressMessage?: string,
    patch?: Partial<GeneratedPresentation>,
  ) => {
    await updateJob(presentationId, { status, progress, progressMessage, ...patch });
  };

  try {
    const effectiveQuality = "draft" as const;
    const pipelineInput: PresentationGenerationInput = {
      ...input,
      quality: effectiveQuality,
      stylePreset: "corporate_light",
    };

    await setStatus("analyzing_brand", 10, "Анализ бренда...");
    const brandAnalysis = await analyzeBrand({
      brand: input.brand,
      stylePreset: "corporate_light",
      occasion: input.occasion,
      language: input.language,
    });
    aiCalls += 1;
    const theme = getSimpleWhitePresentationTheme();

    await setStatus("generating_concept", 25, "Генерация концепции...");
    const concept = await generatePresentationConcept({
      brandAnalysis,
      products: input.products,
      occasion: input.occasion,
      audience: input.audience,
      slideCount: input.slideCount,
      quality: effectiveQuality,
      language: input.language,
    });
    aiCalls += 1;

    const slideOutlines = mergeConceptWithStructure(concept, input.products);

    await setStatus("generating_copy", 40, "Копирайтинг товаров...");
    const productStories = await generateProductStories({
      brandAnalysis,
      products: input.products,
      occasion: input.occasion,
      audience: input.audience,
      styleDirection: concept.styleDirection,
      language: input.language,
    });
    aiCalls += 1;

    const closingCopy = await generateClosingCopy({
      brandAnalysis,
      conceptTitle: concept.presentationTitle,
      language: input.language,
    });
    aiCalls += 1;

    let slides = buildSlidesFromConcept({
      concept,
      slideOutlines,
      productStories,
      products: input.products,
      closingCopy,
      showPrices: input.showPrices ?? true,
    });

    await updateJob(presentationId, {
      title: concept.presentationTitle,
      brandAnalysis,
      concept,
      productStories,
      products: input.products,
      visualizationIds: input.visualizationIds,
      visualizationImages: input.visualizationImages,
      theme,
      slides,
      aiCalls,
    });

    await setStatus("generating_images", 55, "Подбор изображений...");
    const imageResult = await generateSlideImages({
      presentationId,
      slides,
      brand: input.brand,
      brandAnalysis,
      concept,
      products: input.products,
      productStories,
      theme,
      references: input.references,
      visualizationIds: input.visualizationIds,
      visualizationImages: input.visualizationImages,
    });
    slides = imageResult.slides;
    aiCalls += slides.filter((s) => s.heroImage || s.backgroundImage).length;

    await setStatus("rendering_slides", 80, "Сборка слайдов...");
    await updateJob(presentationId, {
      slides,
      assets: imageResult.assets,
      aiCalls,
    });

    await setStatus("exporting", 90, "Экспорт файлов...");
    const job = await (await import("../storage/job-store")).loadJob(presentationId);
    if (!job) throw new Error("Job not found");

    slides = initializeSlidesVariants(slides);

    const outputs = await exportOutputs(
      { ...job, slides, theme, brandAnalysis, concept, productStories, quality: effectiveQuality },
      pipelineInput,
    );

    await setStatus("completed", 100, "Готово", {
      slides,
      assets: imageResult.assets,
      outputs,
      aiCalls,
      products: input.products,
      visualizationIds: input.visualizationIds,
      visualizationImages: input.visualizationImages,
      error: undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка генерации презентации";
    console.error("[presentation-ai/pipeline]", error);
    await setStatus("failed", 0, message, { error: message });
  }
}

export async function executePresentationPipeline(
  input: PresentationGenerationInput,
): Promise<GeneratedPresentation> {
  const id = `pres-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = createInitialJob(id, input);
  job.theme = getSimpleWhitePresentationTheme();
  await saveJob(job);

  await runPresentationPipeline(id, input);

  const result = await loadJob(id);
  if (!result) throw new Error("Не удалось сохранить результат генерации");
  if (result.status === "failed") {
    throw new Error(result.error ?? "Ошибка генерации презентации");
  }
  return result;
}

export async function startPresentationJob(
  input: PresentationGenerationInput,
): Promise<GeneratedPresentation> {
  const id = `pres-ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job = createInitialJob(id, input);
  job.theme = getSimpleWhitePresentationTheme();
  await saveJob(job);

  void runPresentationPipeline(id, input).catch((err) => {
    console.error("[presentation-ai] background pipeline error", err);
  });

  return job;
}

export interface RegenerateSlideOptions {
  slideId: string;
  prompt?: string;
  regenerateImage?: boolean;
}

export async function regenerateSlide(
  presentationId: string,
  options: RegenerateSlideOptions,
): Promise<GeneratedPresentation | null> {
  const { slideId, prompt } = options;
  const job = await (await import("../storage/job-store")).loadJob(presentationId);
  if (!job || !job.concept || !job.brandAnalysis) return null;

  const slideIndex = job.slides.findIndex((s) => s.id === slideId);
  if (slideIndex < 0) return null;

  let slide = ensureSlideVariants(job.slides[slideIndex]);
  const activeIndex = slide.activeVariantIndex ?? 0;
  let workingSlide = applyVariantToSlide(slide, activeIndex);

  if (prompt?.trim()) {
    const refined = await refineSlideCopy({
      slide: workingSlide,
      refinementPrompt: prompt.trim(),
      brandAnalysis: job.brandAnalysis,
      language: job.language,
      occasion: job.concept.presentationTitle,
    });
    workingSlide = refined.slide;
  }

  const productStories = job.productStories ?? [];

  slide = addSlideVariant(workingSlide, toSlideSnapshot(workingSlide), prompt?.trim());
  const slides = [...job.slides];
  slides[slideIndex] = slide;

  const partialJob: GeneratedPresentation = { ...job, slides, productStories };
  const outputs = await reexportPresentation(partialJob, buildPipelineInputFromJob(job));

  return updateJob(presentationId, {
    slides,
    productStories,
    outputs,
    status: "completed",
    progress: 100,
    progressMessage: "Слайд обновлён",
  });
}

export async function selectSlideVariant(
  presentationId: string,
  slideId: string,
  variantIndex: number,
): Promise<GeneratedPresentation | null> {
  const job = await (await import("../storage/job-store")).loadJob(presentationId);
  if (!job) return null;

  const slideIndex = job.slides.findIndex((s) => s.id === slideId);
  if (slideIndex < 0) return null;

  const slide = ensureSlideVariants(job.slides[slideIndex]);
  if (!slide.variants?.length || variantIndex < 0 || variantIndex >= slide.variants.length) {
    return null;
  }

  const updatedSlide = applyVariantToSlide(slide, variantIndex);
  const slides = [...job.slides];
  slides[slideIndex] = updatedSlide;

  const partialJob: GeneratedPresentation = { ...job, slides };
  const outputs = await reexportPresentation(partialJob, buildPipelineInputFromJob(job));

  return updateJob(presentationId, {
    slides,
    outputs,
    status: "completed",
    progress: 100,
  });
}
