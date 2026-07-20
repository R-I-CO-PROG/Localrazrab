"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { notify } from "@/lib/notify";
import type {
  GeneratedPresentation,
  GeneratedSlide,
  PresentationGenerationInput,
  ProductInput,
} from "@/lib/presentation-ai/types";
import {
  AUDIENCE_OPTIONS,
  OCCASION_OPTIONS,
} from "@/lib/presentation-ai/constants";
import { GTNT_DEMO_SEED, OFFICE_DEMO_SEED } from "@/lib/presentation-ai/demo-seed";
import { PPTX_EXPORT_ENABLED } from "@/lib/constants";
import { toggleOrderedSelection } from "@/lib/ordered-selection";
import { useProjectStore } from "@/store/project-store";
import { createDefaultBrandPalette } from "@/lib/brand-palette";
import { buildPresentationInputFromVisualizations } from "@/lib/presentation-ai/import-from-visualizations";
import {
  productsFromSelectedVisualizations,
  visualizationImagesFromSelection,
} from "@/lib/presentation-ai/sync-products-from-visualizations";
import { VisualizationSourceStep } from "@/components/presentations/visualization-source-step";
import { SlideVersionCarousel } from "@/components/presentations/slide-version-carousel";
import { SlideRegeneratePanel } from "@/components/presentations/slide-regenerate-panel";
import { cn } from "@/lib/utils";
import { aiJobToLibraryEntry } from "@/lib/presentation-ai/presentation-library-sync";
import type { GeneratedPresentation as AiGeneratedPresentation } from "@/lib/presentation-ai/types";

const STEPS = ["Визуализации", "Бренд", "Товары", "Настройки", "Генерация"] as const;
const GENERATION_STEP = 4;

interface AiPresentationWizardProps {
  /** Встроен в раздел «КП и презентации» — без отдельного заголовка страницы */
  embedded?: boolean;
  /** Открыть сохранённую AI-презентацию (экран слайдов + перегенерация) */
  initialJobId?: string | null;
  /** Сброс URL после «Новая презентация» */
  onStartNew?: () => void;
}

function newProduct(): ProductInput {
  return {
    id: `product-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: "",
    description: "",
  };
}

function applyImportedInput(seed: PresentationGenerationInput) {
  return {
    brandName: seed.brand.name,
    brandDescription: seed.brand.description ?? "",
    brandWebsite: seed.brand.website ?? "",
    brandColors: seed.brand.colors?.join(", ") ?? "",
    logoDataUrl: seed.brand.logoUrl,
    products: seed.products.map((p) => ({ ...p })),
    occasion: seed.occasion ?? "Корпоративный подарок",
    audience: seed.audience ?? "Смешанная аудитория",
    language: seed.language ?? "ru",
    stylePreset: seed.stylePreset ?? "corporate_light",
    slideCount: seed.slideCount ?? 8,
    showPrices: seed.showPrices ?? false,
    references: seed.references ?? [],
    visualizationIds: seed.visualizationIds ?? [],
    visualizationImages: seed.visualizationImages ?? [],
  };
}

export function AiPresentationWizard({
  embedded = false,
  initialJobId = null,
  onStartNew,
}: AiPresentationWizardProps) {
  const visualizations = useProjectStore((s) => s.visualizations ?? []);
  const projects = useProjectStore((s) => s.projects);
  const conceptsList = useProjectStore((s) => s.concepts);
  const projectConcepts = useProjectStore((s) => s.projectConcepts);
  const brandPalette = useProjectStore((s) => s.brandPalette ?? createDefaultBrandPalette());
  const brandLibrary = useProjectStore((s) => s.brandLibrary);
  const blacklistItems = useProjectStore((s) => s.blacklistItems ?? []);
  const addPresentation = useProjectStore((s) => s.addPresentation);
  const updatePresentation = useProjectStore((s) => s.updatePresentation);
  const presentations = useProjectStore((s) => s.presentations ?? []);

  const concepts = useMemo(() => {
    const seen = new Set<string>();
    const all: typeof conceptsList = [];
    for (const list of Object.values(projectConcepts)) {
      for (const c of list) {
        if (c.id && !seen.has(c.id)) {
          seen.add(c.id);
          all.push(c);
        }
      }
    }
    for (const c of conceptsList) {
      if (c.id && !seen.has(c.id)) {
        seen.add(c.id);
        all.push(c);
      }
    }
    return all;
  }, [conceptsList, projectConcepts]);

  const logo = brandLibrary.find((f) => f.fileType === "LOGO");

  const [step, setStep] = useState(0);
  const [selectedVisualizationIds, setSelectedVisualizationIds] = useState<string[]>([]);
  const [importingViz, setImportingViz] = useState(false);
  const [referenceUrls, setReferenceUrls] = useState<string[]>([]);
  const [visualizationImageUrls, setVisualizationImageUrls] = useState<string[]>([]);

  const [brandName, setBrandName] = useState("");
  const [brandDescription, setBrandDescription] = useState("");
  const [brandWebsite, setBrandWebsite] = useState("");
  const [brandColors, setBrandColors] = useState("");
  const [logoDataUrl, setLogoDataUrl] = useState<string | undefined>();
  const [products, setProducts] = useState<ProductInput[]>([newProduct()]);
  const [occasion, setOccasion] = useState("Корпоративный подарок");
  const [audience, setAudience] = useState("Смешанная аудитория");
  const [language, setLanguage] = useState("ru");
  const [slideCount, setSlideCount] = useState(8);
  const [showPrices, setShowPrices] = useState(false);
  const [formats, setFormats] = useState({
    pptx: PPTX_EXPORT_ENABLED,
    html: true,
    pdf: false,
  });

  const [jobId, setJobId] = useState<string | null>(null);
  const [presentation, setPresentation] = useState<GeneratedPresentation | null>(null);
  const [generating, setGenerating] = useState(false);
  const [regeneratingSlide, setRegeneratingSlide] = useState<string | null>(null);
  const [regenPanelSlideId, setRegenPanelSlideId] = useState<string | null>(null);
  const [switchingVariant, setSwitchingVariant] = useState<string | null>(null);

  const loadDemo = (seed: PresentationGenerationInput) => {
    const imported = applyImportedInput(seed);
    setBrandName(imported.brandName);
    setBrandDescription(imported.brandDescription);
    setBrandWebsite(imported.brandWebsite);
    setBrandColors(imported.brandColors);
    setLogoDataUrl(imported.logoDataUrl);
    setProducts(imported.products);
    setOccasion(imported.occasion);
    setAudience(imported.audience);
    setLanguage(imported.language);
    setSlideCount(imported.slideCount);
    setShowPrices(imported.showPrices);
    setReferenceUrls(imported.references);
    setVisualizationImageUrls(imported.visualizationImages);
    setSelectedVisualizationIds(imported.visualizationIds);
    notify.success("Демо-данные загружены");
  };

  const buildInput = useCallback((): PresentationGenerationInput => {
    return {
      brand: {
        name: brandName.trim(),
        description: brandDescription.trim() || undefined,
        website: brandWebsite.trim() || undefined,
        colors: brandColors
          .split(/[,;\s]+/)
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => (c.startsWith("#") ? c : `#${c}`)),
        logoUrl: logoDataUrl,
      },
      products: products.filter((p) => p.name.trim()),
      occasion,
      audience,
      language,
      slideCount,
      stylePreset: "corporate_light",
      quality: "draft",
      showPrices,
      references: referenceUrls.length ? referenceUrls : undefined,
      visualizationIds: selectedVisualizationIds.length ? selectedVisualizationIds : undefined,
      visualizationImages: visualizationImageUrls.length
        ? visualizationImageUrls
        : selectedVisualizationIds
            .map((id) => visualizations.find((v) => v.id === id)?.imageUrl)
            .filter(Boolean) as string[],
      outputFormats: [
        ...(formats.pptx ? (["pptx"] as const) : []),
        ...(formats.html ? (["html"] as const) : []),
        ...(formats.pdf ? (["pdf"] as const) : []),
      ],
    };
  }, [
    audience,
    brandColors,
    brandDescription,
    brandName,
    brandWebsite,
    formats,
    language,
    logoDataUrl,
    occasion,
    products,
    referenceUrls,
    selectedVisualizationIds,
    showPrices,
    slideCount,
    visualizationImageUrls,
    visualizations,
  ]);

  const pollJob = useCallback(async (id: string) => {
    const res = await fetch(`/api/presentations/ai/${id}`);
    if (!res.ok) throw new Error("Не удалось получить статус");
    const data = (await res.json()) as AiGeneratedPresentation;
    setPresentation(data);
    return data;
  }, []);

  const syncLibraryFromJob = useCallback(
    (job: AiGeneratedPresentation) => {
      const entry = aiJobToLibraryEntry(job);
      const exists = presentations.some((p) => p.id === job.id);
      if (exists) {
        updatePresentation(job.id, entry);
      } else {
        addPresentation(entry);
      }
    },
    [addPresentation, presentations, updatePresentation],
  );

  useEffect(() => {
    if (!jobId || !generating) return;

    const interval = setInterval(async () => {
      try {
        const data = await pollJob(jobId);
        syncLibraryFromJob(data);
        if (data.status === "completed" || data.status === "failed") {
          setGenerating(false);
          if (data.status === "completed") {
            notify.success("Презентация готова и сохранена в «Готовые»");
          } else {
            notify.error(data.error ?? "Ошибка генерации");
          }
        }
      } catch {
        setGenerating(false);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [generating, jobId, pollJob, syncLibraryFromJob]);

  useEffect(() => {
    if (!initialJobId) return;
    let cancelled = false;

    (async () => {
      try {
        const data = await pollJob(initialJobId);
        if (cancelled) return;
        setJobId(initialJobId);
        setStep(GENERATION_STEP);
        syncLibraryFromJob(data);
        if (data.status !== "completed" && data.status !== "failed") {
          setGenerating(true);
        }
      } catch {
        if (!cancelled) notify.error("Презентация не найдена");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [initialJobId, pollJob, syncLibraryFromJob]);

  async function handleLogoUpload(file: File | null) {
    if (!file) return;
    // Валидация: только логотип-форматы (SVG/PNG/JPG/WEBP), до 5 МБ. Иначе — не принимаем.
    const allowed = ["image/svg+xml", "image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      notify.error("Логотип должен быть SVG, PNG, JPG или WEBP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      notify.error("Файл логотипа слишком большой (максимум 5 МБ)");
      return;
    }
    // Предупреждаем о низком разрешении растрового лого (SVG векторный — пропускаем проверку).
    if (file.type !== "image/svg+xml") {
      try {
        const url = URL.createObjectURL(file);
        const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
          const im = new window.Image();
          im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
          im.onerror = reject;
          im.src = url;
        });
        URL.revokeObjectURL(url);
        if (dims.w < 300 || dims.h < 100) {
          notify.info("Логотип низкого разрешения — на слайдах он может выглядеть размыто. Лучше загрузить PNG/SVG покрупнее.");
        }
      } catch {
        /* игнорируем — валидация размера уже прошла */
      }
    }
    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  const toggleVisualization = (id: string) => {
    setSelectedVisualizationIds((prev) => toggleOrderedSelection(prev, id));
  };

  useEffect(() => {
    if (selectedVisualizationIds.length === 0) return;

    const synced = productsFromSelectedVisualizations({
      selectedVisualizationIds,
      visualizations,
      concepts,
      blacklistItems,
    });

    if (synced.length === 0) return;

    setProducts(synced);
    setReferenceUrls([...new Set(synced.flatMap((p) => p.images ?? []).filter(Boolean))]);
    setVisualizationImageUrls(visualizationImagesFromSelection(selectedVisualizationIds, visualizations));
    setSlideCount(Math.min(24, Math.max(4, synced.length + 3)));
  }, [selectedVisualizationIds, visualizations, concepts, blacklistItems]);

  async function handleImportFromVisualizations() {
    if (selectedVisualizationIds.length === 0) return;

    const primaryProject = projects.find(
      (p) => p.id === visualizations.find((v) => selectedVisualizationIds.includes(v.id))?.projectId,
    );

    setImportingViz(true);
    try {
      const imported = await buildPresentationInputFromVisualizations({
        title: primaryProject?.title ?? (brandName || "Презентация Mercai"),
        prompt: brandDescription.trim() || "Корпоративная презентация подарочной коллекции",
        selectedVisualizationIds,
        visualizations,
        concepts,
        brandPalette,
        logoUrl: logo?.url,
        logoMimeType: logo?.type,
        blacklistItems,
      });

      const applied = applyImportedInput(imported);
      setBrandName(applied.brandName);
      setBrandDescription(applied.brandDescription || "Корпоративная презентация подарочной коллекции");
      setBrandWebsite(applied.brandWebsite);
      setBrandColors(applied.brandColors);
      if (applied.logoDataUrl) setLogoDataUrl(applied.logoDataUrl);
      setProducts(applied.products.length ? applied.products : [newProduct()]);
      setOccasion(applied.occasion);
      setAudience(applied.audience);
      setSlideCount(applied.slideCount);
      setShowPrices(applied.showPrices);
      setReferenceUrls(applied.references);
      setVisualizationImageUrls(applied.visualizationImages);
      notify.success("Данные из визуализаций применены — проверьте бренд и товары");
      setStep(1);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Не удалось импортировать визуализации");
    } finally {
      setImportingViz(false);
    }
  }

  async function handleGenerate() {
    const input = buildInput();
    if (!input.brand.name) {
      notify.error("Укажите название бренда");
      return;
    }
    if (input.products.length === 0) {
      notify.error("Добавьте хотя бы один товар");
      return;
    }

    setGenerating(true);
    setPresentation(null);
    setStep(GENERATION_STEP);

    try {
      const res = await fetch("/api/presentations/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка запуска");

      const presentationId = data.presentationId as string;
      setJobId(presentationId);

      addPresentation({
        id: presentationId,
        kind: "ai",
        title: `${input.brand.name} — презентация`,
        prompt: input.brand.description?.trim() || brandDescription.trim() || "AI-презентация",
        visualizationIds: selectedVisualizationIds,
        status: "generating",
        createdAt: new Date().toISOString(),
      });

      const job = await pollJob(presentationId);
      syncLibraryFromJob(job);
      if (job.status === "completed" || job.status === "failed") {
        setGenerating(false);
        if (job.status === "completed") {
          notify.success("Презентация готова и сохранена в «Готовые»");
        } else {
          notify.error(job.error ?? "Ошибка генерации");
        }
      }
    } catch (err) {
      setGenerating(false);
      notify.error(err instanceof Error ? err.message : "Ошибка");
    }
  }

  async function handleRegenerateSlide(
    slideId: string,
    input: { prompt: string; regenerateImage: boolean },
  ) {
    if (!jobId) return;
    setRegeneratingSlide(slideId);
    try {
      const res = await fetch(`/api/presentations/ai/${jobId}/regenerate-slide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slideId,
          prompt: input.prompt,
          regenerateImage: input.regenerateImage,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPresentation(data);
      syncLibraryFromJob(data as AiGeneratedPresentation);
      setRegenPanelSlideId(null);
      notify.success("Слайд обновлён");
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setRegeneratingSlide(null);
    }
  }

  async function handleSelectVariant(slideId: string, variantIndex: number) {
    if (!jobId) return;
    setSwitchingVariant(slideId);
    try {
      const res = await fetch(`/api/presentations/ai/${jobId}/select-slide-variant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideId, variantIndex }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPresentation(data);
      syncLibraryFromJob(data as AiGeneratedPresentation);
    } catch (err) {
      notify.error(err instanceof Error ? err.message : "Ошибка переключения версии");
    } finally {
      setSwitchingVariant(null);
    }
  }

  function updateProduct(index: number, patch: Partial<ProductInput>) {
    setProducts((prev) => prev.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  function renderSlideContent(slide: GeneratedSlide) {
    const variants = slide.variants ?? [];
    const activeIndex = slide.activeVariantIndex ?? 0;
    const activeVariant = variants[activeIndex];
    const display = activeVariant?.snapshot ?? slide;

    return (
      <div key={slide.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
          <span className="min-w-0 truncate text-xs font-medium uppercase tracking-wider text-slate-500">
            {slide.type} — {display.title}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={regeneratingSlide === slide.id}
            className="shrink-0 border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-100 hover:text-slate-900"
            title="Перегенерировать текст слайда"
            onClick={() =>
              setRegenPanelSlideId((current) => (current === slide.id ? null : slide.id))
            }
          >
            {regeneratingSlide === slide.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="relative aspect-[1328/768] w-full overflow-hidden bg-white">
          {(presentation?.id ?? jobId) ? (
            <iframe
              key={`${slide.id}-${activeIndex}`}
              src={`/api/presentations/ai/${presentation?.id ?? jobId}/slides/${slide.id}/preview`}
              className="absolute inset-0 h-full w-full border-0"
              title={display.title}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
              Предпросмотр появится после сохранения
            </div>
          )}
          {variants.length > 1 && (
            <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/20 bg-black/60 px-3 py-1.5 text-xs text-white shadow-md backdrop-blur-sm">
              <button
                type="button"
                disabled={switchingVariant === slide.id || regeneratingSlide === slide.id}
                onClick={() =>
                  void handleSelectVariant(slide.id, (activeIndex - 1 + variants.length) % variants.length)
                }
                className="disabled:opacity-50"
                aria-label="Предыдущая версия"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-medium">
                {activeIndex + 1} / {variants.length}
              </span>
              <button
                type="button"
                disabled={switchingVariant === slide.id || regeneratingSlide === slide.id}
                onClick={() =>
                  void handleSelectVariant(slide.id, (activeIndex + 1) % variants.length)
                }
                className="disabled:opacity-50"
                aria-label="Следующая версия"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <SlideRegeneratePanel
          open={regenPanelSlideId === slide.id}
          slideTitle={display.title}
          regenerating={regeneratingSlide === slide.id}
          onClose={() => setRegenPanelSlideId(null)}
          onRegenerate={(input) => handleRegenerateSlide(slide.id, { ...input, regenerateImage: false })}
        />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6", embedded ? "" : "space-y-8")}>
      {!embedded && (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">AI-презентации</h1>
            <p className="mt-1 text-sm text-muted-foreground sm:text-base">
              Премиальные корпоративные презентации с AI-копирайтом и визуалами
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => loadDemo(GTNT_DEMO_SEED)}>
              Demo GTNT
            </Button>
            <Button variant="outline" size="sm" onClick={() => loadDemo(OFFICE_DEMO_SEED)}>
              Demo Office
            </Button>
          </div>
        </div>
      )}

      <div
        className={cn(
          "flex flex-wrap gap-2",
          embedded && "rounded-xl border border-border bg-secondary/40 p-1",
        )}
      >
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => i < GENERATION_STEP && !generating && setStep(i)}
            className={cn(
              "rounded-lg px-3 py-2 text-sm font-medium transition-all sm:px-4",
              embedded
                ? step === i
                  ? "bg-background text-foreground shadow-sm"
                  : i < step
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                : step === i
                  ? "rounded-full bg-primary px-4 py-1.5 text-primary-foreground"
                  : i < step
                    ? "rounded-full bg-primary/20 px-4 py-1.5 text-primary"
                    : "rounded-full bg-muted px-4 py-1.5 text-muted-foreground",
            )}
          >
            {i + 1}. {label}
          </button>
        ))}
      </div>

      {step === 0 && (
        <VisualizationSourceStep
          visualizations={visualizations}
          projects={projects}
          selectedIds={selectedVisualizationIds}
          onToggle={toggleVisualization}
          onImport={() => void handleImportFromVisualizations()}
          importing={importingViz}
        />
      )}

      {step === 1 && (
        <div className="grid gap-6 rounded-xl border bg-card p-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label>Название бренда *</Label>
              <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="GTNT" />
            </div>
            <div>
              <Label>Описание бренда</Label>
              <Textarea
                value={brandDescription}
                onChange={(e) => setBrandDescription(e.target.value)}
                placeholder="Мультисервисный оператор связи"
                rows={3}
              />
            </div>
            <div>
              <Label>Сайт</Label>
              <Input value={brandWebsite} onChange={(e) => setBrandWebsite(e.target.value)} placeholder="https://" />
            </div>
            <div>
              <Label>Фирменные цвета (через запятую)</Label>
              <Input
                value={brandColors}
                onChange={(e) => setBrandColors(e.target.value)}
                placeholder="#001A3D, #005BFF, #FFFFFF"
              />
            </div>
            {selectedVisualizationIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Источник: {selectedVisualizationIds.length} визуализаций · референсы для AI:{" "}
                {referenceUrls.length}
              </p>
            )}
          </div>
          <div className="space-y-4">
            <div>
              <Label>Логотип</Label>
              <Input
                type="file"
                accept="image/svg+xml,image/png,image/jpeg,image/webp"
                onChange={(e) => handleLogoUpload(e.target.files?.[0] ?? null)}
              />
              {logoDataUrl && (
                <img src={logoDataUrl} alt="logo" className="mt-3 h-16 object-contain rounded border p-2 bg-muted" />
              )}
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4 rounded-xl border bg-card p-6">
          {selectedVisualizationIds.length > 0 && products.some((p) => p.name.trim()) && (
            <p className="text-sm text-muted-foreground">
              {products.filter((p) => p.name.trim()).length} товаров из выбранных визуализаций — можно
              отредактировать перед генерацией
            </p>
          )}
          {products.map((product, index) => (
            <div key={product.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-2">
              <div>
                <Label>Название товара</Label>
                <Input
                  value={product.name}
                  onChange={(e) => updateProduct(index, { name: e.target.value })}
                  placeholder="Термос MAGNE"
                />
              </div>
              <div>
                <Label>Категория</Label>
                <Input
                  value={product.category ?? ""}
                  onChange={(e) => updateProduct(index, { category: e.target.value })}
                />
              </div>
              <div className="md:col-span-2">
                <Label>Описание</Label>
                <Textarea
                  value={product.description ?? ""}
                  onChange={(e) => updateProduct(index, { description: e.target.value })}
                  rows={2}
                />
              </div>
              <div>
                <Label>Цена (опционально)</Label>
                <Input
                  value={product.price?.toString() ?? ""}
                  onChange={(e) => updateProduct(index, { price: e.target.value })}
                />
              </div>
              <div className="flex items-end justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setProducts((p) => p.filter((_, i) => i !== index))}
                  disabled={products.length <= 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          <Button variant="outline" onClick={() => setProducts((p) => [...p, newProduct()])}>
            <Plus className="mr-2 h-4 w-4" />
            Добавить товар
          </Button>
        </div>
      )}

      {step === 3 && (
        <div className="grid gap-6 rounded-xl border bg-card p-6 md:grid-cols-2">
          <div className="space-y-4">
            <div>
              <Label>Повод</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
              >
                {OCCASION_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Аудитория</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              >
                {AUDIENCE_OPTIONS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Стиль: белый фон, текст слева, фото справа. Изображения берутся из каталога и
              визуализаций — без AI-генерации фото.
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <Label>Количество слайдов</Label>
              <Input
                type="number"
                min={4}
                max={24}
                value={slideCount}
                onChange={(e) => setSlideCount(Number(e.target.value))}
              />
            </div>
            <div className="flex flex-wrap gap-4 pt-2">
              <label
                className={`flex items-center gap-2 text-sm ${!PPTX_EXPORT_ENABLED ? "cursor-not-allowed opacity-50" : ""}`}
                title={!PPTX_EXPORT_ENABLED ? "Экспорт PPTX временно недоступен" : undefined}
              >
                <input
                  type="checkbox"
                  checked={formats.pptx}
                  disabled={!PPTX_EXPORT_ENABLED}
                  onChange={(e) => setFormats((f) => ({ ...f, pptx: e.target.checked }))}
                />
                PPTX
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formats.html} onChange={(e) => setFormats((f) => ({ ...f, html: e.target.checked }))} />
                HTML
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={formats.pdf} onChange={(e) => setFormats((f) => ({ ...f, pdf: e.target.checked }))} />
                PDF
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={showPrices} onChange={(e) => setShowPrices(e.target.checked)} />
                Показывать цены
              </label>
            </div>
          </div>
        </div>
      )}

      {step === GENERATION_STEP && (
        <div className="space-y-6">
          {generating && (
            <div className="flex items-center gap-3 rounded-xl border bg-card p-6">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div>
                <p className="font-medium">{presentation?.progressMessage ?? "Запуск генерации..."}</p>
                <p className="text-sm text-muted-foreground">
                  {presentation?.status ?? "queued"} — {presentation?.progress ?? 0}%
                </p>
              </div>
            </div>
          )}

          {presentation?.status === "failed" && (
            <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {presentation.error}
            </div>
          )}

          {presentation && (presentation.brandAnalysis || presentation.concept || presentation.productStories?.length) && (
            <details className="rounded-xl border border-border bg-card/50 p-4 text-sm">
              <summary className="cursor-pointer select-none font-medium">
                Как создавалась презентация
              </summary>
              <div className="mt-3 space-y-4">
                <p className="text-xs text-muted-foreground">
                  Создано: {new Date(presentation.createdAt).toLocaleString("ru-RU")}
                  {" · "}Обновлено: {new Date(presentation.updatedAt).toLocaleString("ru-RU")}
                  {" · "}AI-вызовов: {presentation.aiCalls}
                </p>

                {presentation.brandAnalysis && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      1. Анализ бренда
                    </p>
                    <p className="mt-1 font-medium">{presentation.brandAnalysis.brandName}</p>
                    <p className="text-muted-foreground">
                      Тон: {presentation.brandAnalysis.visualTone}
                      {presentation.brandAnalysis.brandPersonality?.length
                        ? ` · ${presentation.brandAnalysis.brandPersonality.join(", ")}`
                        : ""}
                    </p>
                    {presentation.brandAnalysis.designKeywords?.length ? (
                      <p className="text-muted-foreground">
                        Ключевые слова: {presentation.brandAnalysis.designKeywords.join(", ")}
                      </p>
                    ) : null}
                  </div>
                )}

                {presentation.concept && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      2. Концепция
                    </p>
                    <p className="mt-1 font-medium">{presentation.concept.presentationTitle}</p>
                    <p className="text-muted-foreground">{presentation.concept.bigIdea}</p>
                    <p className="text-muted-foreground">{presentation.concept.narrative}</p>
                  </div>
                )}

                {presentation.productStories?.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      3. Тексты товаров
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Сгенерированы описания и преимущества для {presentation.productStories.length}{" "}
                      товаров
                    </p>
                  </div>
                ) : null}

                {presentation.slides?.length ? (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      4. Слайды и картинки
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Собрано {presentation.slides.length} слайдов, {presentation.assets?.length ?? 0}{" "}
                      изображений
                    </p>
                  </div>
                ) : null}

                {Object.keys(presentation.outputs ?? {}).length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      5. Экспорт
                    </p>
                    <p className="mt-1 text-muted-foreground">
                      Готовые форматы: {Object.keys(presentation.outputs).map((k) => k.replace("Url", "")).join(", ")}
                    </p>
                  </div>
                )}
              </div>
            </details>
          )}

          {presentation?.slides && presentation.slides.length > 0 && (
            <div className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                {presentation.outputs.pptxUrl && (
                  PPTX_EXPORT_ENABLED ? (
                    <Button asChild size="sm">
                      <a href={presentation.outputs.pptxUrl} download>
                        <Download className="mr-2 h-4 w-4" />
                        PPTX
                      </a>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled
                      title="Экспорт PPTX временно недоступен"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      PPTX
                    </Button>
                  )
                )}
                {presentation.outputs.htmlUrl && (
                  <Button asChild variant="outline" size="sm">
                    <a href={presentation.outputs.htmlUrl} target="_blank" rel="noreferrer">
                      HTML Preview
                    </a>
                  </Button>
                )}
                {(presentation.outputs.pdfUrl || presentation.outputs.htmlUrl) && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    title={
                      presentation.outputs.pdfUrl?.endsWith(".pdf")
                        ? "Скачать PDF"
                        : "Откроется презентация — сохраните в PDF через печать (Ctrl+P → Сохранить как PDF)"
                    }
                  >
                    <a
                      href={presentation.outputs.pdfUrl || presentation.outputs.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      {...(presentation.outputs.pdfUrl?.endsWith(".pdf") ? { download: true } : {})}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      PDF
                    </a>
                  </Button>
                )}
              </div>

              {presentation.slides.map(renderSlideContent)}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" disabled={step === 0 || generating} onClick={() => setStep((s) => s - 1)}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Назад
        </Button>
        {step < 3 && (
          <Button onClick={() => setStep((s) => s + 1)}>
            Далее
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
        {step === 3 && (
          <Button onClick={handleGenerate}>
            <Wand2 className="mr-2 h-4 w-4" />
            Сгенерировать презентацию
          </Button>
        )}
        {step === GENERATION_STEP && !generating && presentation?.status === "completed" && (
          <Button
            variant="outline"
            onClick={() => {
              setStep(0);
              setJobId(null);
              setPresentation(null);
              setRegenPanelSlideId(null);
              onStartNew?.();
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Новая презентация
          </Button>
        )}
      </div>
    </div>
  );
}
