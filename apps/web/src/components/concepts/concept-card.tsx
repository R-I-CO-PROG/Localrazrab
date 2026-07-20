"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Package, ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { ConceptPreview, conceptPreviewFromGenerated } from "@/components/ConceptPreview/ConceptPreview";
import type { GeneratedConcept } from "@/lib/types";
import { visualizationMatchesProducts, visualizationMatchesConcept } from "@/lib/concept-product-ids";
import { catalogProductPhotos } from "@/lib/catalog-set-sync";
import { useProjectStore } from "@/store/project-store";

interface ConceptCardProps {
  concept: GeneratedConcept;
  index?: number;
}

export function ConceptCard({ concept, index = 0 }: ConceptCardProps) {
  const visualization = useProjectStore((s) =>
    concept.id ? s.visualizations.find((v) => v.conceptId === concept.id) : undefined
  );
  const session = useProjectStore((s) =>
    concept.id ? s.conceptRenderSessions[concept.id] : undefined,
  );
  const generationInput = useProjectStore((s) =>
    session?.requestId ? s.getGenerationInput(session.requestId) : undefined,
  );
  const catalogPhotos = catalogProductPhotos(concept);
  const currentProductIds = concept.items.map((it) => it.id).filter(Boolean) as string[];
  const vizProductIds =
    visualization?.generatedProductIds ?? concept.visualizationProductIds;
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
  const showCreativeSchematic = !isCatalogConcept && !visualizationSrc && catalogPhotos.length === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
    >
      <Link href={`/concepts/detail/${concept.id}`}>
        <Card className="group overflow-hidden border-border/50 bg-card/50 transition-all duration-300 hover:border-primary/30 hover:shadow-glow-sm">
          <div className="relative aspect-square overflow-hidden bg-secondary/30">
            {visualizationSrc ? (
              <Image
                src={visualizationSrc}
                alt={concept.name}
                fill
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                sizes="(max-width: 768px) 100vw, 33vw"
                unoptimized
              />
            ) : showCreativeSchematic ? (
              <ConceptPreview
                {...conceptPreviewFromGenerated(concept, generationInput?.colors ?? [])}
                size="sm"
                showPalette={false}
                className="h-full min-h-0 rounded-none border-0 shadow-none"
              />
            ) : catalogPhotos.length > 0 ? (
              <div
                className={`grid h-full w-full gap-0.5 p-1 ${
                  catalogPhotos.length === 1
                    ? "grid-cols-1"
                    : catalogPhotos.length === 2
                      ? "grid-cols-2"
                      : catalogPhotos.length <= 4
                        ? "grid-cols-2"
                        : "grid-cols-3"
                }`}
              >
                {catalogPhotos.map((src, i) => (
                  <div
                    key={`${src}-${i}`}
                    className="relative min-h-0 overflow-hidden rounded-sm bg-background/50"
                  >
                    <Image
                      src={src}
                      alt=""
                      fill
                      className="object-contain p-1 transition-transform duration-500 group-hover:scale-105"
                      sizes="120px"
                      unoptimized
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                <Package className="h-14 w-14 opacity-30" />
                <span className="flex items-center gap-1 text-xs opacity-60">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Визуализация не создана
                </span>
              </div>
            )}
            {vizIsCurrent && (
              <Badge className="absolute left-3 top-3 bg-primary/90 text-primary-foreground">
                Есть визуализация
              </Badge>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold group-hover:text-primary transition-colors">
                  {concept.name}
                </h3>
                {isCatalogConcept && concept.totalCost > 0 && (
                  <p className="mt-1 text-lg font-bold text-primary">
                    {formatCurrency(concept.totalCost)}
                  </p>
                )}
              </div>
              {isCatalogConcept && (
                <Badge variant="secondary" className="shrink-0">
                  {concept.items.length} товаров
                </Badge>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {concept.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
            {concept.description && (
              <p className="mt-3 line-clamp-3 text-xs text-muted-foreground leading-relaxed">
                {concept.description.split("\n\n")[0]}
              </p>
            )}
          </CardContent>
        </Card>
      </Link>
    </motion.div>
  );
}
