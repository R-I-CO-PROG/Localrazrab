"use client";

import { useState } from "react";
import { Loader2, Presentation, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useProjectStore } from "@/store/project-store";
import { notify } from "@/lib/notify";
import type { ConceptVisualization, GeneratedConcept } from "@/lib/types";
import { filterBlacklistedProducts } from "@/lib/blacklist-client";
import { createDefaultBrandPalette } from "@/lib/brand-palette";
import { resolveImageUrlForServer } from "@/lib/presentation/resolve-image-url";
import { enrichConceptItemsWithCatalogImages } from "@/lib/presentation-ai/enrich-catalog-item-images";

interface PresentationCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedVisualizationIds: string[];
  visualizations: ConceptVisualization[];
  concepts: GeneratedConcept[];
  projectTitle?: string;
  projectId?: string;
}

export function PresentationCreateDialog({
  open,
  onOpenChange,
  selectedVisualizationIds,
  visualizations,
  concepts,
  projectTitle,
  projectId,
}: PresentationCreateDialogProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const brandPalette = useProjectStore((s) => s.brandPalette ?? createDefaultBrandPalette());
  const blacklistItems = useProjectStore((s) => s.blacklistItems ?? []);
  const addPresentation = useProjectStore((s) => s.addPresentation);
  const updatePresentation = useProjectStore((s) => s.updatePresentation);
  const brandLibrary = useProjectStore((s) => s.brandLibrary);
  const logo = brandLibrary.find((f) => f.fileType === "LOGO");

  if (!open) return null;

  const selected = visualizations.filter((v) => selectedVisualizationIds.includes(v.id));

  async function handleGenerate() {
    if (prompt.trim().length < 8) {
      notify.error("Опишите презентацию подробнее (минимум 8 символов)");
      return;
    }
    if (selected.length === 0) {
      notify.error("Выберите хотя бы одну визуализацию");
      return;
    }

    const presentationId = `pres-${Date.now()}`;
    addPresentation({
      id: presentationId,
      kind: "legacy",
      title: projectTitle ?? "Презентация Mercai",
      prompt: prompt.trim(),
      projectId,
      visualizationIds: selectedVisualizationIds,
      status: "generating",
      createdAt: new Date().toISOString(),
    });

    setLoading(true);
    try {
      const payloadVisualizations = await Promise.all(
        selected.map(async (viz) => {
          const concept = concepts.find((c) => c.id === viz.conceptId);
          const rawItems = filterBlacklistedProducts(concept?.items ?? [], blacklistItems);
          const enrichedItems = enrichConceptItemsWithCatalogImages(concept, rawItems);
          const items = enrichedItems.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            price: item.price,
            imageUrl: item.imageUrl,
          }));
          const itemsWithImages = await Promise.all(
            items.map(async (item) => ({
              ...item,
              imageUrl: item.imageUrl ? await resolveImageUrlForServer(item.imageUrl) : undefined,
            })),
          );
          return {
            id: viz.id,
            conceptName: viz.conceptName,
            imageUrl: await resolveImageUrlForServer(viz.imageUrl),
            description: concept?.description,
            isCatalog: (concept?.catalogProductIds?.length ?? items.length) > 0,
            items: itemsWithImages,
          };
        }),
      );

      let logoDataUrl: string | undefined;
      if (logo?.url && logo.type.startsWith("image/")) {
        try {
          const res = await fetch(logo.url);
          const blob = await res.blob();
          logoDataUrl = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } catch {
          // optional logo
        }
      }

      const res = await fetch("/api/presentations/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: projectTitle ?? "Презентация Mercai",
          prompt: prompt.trim(),
          projectId,
          visualizationIds: selectedVisualizationIds,
          visualizations: payloadVisualizations,
          brand: brandPalette,
          logoDataUrl,
        }),
      });

      const raw = await res.text();
      let data: { error?: string; downloadUrl?: string; fileName?: string; slideCount?: number };
      try {
        data = JSON.parse(raw) as typeof data;
      } catch {
        throw new Error(
          raw.trimStart().startsWith("<")
            ? "Сервер вернул ошибку (HTML). Попробуйте ещё раз через минуту."
            : raw.slice(0, 200) || "Ошибка генерации",
        );
      }
      if (!res.ok) {
        throw new Error(data.error ?? "Ошибка генерации");
      }

      updatePresentation(presentationId, {
        status: "done",
        downloadUrl: data.downloadUrl,
        fileName: data.fileName,
        slideCount: data.slideCount,
      });

      notify.success(`Премиальная презентация готова (${data.slideCount} слайдов)`);
      onOpenChange(false);
      setPrompt("");

      if (data.downloadUrl) {
        window.open(data.downloadUrl, "_blank");
      }
    } catch (error) {
      updatePresentation(presentationId, {
        status: "failed",
        error: error instanceof Error ? error.message : "Ошибка",
      });
      notify.error(error instanceof Error ? error.message : "Не удалось создать презентацию");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 sm:items-center sm:p-4">
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-background p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="presentation-dialog-title"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="presentation-dialog-title" className="text-lg font-semibold">
              Создать презентацию
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Выбрано визуализаций: {selected.length}. Будет создана премиальная AI-презентация (тёмный стиль, AI-визуалы).
            </p>
          </div>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-3">
          <Label htmlFor="presentation-prompt">Промт для презентации</Label>
          <Textarea
            id="presentation-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value.slice(0, 2000))}
            placeholder="Опишите, какую презентацию нужно подготовить: стиль, акценты, аудитория, структура, количество слайдов..."
            className="min-h-[140px] resize-none"
            disabled={loading}
          />
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Отмена
          </Button>
          <Button type="button" onClick={() => void handleGenerate()} disabled={loading} className="gap-2">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI генерирует концепцию, тексты и визуалы…
              </>
            ) : (
              <>
                <Presentation className="h-4 w-4" />
                Создать презентацию
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
