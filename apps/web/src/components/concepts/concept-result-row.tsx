"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import type { ConceptItem, GeneratedConcept } from "@/lib/types";
import { visualizationMatchesProducts, visualizationMatchesConcept } from "@/lib/concept-product-ids";
import { CatalogPhotosGrid } from "@/components/concepts/catalog-photos-grid";
import { ImageLightbox, type LightboxImage } from "@/components/concepts/image-lightbox";
import { BudgetSpendIndicator } from "@/components/concepts/budget-spend-indicator";
import { useProjectStore } from "@/store/project-store";
import { cn } from "@/lib/utils";
import { displayCatalogImageSrc } from "@/lib/product-image";

interface ConceptResultRowProps {
  concept: GeneratedConcept;
  index?: number;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export function ConceptResultRow({
  concept,
  index = 0,
  selectMode = false,
  selected = false,
  onToggleSelect,
}: ConceptResultRowProps) {
  const visualization = useProjectStore((s) =>
    concept.id ? s.visualizations.find((v) => v.conceptId === concept.id) : undefined,
  );
  const session = useProjectStore((s) =>
    concept.id ? s.conceptRenderSessions[concept.id] : undefined,
  );
  const generationInput = useProjectStore((s) =>
    session?.requestId ? s.getGenerationInput(session.requestId) : undefined,
  );
  const currentProductIds = concept.items.map((it) => it.id).filter(Boolean) as string[];
  const vizProductIds = visualization?.generatedProductIds ?? concept.visualizationProductIds;
  const isCatalogConcept = generationInput?.generationMode === "catalog";
  const vizIsCurrent =
    visualization?.imageUrl &&
    visualization?.sourceImagePath &&
    !concept.visualizationOutdated &&
    visualizationMatchesConcept(visualization.chosenIdeaTitle, session?.chosenIdeaTitle) &&
    (isCatalogConcept
      ? visualizationMatchesProducts(vizProductIds, currentProductIds)
      : true);
  const visualizationSrc = vizIsCurrent ? visualization!.imageUrl : null;
  const productNames = concept.items.map((item) => item.name).filter(Boolean);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<LightboxImage[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openCatalogImage = useCallback((index: number, items: ConceptItem[]) => {
    const images = items
      .filter((it) => it.imageUrl)
      .map((it) => ({ src: displayCatalogImageSrc(it.imageUrl!), alt: it.name }));
    setLightboxImages(images);
    setLightboxIndex(index);
    setLightboxOpen(true);
  }, []);

  const leftPanel = (
    <div className="flex shrink-0 flex-col border-border/40 p-4 lg:w-[min(50%,460px)] lg:border-r">
      {visualizationSrc ? (
        <div className="relative aspect-[4/3] min-h-[280px] overflow-hidden rounded-xl bg-secondary/30">
          <Image
            src={visualizationSrc}
            alt={concept.name}
            fill
            className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            sizes="(max-width: 1024px) 100vw, 420px"
            unoptimized
          />
          <Badge className="absolute left-3 top-3 bg-primary/90 text-primary-foreground">
            Есть визуализация
          </Badge>
        </div>
      ) : isCatalogConcept ? (
        <div className="h-[380px] overflow-hidden rounded-xl bg-secondary/30">
          <CatalogPhotosGrid
            items={concept.items}
            layout="showcase"
            onImageClick={openCatalogImage}
          />
        </div>
      ) : (
        <div className="flex min-h-[280px] flex-col justify-center gap-1.5 rounded-xl bg-gray-50 p-4 dark:bg-gray-800/50">
          <span className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
            Состав набора
          </span>
          {productNames.map((name, i) => (
            <div
              key={`${name}-${i}`}
              className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-purple-100 text-xs font-medium text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                {i + 1}
              </span>
              <span className="truncate">{name}</span>
            </div>
          ))}
          {productNames.length === 0 && (
            <span className="text-sm italic text-gray-400">Товары подбираются…</span>
          )}
        </div>
      )}
    </div>
  );

  const rightPanel = (
    <CardContent className="flex flex-1 flex-col justify-center p-5 lg:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl font-semibold transition-colors group-hover:text-primary">
            {concept.name}
          </h3>
          {isCatalogConcept && concept.totalCost > 0 && (concept.budgetPerSet ?? generationInput?.budget) ? (
            <div className="mt-2">
              <BudgetSpendIndicator
                budgetPerSet={concept.budgetPerSet ?? generationInput!.budget}
                spent={concept.totalCost}
                compact
              />
            </div>
          ) : isCatalogConcept && concept.totalCost > 0 ? (
            <p className="mt-1 text-2xl font-bold text-primary">
              {formatCurrency(concept.totalCost)}
            </p>
          ) : null}
        </div>
        {isCatalogConcept && (
          <Badge variant="secondary" className="shrink-0">
            {concept.items.length} товаров
          </Badge>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {concept.tags.slice(0, 4).map((tag) => (
          <Badge key={tag} variant="outline" className="text-xs">
            {tag}
          </Badge>
        ))}
      </div>

      {!isCatalogConcept && concept.description && (
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          {concept.description.split("\n\n")[0]}
        </p>
      )}
    </CardContent>
  );

  const card = (
    <Card
      className={cn(
        "group overflow-hidden border-border/50 bg-card/50 transition-all duration-300 hover:border-primary/30 hover:shadow-glow-sm",
        selectMode && selected && "ring-2 ring-primary",
      )}
    >
      <div className="flex flex-col lg:flex-row">
        {leftPanel}
        {selectMode ? (
          <button type="button" onClick={onToggleSelect} className="flex flex-1 text-left">
            {rightPanel}
          </button>
        ) : (
          <Link href={`/concepts/detail/${concept.id}`} className="flex flex-1">
            {rightPanel}
          </Link>
        )}
      </div>
    </Card>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      className="relative"
    >
      {selectMode && concept.id && (
        <label className="absolute left-4 top-4 z-10 flex cursor-pointer items-center gap-2 rounded-lg bg-background/90 px-2 py-1 text-xs shadow-sm">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.preventDefault();
              onToggleSelect?.();
            }}
            className="accent-primary"
          />
          Выбрать
        </label>
      )}
      {card}
      <ImageLightbox
        images={lightboxImages}
        index={lightboxIndex}
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        onIndexChange={setLightboxIndex}
      />
    </motion.div>
  );
}
