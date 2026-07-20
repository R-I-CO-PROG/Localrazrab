"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ImageIcon, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { cn } from "@/lib/utils";
import { assetUrl } from "@/lib/asset-url";
import type { ConceptVisualization } from "@/lib/types";
import { selectionOrderNumber } from "@/lib/ordered-selection";
import {
  matchesSearch,
  normalizeSearchQuery,
  sortByListKey,
  type ListSortKey,
} from "@/lib/list-search-sort";

const VIZ_SORT_OPTIONS: ListSortKey[] = [
  "date-desc",
  "date-asc",
  "name-asc",
  "name-desc",
];

function visualizationImageSrc(url: string): string {
  if (url.startsWith("blob:") || url.startsWith("data:") || url.startsWith("http")) {
    return url;
  }
  return assetUrl(url);
}

interface VisualizationSourceStepProps {
  visualizations: ConceptVisualization[];
  projects: Array<{ id: string; title: string }>;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onImport: () => void;
  importing?: boolean;
}

export function VisualizationSourceStep({
  visualizations,
  projects,
  selectedIds,
  onToggle,
  onImport,
  importing = false,
}: VisualizationSourceStepProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSortKey>("date-desc");

  const projectTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) map.set(p.id, p.title);
    map.set("general", "Общие");
    return map;
  }, [projects]);

  const visibleVisualizations = useMemo(() => {
    const normalized = normalizeSearchQuery(query);
    const filtered = visualizations.filter((viz) => {
      const projectTitle = viz.projectId
        ? (projectTitleById.get(viz.projectId) ?? "")
        : "";
      return (
        matchesSearch(viz.conceptName, normalized) || matchesSearch(projectTitle, normalized)
      );
    });
    return sortByListKey(filtered, sort, {
      name: (viz) => viz.conceptName,
      date: (viz) => viz.createdAt,
    });
  }, [visualizations, query, sort, projectTitleById]);

  if (visualizations.length === 0) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <ImageIcon className="mx-auto h-10 w-10 text-muted-foreground/50" />
        <p className="mt-3 text-sm text-muted-foreground">
          Пока нет визуализаций. Сгенерируйте их в концепциях или заполните бренд и товары вручную на
          следующих шагах.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 rounded-xl border bg-card p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Выберите визуализации — товары подставятся на вкладку «Товары», бренд — по кнопке ниже
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Выбрано: {selectedIds.length} из {visualizations.length}
          </p>
        </div>
        <Button
          onClick={onImport}
          disabled={selectedIds.length === 0 || importing}
          className="gap-2 shrink-0"
        >
          {importing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Импортируем…
            </>
          ) : (
            "Применить к презентации"
          )}
        </Button>
      </div>

      <ListToolbar
        query={query}
        onQueryChange={setQuery}
        sort={sort}
        onSortChange={setSort}
        sortOptions={VIZ_SORT_OPTIONS}
        placeholder="Поиск по концепции или проекту…"
        filteredCount={visibleVisualizations.length}
        totalCount={visualizations.length}
      />

      {visibleVisualizations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-secondary/10 px-4 py-10 text-center">
          <p className="text-sm text-muted-foreground">Ничего не найдено по запросу «{query}»</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => setQuery("")}>
            Сбросить поиск
          </Button>
        </div>
      ) : (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visibleVisualizations.map((viz) => {
          const order = selectionOrderNumber(selectedIds, viz.id);
          const selected = order != null;
          const projectTitle = viz.projectId
            ? (projectTitleById.get(viz.projectId) ?? "Проект")
            : null;

          return (
            <button
              key={viz.id}
              type="button"
              onClick={() => onToggle(viz.id)}
              className={cn(
                "group relative overflow-hidden rounded-xl border text-left transition-all",
                selected
                  ? "border-primary ring-2 ring-primary/30"
                  : "border-border hover:border-primary/40",
              )}
            >
              <div className="relative aspect-[4/3] bg-muted">
                <Image
                  src={visualizationImageSrc(viz.imageUrl)}
                  alt={viz.conceptName}
                  fill
                  className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  unoptimized
                />
                {selected && (
                  <div className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow">
                    {order}
                  </div>
                )}
              </div>
              <div className="space-y-1 p-3">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{viz.conceptName}</p>
                {projectTitle && (
                  <Badge variant="outline" className="max-w-full truncate text-[10px]">
                    {projectTitle}
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>
      )}
    </div>
  );
}
