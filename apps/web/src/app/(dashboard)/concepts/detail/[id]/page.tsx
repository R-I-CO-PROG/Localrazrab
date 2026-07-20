"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BackButton } from "@/components/ui/back-button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConceptBriefParamsCard } from "@/components/concepts/concept-brief-params-card";
import { Textarea } from "@/components/ui/textarea";
import { VisualizationLoadingOverlay } from "@/components/concepts/visualization-loading-overlay";
import { ImageLightbox, ZoomableImageTrigger, type LightboxImage } from "@/components/concepts/image-lightbox";
import { formatCurrency } from "@/lib/utils";
import { assetUrl } from "@/lib/asset-url";
import { displayCatalogImageSrc } from "@/lib/product-image";
import { useProjectStore } from "@/store/project-store";
import { ConceptVisualizationCarousel } from "@/components/concepts/concept-visualization-carousel";
import { ConceptRefinePanel } from "@/components/concepts/concept-refine-panel";
import {
  generateRequest,
  getRequest,
  refineVisualization,
  regenerateRequest,
  selectConcept,
  ensureRequestLogo,
} from "@/lib/suvenir-client";
import { CatalogProductSetEditor } from "@/components/concepts/catalog-product-set-editor";
import { CatalogPhotosGrid } from "@/components/concepts/catalog-photos-grid";
import { mapConceptResultVariants } from "@/lib/map-visualization-variants";
import type { ConceptItem, ConceptVisualizationVariant } from "@/lib/types";
import {
  productIdsKey,
  visualizationMatchesConcept,
} from "@/lib/concept-product-ids";
import {
  getConceptResultFromGeneration,
  conceptResultMatchesProducts,
  conceptResultIdentity,
  resolveVisualizationFromGeneration,
  generationPollComplete,
  type ConceptGenerationResult,
} from "@/lib/resolve-concept-generation";
import { notify } from "@/lib/notify";
import { useProjectStoreHydrated } from "@/hooks/use-project-store-hydrated";
import { buildProjectTitle } from "@/lib/project-title";

const STATUS_LABELS: { min: number; text: string }[] = [
  { min: 0, text: "Подготавливаем запрос…" },
  { min: 12, text: "Собираем композицию сцены…" },
  { min: 35, text: "Настраиваем брендовые акценты…" },
  { min: 55, text: "Собираем финальную сцену…" },
  { min: 75, text: "Почти готово…" },
  { min: 92, text: "Сохраняем в проект…" },
];

const REFINE_STATUS_LABELS: { min: number; text: string }[] = [
  { min: 0, text: "Готовим запрос…" },
  { min: 20, text: "Учитываем ваши правки…" },
  { min: 40, text: "Аккуратно обновляем детали…" },
  { min: 60, text: "Сохраняем идею, меняем то, что попросили…" },
  { min: 85, text: "Сохраняем вариант…" },
];

function labelForProgress(p: number, labels = STATUS_LABELS): string {
  let label = labels[0].text;
  for (const s of labels) {
    if (p >= s.min) label = s.text;
  }
  return label;
}

export default function ConceptDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const conceptId = decodeURIComponent(rawId);
  const storeHydrated = useProjectStoreHydrated();

  const concept = useProjectStore((s) => s.getConceptById(conceptId));
  const session = useProjectStore((s) => s.getConceptRenderSession(conceptId));
  const storedViz = useProjectStore((s) => s.getVisualizationByConceptId(conceptId));
  const linkedProject = useProjectStore((s) => {
    if (session) return s.projects.find((p) => p.id === session.projectId);
    if (storedViz?.projectId) return s.projects.find((p) => p.id === storedViz.projectId);
    return undefined;
  });
  const generationInput = useProjectStore((s) => {
    const requestId = session?.requestId ?? linkedProject?.requestId ?? linkedProject?.id;
    return requestId ? s.getGenerationInput(requestId) : undefined;
  });
  const formFiles = useProjectStore((s) => s.formData.files);
  const isCatalogProject =
    linkedProject?.generationMode === "catalog" || generationInput?.generationMode === "catalog";
  const updateProject = useProjectStore((s) => s.updateProject);
  const addVisualization = useProjectStore((s) => s.addVisualization);
  const setVisualizationVariants = useProjectStore((s) => s.setVisualizationVariants);
  const upsertProject = useProjectStore((s) => s.upsertProject);
  const clearVisualization = useProjectStore((s) => s.clearVisualization);
  const patchConcept = useProjectStore((s) => s.patchConcept);
  const syncConceptCatalogSet = useProjectStore((s) => s.syncConceptCatalogSet);

  const [setItems, setSetItems] = useState<ConceptItem[]>([]);
  const [sceneBrief, setSceneBrief] = useState("");
  const [giftBoxEnabled, setGiftBoxEnabled] = useState(true);
  const [imageViewMode, setImageViewMode] = useState<"catalog" | "visualization">("catalog");
  const [visualizing, setVisualizing] = useState(false);
  const [refining, setRefining] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusLabel, setStatusLabel] = useState(STATUS_LABELS[0].text);
  const [variants, setVariants] = useState<ConceptVisualizationVariant[]>([]);
  const [activeVariantIndex, setActiveVariantIndex] = useState(0);
  const [liveImageUrl, setLiveImageUrl] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const [serverConceptResult, setServerConceptResult] = useState<ConceptGenerationResult | null>(
    null,
  );
  const [apiSyncing, setApiSyncing] = useState(false);

  const currentProductIds = setItems.map((it) => it.id).filter(Boolean) as string[];
  const productIdsForValidation =
    currentProductIds.length > 0
      ? currentProductIds
      : (concept?.items.map((it) => it.id).filter(Boolean) as string[]);
  const productIdsKeyForValidation = productIdsKey(productIdsForValidation);

  const hasLocalImage = variants.length > 0 || Boolean(liveImageUrl);
  const productsOk = conceptResultMatchesProducts(
    serverConceptResult,
    productIdsForValidation,
  );
  const conceptTitleOk = visualizationMatchesConcept(
    serverConceptResult?.chosenIdeaTitle ?? storedViz?.chosenIdeaTitle,
    session?.chosenIdeaTitle,
  );
  // «Устаревание» визуализации опирается на совпадение набора SKU (productIds)
  // и названия концепции. Это имеет смысл ТОЛЬКО для каталога: там состав набора
  // можно менять после генерации. В креативе каталожных SKU нет, поэтому productIds
  // всегда «не совпадают» и баннер срабатывал ложно. Ограничиваем проверку каталогом.
  const visualizationStale =
    isCatalogProject &&
    Boolean(serverConceptResult || storedViz?.sourceImagePath || hasLocalImage) &&
    (Boolean(concept?.visualizationOutdated) || !productsOk || !conceptTitleOk);
  const hasServerConceptImage =
    !concept?.visualizationOutdated &&
    productsOk &&
    conceptTitleOk &&
    (Boolean(serverConceptResult?.resultImageUrl) || hasLocalImage);
  const hasFinalVisualization = hasServerConceptImage;
  const showPendingVisualization = !hasFinalVisualization;
  const showCatalogPhotos = isCatalogProject && showPendingVisualization;
  const showCreativeSetPreview = !isCatalogProject && showPendingVisualization;
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!concept || !isCatalogProject || !session) return;
    setSetItems(concept.items ?? []);
  }, [concept?.id, concept?.items, isCatalogProject, session]);

  useEffect(() => {
    if (generationInput?.giftBoxEnabled !== undefined) {
      setGiftBoxEnabled(generationInput.giftBoxEnabled !== false);
    }
  }, [generationInput?.giftBoxEnabled]);

  /** Быстрый показ сохранённых версий до синка с API */
  useEffect(() => {
    if (visualizing || refining || variants.length > 0) return;
    if (!storedViz?.variants?.length) return;
    setVariants(storedViz.variants);
    const idx = storedViz.activeVariantIndex ?? storedViz.variants.length - 1;
    setActiveVariantIndex(idx);
    setLiveImageUrl(storedViz.variants[idx]?.imageUrl ?? storedViz.imageUrl);
  }, [storedViz, visualizing, refining, variants.length]);

  /** Фото только из conceptResults API для этой концепции (каталог + креатив) */
  useEffect(() => {
    const requestId = session?.requestId;
    if (!requestId || !session?.chosenIdeaTitle) {
      setServerConceptResult(null);
      return;
    }
    if (visualizing || refining) return;

    let cancelled = false;
    setApiSyncing(true);

    void (async () => {
      try {
        const req = await getRequest(requestId);
        if (cancelled) return;

        const result = getConceptResultFromGeneration(req.generation, session.chosenIdeaTitle);
        const productsOk = conceptResultMatchesProducts(result, productIdsForValidation);

        if (result?.resultImageUrl && productsOk && !concept?.visualizationOutdated) {
          setServerConceptResult(result);
          const mapped = mapConceptResultVariants(result);
          const latestIdx = Math.max(0, mapped.length - 1);
          setVariants(mapped);
          setActiveVariantIndex(latestIdx);
          setLiveImageUrl(mapped[latestIdx]?.imageUrl ?? assetUrl(result.resultImageUrl));

          const stored = useProjectStore.getState().getVisualizationByConceptId(conceptId);
          const storedVariantCount = stored?.variants?.length ?? 0;
          if (
            stored?.sourceImagePath !== result.resultImageUrl ||
            storedVariantCount !== mapped.length
          ) {
            addVisualization({
              conceptId,
              conceptName: concept?.name ?? session.chosenIdeaTitle,
              imageUrl: mapped[latestIdx]?.imageUrl ?? assetUrl(result.resultImageUrl),
              projectId: session.projectId,
              variants: mapped,
              activeVariantIndex: latestIdx,
              generatedProductIds: isCatalogProject ? result.productIds : undefined,
              chosenIdeaTitle: session.chosenIdeaTitle,
              generationRevision: result.revision,
              sourceImagePath: result.resultImageUrl,
            });
            patchConcept(conceptId, {
              visualizationProductIds: isCatalogProject ? result.productIds : undefined,
              visualizationOutdated: false,
            });
          }
        } else {
          setServerConceptResult(null);
          setVariants([]);
          setLiveImageUrl(null);
          clearVisualization(conceptId);
          if (storedViz?.sourceImagePath || result) {
            patchConcept(conceptId, { visualizationOutdated: Boolean(result) });
          }
        }
      } catch {
        setServerConceptResult(null);
      } finally {
        if (!cancelled) setApiSyncing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    conceptId,
    concept?.name,
    concept?.visualizationOutdated,
    session?.requestId,
    session?.chosenIdeaTitle,
    session?.projectId,
    isCatalogProject,
    productIdsKeyForValidation,
    visualizing,
    refining,
    addVisualization,
    clearVisualization,
    patchConcept,
    storedViz?.sourceImagePath,
  ]);

  const handleSetItemsChange = useCallback(
    (items: ConceptItem[]) => {
      setSetItems(items);
      syncConceptCatalogSet(conceptId, items);
    },
    [conceptId, syncConceptCatalogSet],
  );

  const openLightbox = useCallback((images: LightboxImage[], index = 0) => {
    if (images.length === 0) return;
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const openSingleImage = useCallback(
    (src: string, alt: string) => openLightbox([{ src, alt }], 0),
    [openLightbox],
  );

  const openCatalogGridImage = useCallback(
    (index: number, items: ConceptItem[]) => {
      const images = items
        .filter((it) => it.imageUrl)
        .map((it) => ({ src: displayCatalogImageSrc(it.imageUrl!), alt: it.name }));
      openLightbox(images, index);
    },
    [openLightbox],
  );

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

  const persistVisualization = useCallback(
    (
      imagePath: string,
      projectId: string,
      mapped: ConceptVisualizationVariant[],
      conceptResult: ConceptGenerationResult,
    ) => {
      if (!concept) return;
      const productIds = isCatalogProject ? conceptResult.productIds : [];
      const activeIdx = Math.max(0, mapped.length - 1);
      const latest = mapped[activeIdx];
      const fullUrl = latest?.imageUrl ?? assetUrl(imagePath);
      setVariants(mapped);
      setActiveVariantIndex(activeIdx);
      setLiveImageUrl(fullUrl);
      setServerConceptResult(conceptResult);
      addVisualization({
        conceptId,
        conceptName: concept.name,
        imageUrl: fullUrl,
        projectId,
        variants: mapped,
        activeVariantIndex: activeIdx,
        generatedProductIds: productIds.length ? productIds : undefined,
        chosenIdeaTitle: session?.chosenIdeaTitle,
        generationRevision: conceptResult.revision,
        sourceImagePath: latest?.pathUrl ?? imagePath,
      });
      patchConcept(conceptId, {
        visualizationProductIds: productIds.length ? productIds : undefined,
        visualizationOutdated: false,
      });
      upsertProject({
        id: projectId,
        title: buildProjectTitle({
          description: generationInput?.description,
          category: generationInput?.category ?? "Welcome Pack",
          quantity: generationInput?.quantity,
          conceptName: concept.name,
        }),
        category: generationInput?.category ?? "Welcome Pack",
        budget: generationInput?.budget ?? 3000,
        quantity: generationInput?.quantity ?? 100,
        conceptsCount: isCatalogProject ? 1 : 5,
        createdAt: new Date().toISOString(),
        status: "completed",
        generationMode: isCatalogProject ? "catalog" : "creative",
        requestId: session?.requestId,
        selectedConceptTitle: session?.chosenIdeaTitle,
        resultImageUrl: fullUrl,
        briefExcerpt: generationInput?.description.slice(0, 160),
      });
      updateProject(projectId, {
        status: "completed",
        resultImageUrl: fullUrl,
        selectedConceptTitle: session?.chosenIdeaTitle,
      });
    },
    [
      addVisualization,
      concept,
      conceptId,
      generationInput,
      session,
      updateProject,
      upsertProject,
      isCatalogProject,
      patchConcept,
    ],
  );

  const handleCreateVisualization = async () => {
    if (!concept || !session || visualizing || refining) return;
    if (isCatalogProject && setItems.length === 0) {
      notify.error("Добавьте хотя бы один товар в набор");
      return;
    }
    if (visualizationStale) {
      patchConcept(conceptId, { visualizationOutdated: false });
    }
    setVisualizing(true);
    setProgress(8);
    setStatusLabel(labelForProgress(8));

    try {
      const { requestId, chosenIdeaTitle, projectId } = session;
      const productIds = isCatalogProject
        ? setItems.map((it) => it.id).filter(Boolean) as string[]
        : [];

      setProgress(12);
      await ensureRequestLogo(requestId, formFiles);
      await selectConcept(requestId, chosenIdeaTitle);
      setProgress(22);

      updateProject(projectId, { status: "generating", selectedConceptTitle: chosenIdeaTitle });

      const existing = await getRequest(requestId);
      const genOpts = {
        mode: "ai" as const,
        aiStyle: (isCatalogProject ? "catalog" : "creative") as "catalog" | "creative",
        chosenIdeaTitle,
        productIds,
        productTargetColors: isCatalogProject
          ? setItems
              .filter((it) => it.id && it.targetColor)
              .map((it) => ({ productId: it.id!, color: it.targetColor! }))
          : undefined,
        sceneBrief: sceneBrief.trim() || undefined,
        // Переключатель «в подарочной коробке» из брифа проекта (по умолчанию вкл.).
        giftBoxEnabled,
      };

      const baselineConceptResult = getConceptResultFromGeneration(
        existing.generation,
        chosenIdeaTitle,
      );
      const baselineIdentity = conceptResultIdentity(baselineConceptResult);
      let sawGenerating = false;

      if (existing.generationCount > 0 || existing.status === "done" || existing.status === "failed") {
        await regenerateRequest(requestId, genOpts);
      } else {
        await generateRequest(requestId, genOpts);
      }

      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const req = await getRequest(requestId);
          const pct = req.generationProgress ?? progress;
          setProgress((prev) => Math.max(prev, pct));
          setStatusLabel(labelForProgress(pct));

          if (req.status === "generating" || req.generation?.status === "generating") {
            sawGenerating = true;
          }

          if (req.status === "done" && req.generation) {
            const conceptResult = getConceptResultFromGeneration(
              req.generation,
              chosenIdeaTitle,
            );
            if (!conceptResult?.resultImageUrl) return;
            if (!conceptResultMatchesProducts(conceptResult, productIds)) return;
            if (conceptResultIdentity(conceptResult) === baselineIdentity && !sawGenerating) {
              return;
            }
            if (pollRef.current) clearInterval(pollRef.current);
            const mapped = mapConceptResultVariants(conceptResult);
            persistVisualization(conceptResult.resultImageUrl, projectId, mapped, conceptResult);
            setProgress(100);
            setVisualizing(false);
            notify.success("Визуализация готова");
          }
          if (req.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            const msg =
              (req.generation?.llmOutput as { _error?: string } | undefined)?._error ??
              "Генерация не удалась";
            notify.error(msg);
            updateProject(projectId, { status: "failed" });
            setVisualizing(false);
          }
        } catch {
          /* ignore poll errors */
        }
      }, 1500);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Не удалось запустить визуализацию");
      setVisualizing(false);
    }
  };

  const handleVariantIndexChange = useCallback(
    (index: number) => {
      setActiveVariantIndex(index);
      const next = variants[index];
      if (next) {
        setLiveImageUrl(next.imageUrl);
        setVisualizationVariants(conceptId, variants, index);
      }
    },
    [variants, conceptId, setVisualizationVariants],
  );

  const handleRefine = async (refinementBrief: string) => {
    if (!session || refining || visualizing || variants.length === 0) return;
    const current = variants[activeVariantIndex];
    const sourceImageUrl =
      current?.pathUrl ??
      serverConceptResult?.variants[activeVariantIndex]?.imageUrl ??
      serverConceptResult?.resultImageUrl;
    if (!sourceImageUrl) {
      notify.error("Не найдено исходное фото для перегенерации");
      return;
    }
    const baselineIdentity = conceptResultIdentity(serverConceptResult);
    const baselineUrl =
      serverConceptResult?.resultImageUrl ?? sourceImageUrl;
    const baselineVariantCount =
      serverConceptResult?.variants.length ?? variants.length;

    setRefining(true);
    setProgress(8);
    setStatusLabel(labelForProgress(8, REFINE_STATUS_LABELS));

    try {
      await refineVisualization(session.requestId, {
        refinementBrief,
        sourceImageUrl,
        chosenIdeaTitle: session.chosenIdeaTitle,
      });

      if (pollRef.current) clearInterval(pollRef.current);

      const pollRefineStatus = async () => {
        try {
          const req = await getRequest(session.requestId);
          const pct = req.generationProgress ?? progress;
          setProgress((prev) => Math.max(prev, pct));
          setStatusLabel(labelForProgress(pct, REFINE_STATUS_LABELS));

          const genDone =
            req.status === "done" ||
            req.status === "failed" ||
            req.generation?.status === "done" ||
            req.generation?.status === "failed";

          if (!genDone) return;

          const complete = generationPollComplete(req, session.chosenIdeaTitle, {
            resultImageUrl: baselineUrl,
            variantCount: baselineVariantCount,
            identity: baselineIdentity,
          });

          if (req.status === "failed" || req.generation?.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            notify.error("Перегенерация не удалась");
            setRefining(false);
            return;
          }

          const { conceptResult, mapped } = resolveVisualizationFromGeneration(
            req.generation,
            session.chosenIdeaTitle,
            req.generationCount,
          );

          if (!complete) {
            if (pollRef.current) clearInterval(pollRef.current);
            setRefining(false);
            setProgress(100);
            return;
          }

          if (!conceptResult?.resultImageUrl || mapped.length === 0) {
            if (pollRef.current) clearInterval(pollRef.current);
            setRefining(false);
            setProgress(100);
            return;
          }

          if (pollRef.current) clearInterval(pollRef.current);
          persistVisualization(
            conceptResult.resultImageUrl,
            session.projectId,
            mapped,
            conceptResult,
          );
          setProgress(100);
          setRefining(false);
          notify.success("Новая версия визуализации готова");
        } catch {
          /* ignore poll errors */
        }
      };

      void pollRefineStatus();
      pollRef.current = setInterval(() => void pollRefineStatus(), 1500);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Не удалось запустить перегенерацию");
      setRefining(false);
    }
  };

  const displayItems = isCatalogProject && session ? setItems : concept?.items ?? [];
  const displayTotalCost = displayItems.reduce((s, it) => s + (it.price || 0), 0);

  if (!storeHydrated) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 pb-12">
        <div className="h-10 w-44 animate-pulse rounded-lg bg-secondary/40" />
        <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
          <div className="aspect-square animate-pulse rounded-2xl bg-secondary/30" />
          <div className="min-h-[320px] animate-pulse rounded-2xl bg-secondary/20" />
        </div>
      </div>
    );
  }

  if (!concept) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground mb-4">Концепция не найдена</p>
        <Button asChild>
          <Link href="/concepts/results">К результатам</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl min-w-0 space-y-8 overflow-x-hidden pb-12">
      <BackButton variant="ghost" label="Назад к концепциям" fallbackHref="/concepts/results" />

      {/* Заголовок */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{concept.name}</h1>
        {displayTotalCost > 0 && (
          <p className="mt-2 text-2xl font-semibold text-primary">
            {formatCurrency(displayTotalCost)}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {concept.tags.map((t) => (
            <Badge key={t} variant="outline">
              {t}
            </Badge>
          ))}
          {visualizationStale && (
            <Badge variant="destructive">Фото устарело — перегенерируйте</Badge>
          )}
          {hasFinalVisualization && (
            <Badge className="bg-primary/90 text-primary-foreground">Есть визуализация</Badge>
          )}
          {isCatalogProject && (
            <Badge variant="secondary">Фото из каталога</Badge>
          )}
          {showCreativeSetPreview && (
            <Badge variant="secondary">Ожидает визуализацию</Badge>
          )}
        </div>
      </div>

      {/* Фото + описание — одинаковая высота */}
      <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
        <div className="flex flex-col gap-4">
          <div className="relative aspect-square overflow-hidden rounded-2xl border border-border/50 bg-secondary/20 shadow-sm">
          {isCatalogProject && setItems.length > 0 && imageViewMode === "catalog" ? (
            <>
              <CatalogPhotosGrid
                items={setItems}
                layout="showcase"
                onImageClick={openCatalogGridImage}
              />
              {hasFinalVisualization && (
                <button
                  onClick={() => setImageViewMode("visualization")}
                  className="absolute right-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition-colors hover:bg-black/80"
                  title="Показать AI-визуализацию"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
            </>
          ) : isCatalogProject && imageViewMode === "visualization" && hasFinalVisualization ? (
            <>
              {variants.length > 0 ? (
                <ConceptVisualizationCarousel
                  variants={variants}
                  activeIndex={activeVariantIndex}
                  onIndexChange={handleVariantIndexChange}
                  alt={concept.name}
                  onOpenLightbox={(index) => {
                    openLightbox(
                      variants.map((v) => ({ src: v.imageUrl, alt: concept.name })),
                      index,
                    );
                  }}
                />
              ) : liveImageUrl ? (
                <ZoomableImageTrigger
                  src={liveImageUrl}
                  alt={concept.name}
                  onOpen={() => openSingleImage(liveImageUrl, concept.name)}
                  className="absolute inset-0 h-full w-full cursor-zoom-in"
                >
                  <div className="relative h-full w-full">
                    <Image
                      src={liveImageUrl}
                      alt={concept.name}
                      fill
                      className="object-cover"
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      unoptimized
                    />
                  </div>
                </ZoomableImageTrigger>
              ) : null}
              <Badge className="pointer-events-none absolute left-3 top-3 z-10 bg-primary/90 text-primary-foreground">
                AI-визуализация
              </Badge>
              <button
                onClick={() => setImageViewMode("catalog")}
                className="absolute left-3 top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white shadow-lg transition-colors hover:bg-black/80"
                title="Показать фото товаров"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
            </>
          ) : !isCatalogProject && hasFinalVisualization && variants.length > 0 ? (
            <>
              <ConceptVisualizationCarousel
                variants={variants}
                activeIndex={activeVariantIndex}
                onIndexChange={handleVariantIndexChange}
                alt={concept.name}
                onOpenLightbox={(index) => {
                  openLightbox(
                    variants.map((v) => ({ src: v.imageUrl, alt: concept.name })),
                    index,
                  );
                }}
              />
              <Badge className="pointer-events-none absolute left-3 top-3 z-10 bg-primary/90 text-primary-foreground">
                AI-визуализация
              </Badge>
            </>
          ) : !isCatalogProject && hasFinalVisualization && liveImageUrl ? (
            <>
              <ZoomableImageTrigger
                src={liveImageUrl}
                alt={concept.name}
                onOpen={() => openSingleImage(liveImageUrl, concept.name)}
                className="absolute inset-0 h-full w-full cursor-zoom-in"
              >
                <div className="relative h-full w-full">
                  <Image
                    src={liveImageUrl}
                    alt={concept.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 50vw"
                    unoptimized
                  />
                </div>
              </ZoomableImageTrigger>
              <Badge className="pointer-events-none absolute left-3 top-3 z-10 bg-primary/90 text-primary-foreground">
                AI-визуализация
              </Badge>
            </>
          ) : showCatalogPhotos ? (
            <CatalogPhotosGrid
              items={setItems}
              layout="showcase"
              onImageClick={openCatalogGridImage}
            />
          ) : showCreativeSetPreview ? (
            <div className="flex h-full flex-col gap-4 p-6">
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                <Sparkles className="h-10 w-10 opacity-40" />
                <p className="text-sm font-medium text-foreground/90">Визуализация ещё не создана</p>
                <p className="max-w-xs text-xs leading-relaxed">
                  Здесь появится AI-фото концепции после нажатия «Создать визуализацию»
                </p>
              </div>
              <div className="rounded-xl bg-secondary/30 p-4">
                <span className="mb-2 block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Состав набора
                </span>
                {concept.items.length > 0 ? (
                  <ul className="space-y-2">
                    {concept.items.map((item, i) => (
                      <li
                        key={`${item.name}-${i}`}
                        className="flex items-center gap-2 text-sm text-foreground/90"
                      >
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
                          {i + 1}
                        </span>
                        <span className="min-w-0 leading-snug">{item.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm italic text-muted-foreground">Товары подбираются…</p>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
              <Sparkles className="h-10 w-10 opacity-40" />
              <p className="text-sm">Визуализация ещё не создана</p>
            </div>
          )}

          <AnimatePresence>
            {(visualizing || refining) && (
              <VisualizationLoadingOverlay progress={progress} statusLabel={statusLabel} />
            )}
          </AnimatePresence>
          </div>

          {session && !hasFinalVisualization && (
            <Card className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Пожелания к генерации</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Необязательно. Опишите, как расставить предметы, ракурс, композицию, свет, фон и
                  настроение — это учтётся при первой визуализации.
                </p>
                <Textarea
                  placeholder="Например: предметы на светлом деревянном столе, мягкий дневной свет сбоку, вид сверху под небольшим углом, минималистичный фон…"
                  value={sceneBrief}
                  onChange={(e) => setSceneBrief(e.target.value.slice(0, 600))}
                  className="min-h-[88px] resize-none bg-background/80"
                  disabled={visualizing || refining}
                />
              </CardContent>
            </Card>
          )}

          {hasFinalVisualization && session && (
            <ConceptRefinePanel
              onRefine={handleRefine}
              refining={refining}
              disabled={visualizing}
            />
          )}
        </div>

        <Card className="flex h-full min-h-0 flex-col overflow-hidden border-border/50 shadow-sm">
          <CardHeader className="shrink-0 border-b border-border/40 bg-secondary/10 pb-4">
            <CardTitle className="text-base">
              {isCatalogProject ? "Описание набора" : "Описание концепции"}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-6 text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
            {concept.description}
          </CardContent>
        </Card>
      </div>

      {/* Создать / перегенерировать визуализацию — между фото+описанием и составом набора */}
      {session && (
        <div className="flex w-full flex-col gap-3">
          <Button
            size="lg"
            className="w-full gap-2"
            disabled={visualizing || refining}
            onClick={() => void handleCreateVisualization()}
          >
            {visualizing ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Генерируем фото…
              </>
            ) : (
              <>
                <Sparkles className="h-5 w-5" />
                {hasFinalVisualization || visualizationStale
                  ? isCatalogProject
                    ? "Перегенерировать AI-фото набора"
                    : "Перегенерировать визуализацию"
                  : isCatalogProject
                    ? "Создать AI-фото набора"
                    : "Создать визуализацию"}
              </>
            )}
          </Button>
          {isCatalogProject && (
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-card/80 px-4 py-2.5">
              <div className="space-y-0.5">
                <p className="text-sm font-medium">Собрать в подарочную коробку</p>
                <p className="text-[11px] text-muted-foreground">
                  {giftBoxEnabled
                    ? "Набор в коробке с ложементом"
                    : "Товары без коробки (flat-lay)"}
                </p>
              </div>
              <Switch
                checked={giftBoxEnabled}
                onCheckedChange={setGiftBoxEnabled}
                disabled={visualizing || refining}
              />
            </div>
          )}
        </div>
      )}

      {/* Состав набора (слева) + параметры брифа (справа) */}
      <div className="grid min-w-0 gap-6 lg:grid-cols-2 lg:items-start">
        <div>
          {isCatalogProject && session ? (
            <CatalogProductSetEditor
              requestId={session.requestId}
              items={setItems}
              onChange={handleSetItemsChange}
              readOnly={visualizing || refining}
              onPreviewImage={openSingleImage}
            />
          ) : (
            concept.items.length > 0 && (
              <Card className="h-full border-border/50">
                <CardHeader>
                  <CardTitle className="text-base">Состав набора</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {concept.items.map((item) => (
                    <div
                      key={item.name}
                      className="flex items-start justify-between gap-3 border-b border-border/40 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="min-w-0">
                        <p className="font-medium leading-snug">{item.name}</p>
                        {item.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                        )}
                      </div>
                      {item.price > 0 && (
                        <p className="shrink-0 text-sm font-semibold text-primary">
                          {formatCurrency(item.price)}
                        </p>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )
          )}
        </div>

        <div>
          {generationInput ? (
            <ConceptBriefParamsCard
              input={generationInput}
              briefExcerpt={linkedProject?.briefExcerpt}
              selectedConceptTitle={session?.chosenIdeaTitle ?? linkedProject?.selectedConceptTitle}
              compact={isCatalogProject || !hasFinalVisualization}
              catalogSetItemCount={isCatalogProject ? displayItems.length : undefined}
              catalogSetTotalCost={isCatalogProject ? displayTotalCost : undefined}
            />
          ) : linkedProject ? (
            <Card className="h-full border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Параметры проекта</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {linkedProject.briefExcerpt && (
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Бриф</p>
                    <p className="leading-relaxed text-muted-foreground">{linkedProject.briefExcerpt}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Категория</p>
                    <p className="font-medium">{linkedProject.category}</p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-muted-foreground">Тираж</p>
                    <p className="font-medium">{linkedProject.quantity} шт.</p>
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-xs text-muted-foreground">Бюджет</p>
                  <p className="font-semibold text-primary">
                    {formatCurrency(linkedProject.setTotalCost ?? linkedProject.budget)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Дополнительные действия */}
      <div className="flex w-full flex-col gap-3">
        {hasFinalVisualization && (
          <Button variant="outline" asChild className="w-full">
            <Link href="/concepts">Открыть в «Мои проекты»</Link>
          </Button>
        )}

        {!session && !hasFinalVisualization && !concept?.previewImageUrl && (
          <p className="text-center text-sm text-muted-foreground">
            Сессия генерации не найдена. Подберите концепции заново на странице генерации.
          </p>
        )}
      </div>

      <ImageLightbox
        open={lightboxOpen}
        images={lightboxImages}
        index={lightboxIndex}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setLightboxIndex}
      />
    </div>
  );
}
