"use client";

import { motion } from "framer-motion";
import { Heart, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, conceptCountLabel, visualizationCountLabel } from "@/lib/utils";
import type { ProjectSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/store/project-store";

interface ProjectCardProps {
  project: ProjectSummary;
  index?: number;
  isFavorite?: boolean;
  onOpen: (projectId: string) => void;
  onToggleFavorite?: (projectId: string) => void;
  onDelete?: (projectId: string) => void;
}

export function ProjectCard({
  project,
  index = 0,
  isFavorite = false,
  onOpen,
  onToggleFavorite,
  onDelete,
}: ProjectCardProps) {
  const displayBudget = project.setTotalCost ?? project.budget;
  // После появления хотя бы одной визуализации показываем «N визуализаций», иначе «N концепций».
  const vizCount = useProjectStore((s) =>
    s.visualizations.filter(
      (v) =>
        v.projectId === project.id ||
        (project.requestId ? v.projectId === project.requestId : false),
    ).length,
  );
  const countLabel =
    vizCount > 0 ? visualizationCountLabel(vizCount) : conceptCountLabel(project.conceptsCount);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="group relative h-full"
    >
      <button
        type="button"
        onClick={() => onOpen(project.id)}
        className="h-full w-full text-left"
      >
        <Card className="h-full border-border/50 transition-all hover:border-primary/30 hover:shadow-glow-sm">
          <CardContent className="flex h-full min-h-[220px] flex-col p-6">
            <div className="min-h-[3.5rem] pr-16">
              {project.isForeignCopy && (
                <span className="mb-1 inline-block rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                  Проект {project.copiedFromEmail ?? "другого пользователя"}
                </span>
              )}
              <h3 className="line-clamp-2 font-semibold leading-snug transition-colors group-hover:text-primary">
                {project.title}
              </h3>
              {project.briefExcerpt && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{project.briefExcerpt}</p>
              )}
            </div>
            <div className="mt-4 flex min-w-0 items-end justify-between gap-3">
              <span
                className="min-w-0 truncate text-xl font-bold tabular-nums text-primary sm:text-2xl"
                title={formatCurrency(displayBudget)}
              >
                {formatCurrency(displayBudget)}
              </span>
              <span
                className="shrink-0 text-right text-base font-semibold tabular-nums text-muted-foreground sm:text-lg"
                title={countLabel}
              >
                {countLabel}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {new Date(project.createdAt).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <div className="mt-auto flex flex-wrap justify-end gap-2 pt-3">
              {(project.status === "completed" || project.resultImageUrl) && (
                <Badge className="text-xs bg-primary/90 text-primary-foreground">
                  Есть визуализация
                </Badge>
              )}
              <Badge variant="outline" className="text-xs capitalize">
                {{
                  completed: "Готово",
                  concepts: "Концепции",
                  generating: "Генерация",
                  failed: "Ошибка",
                  draft: "Черновик",
                }[project.status] ?? project.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </button>

      {onToggleFavorite && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(project.id);
          }}
          className={cn(
            "absolute right-12 top-3 flex h-8 w-8 items-center justify-center rounded-lg transition-all",
            isFavorite
              ? "text-red-500 opacity-100"
              : "text-muted-foreground opacity-0 hover:bg-secondary hover:text-foreground group-hover:opacity-100"
          )}
          title={isFavorite ? "Убрать из избранного" : "В избранное"}
        >
          <Heart className={cn("h-4 w-4", isFavorite && "fill-current")} />
        </button>
      )}

      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(project.id);
          }}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          title="Удалить проект"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </motion.div>
  );
}
