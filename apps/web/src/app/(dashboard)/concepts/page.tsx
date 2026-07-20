"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Plus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectCard } from "@/components/projects/project-card";
import { useProjectStore } from "@/store/project-store";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { cn } from "@/lib/utils";
import { notify } from "@/lib/notify";
import {
  matchesSearch,
  normalizeSearchQuery,
  sortByListKey,
  type ListSortKey,
} from "@/lib/list-search-sort";
import type { ProjectSummary } from "@/lib/types";

const PROJECT_SORT_OPTIONS: ListSortKey[] = [
  "date-desc",
  "date-asc",
  "name-asc",
  "name-desc",
  "concepts-desc",
  "budget-desc",
];

type ProjectTab = "creative" | "catalog";

/** Режим проекта с fallback для старых записей (по умолчанию — каталог) */
function projectMode(p: ProjectSummary): ProjectTab {
  return p.generationMode === "creative" ? "creative" : "catalog";
}

export default function ConceptsPage() {
  const router = useRouter();
  const {
    projects,
    deleteProject,
    loadProjectConcepts,
    toggleFavoriteProject,
    favoriteProjectIds,
  } = useProjectStore();

  const [tab, setTab] = useState<ProjectTab>("catalog");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSortKey>("date-desc");

  const creativeProjects = useMemo(
    () => projects.filter((p) => projectMode(p) === "creative"),
    [projects],
  );
  const catalogProjects = useMemo(
    () => projects.filter((p) => projectMode(p) === "catalog"),
    [projects],
  );
  const tabProjects = tab === "creative" ? creativeProjects : catalogProjects;

  const visibleProjects = useMemo(() => {
    const normalized = normalizeSearchQuery(query);
    const filtered = tabProjects.filter(
      (p) =>
        matchesSearch(p.title, normalized) ||
        matchesSearch(p.briefExcerpt, normalized) ||
        matchesSearch(p.category, normalized),
    );
    return sortByListKey(filtered, sort, {
      name: (p) => p.title,
      date: (p) => p.updatedAt ?? p.createdAt,
      conceptsCount: (p) => p.conceptsCount,
      budget: (p) => p.setTotalCost ?? p.budget,
    });
  }, [tabProjects, query, sort]);

  const handleDelete = (projectId: string) => {
    notify.confirm("Удалить этот проект?", {
      description: "Проект и связанные концепции будут удалены из списка.",
      onConfirm: () => {
        deleteProject(projectId);
        notify.success("Проект удалён");
      },
    });
  };

  const openProject = (projectId: string) => {
    loadProjectConcepts(projectId);
    router.push("/concepts/results");
  };

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Мои проекты</h1>
          <p className="mt-2 text-muted-foreground">
            Все ваши проекты с сгенерированными концепциями
          </p>
        </div>
        <Button asChild>
          <Link href="/generate">
            <Plus className="h-4 w-4" />
            Новый проект
          </Link>
        </Button>
      </motion.div>

      {projects.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">У вас пока нет проектов</p>
            <Button asChild className="mt-4">
              <Link href="/generate">Создать первый проект</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="inline-flex w-full max-w-full rounded-xl border border-border bg-secondary/40 p-1 sm:w-auto">
            <button
              type="button"
              onClick={() => setTab("catalog")}
              className={cn(
                "min-w-0 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:flex-none sm:px-4",
                tab === "catalog"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              С каталогом · {catalogProjects.length}
            </button>
            <button
              type="button"
              onClick={() => setTab("creative")}
              className={cn(
                "min-w-0 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:flex-none sm:px-4",
                tab === "creative"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Креативные · {creativeProjects.length}
            </button>
          </div>

          <ListToolbar
            query={query}
            onQueryChange={setQuery}
            sort={sort}
            onSortChange={setSort}
            sortOptions={PROJECT_SORT_OPTIONS}
            placeholder="Поиск по названию, категории…"
            filteredCount={visibleProjects.length}
            totalCount={tabProjects.length}
          />

          {tabProjects.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <FolderOpen className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground">
                  {tab === "creative"
                    ? "Пока нет креативных проектов"
                    : "Пока нет проектов с каталогом"}
                </p>
              </CardContent>
            </Card>
          ) : visibleProjects.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <p className="text-muted-foreground">Ничего не найдено по запросу «{query}»</p>
                <Button className="mt-4" variant="outline" onClick={() => setQuery("")}>
                  Сбросить поиск
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProjects.map((project, i) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  index={i}
                  isFavorite={favoriteProjectIds.includes(project.id)}
                  onOpen={openProject}
                  onToggleFavorite={toggleFavoriteProject}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
