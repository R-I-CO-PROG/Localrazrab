"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Download, ExternalLink, FileText, Loader2, Plus, Presentation, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useProjectStore } from "@/store/project-store";
import { AiPresentationWizard } from "@/components/presentations/ai-presentation-wizard";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { cn } from "@/lib/utils";
import { PPTX_EXPORT_ENABLED } from "@/lib/constants";
import {
  matchesSearch,
  normalizeSearchQuery,
  sortByListKey,
  type ListSortKey,
} from "@/lib/list-search-sort";

const PRESENTATION_SORT_OPTIONS: ListSortKey[] = [
  "date-desc",
  "date-asc",
  "name-asc",
  "name-desc",
  "slides-desc",
];

type ProposalsTab = "library" | "create";

export function ProposalsHub() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const presentationIdParam = searchParams.get("presentationId");

  const presentations = useProjectStore((s) => s.presentations ?? []);
  const visualizations = useProjectStore((s) => s.visualizations ?? []);

  const readyPresentations = useMemo(
    () => presentations.filter((p) => p.status === "done"),
    [presentations],
  );
  const inProgressPresentations = useMemo(
    () => presentations.filter((p) => p.status === "generating"),
    [presentations],
  );

  const [tab, setTab] = useState<ProposalsTab>(
    tabParam === "create" || presentationIdParam ? "create" : "library",
  );
  const [openPresentationId, setOpenPresentationId] = useState<string | null>(
    presentationIdParam,
  );
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSortKey>("date-desc");

  const visibleReadyPresentations = useMemo(() => {
    const normalized = normalizeSearchQuery(query);
    const filtered = readyPresentations.filter((p) => matchesSearch(p.title, normalized));
    return sortByListKey(filtered, sort, {
      name: (p) => p.title,
      date: (p) => p.createdAt,
      slideCount: (p) => p.slideCount ?? 0,
    });
  }, [readyPresentations, query, sort]);

  useEffect(() => {
    if (tabParam === "create" || presentationIdParam) setTab("create");
    else if (tabParam === "library") setTab("library");
    if (presentationIdParam) setOpenPresentationId(presentationIdParam);
  }, [tabParam, presentationIdParam]);

  const isAiPresentation = (id: string, kind?: string) =>
    kind === "ai" || id.startsWith("pres-ai-");

  const openPresentationEditor = (id: string) => {
    setOpenPresentationId(id);
    setTab("create");
    router.replace(`/proposals?tab=create&presentationId=${encodeURIComponent(id)}`, {
      scroll: false,
    });
  };

  const clearPresentationEditor = () => {
    setOpenPresentationId(null);
    router.replace("/proposals?tab=create", { scroll: false });
  };

  const switchTab = (next: ProposalsTab) => {
    setTab(next);
    if (next === "create") {
      setOpenPresentationId(null);
      router.replace("/proposals?tab=create", { scroll: false });
    } else {
      setOpenPresentationId(null);
      router.replace("/proposals", { scroll: false });
    }
  };

  return (
    <div className="space-y-8 overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">КП и презентации</h1>
          <p className="mt-2 text-muted-foreground">
            Готовые коммерческие предложения и AI-генерация презентаций из ваших визуализаций
          </p>
        </div>
        {tab === "library" && (
          <Button className="gap-2" onClick={() => switchTab("create")}>
            <Plus className="h-4 w-4" />
            Создать КП
          </Button>
        )}
      </motion.div>

      <div className="inline-flex w-full max-w-full rounded-xl border border-border bg-secondary/40 p-1 sm:w-auto">
        <button
          type="button"
          onClick={() => switchTab("library")}
          className={cn(
            "min-w-0 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:flex-none sm:px-4",
            tab === "library"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="inline-flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0" />
            Готовые · {readyPresentations.length}
          </span>
        </button>
        <button
          type="button"
          onClick={() => switchTab("create")}
          className={cn(
            "min-w-0 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-all sm:flex-none sm:px-4",
            tab === "create"
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <span className="inline-flex items-center gap-2">
            <Sparkles className="h-4 w-4 shrink-0" />
            Создать
          </span>
        </button>
      </div>

      {tab === "library" ? (
        <motion.div
          key="library"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {inProgressPresentations.length > 0 && (
            <Card className="border-border/50 border-dashed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  В процессе генерации
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {inProgressPresentations.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3 text-sm"
                  >
                    <span className="truncate font-medium">{p.title}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      {isAiPresentation(p.id, p.kind) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openPresentationEditor(p.id)}
                        >
                          Открыть
                        </Button>
                      )}
                      <Badge variant="outline">Генерация…</Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {readyPresentations.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-20 text-center">
                <Presentation className="mb-4 h-12 w-12 text-muted-foreground/50" />
                <p className="max-w-md text-muted-foreground">
                  Пока нет готовых коммерческих предложений. Создайте презентацию из визуализаций
                  проекта — у вас {visualizations.length} визуализаций в библиотеке.
                </p>
                <Button className="mt-4 gap-2" onClick={() => switchTab("create")}>
                  <Sparkles className="h-4 w-4" />
                  Создать КП
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-border/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="h-5 w-5 text-primary" />
                  Готовые КП и презентации
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <ListToolbar
                  query={query}
                  onQueryChange={setQuery}
                  sort={sort}
                  onSortChange={setSort}
                  sortOptions={PRESENTATION_SORT_OPTIONS}
                  placeholder="Поиск по названию…"
                  filteredCount={visibleReadyPresentations.length}
                  totalCount={readyPresentations.length}
                />

                {visibleReadyPresentations.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border bg-secondary/10 px-4 py-10 text-center">
                    <p className="text-sm text-muted-foreground">
                      Ничего не найдено по запросу «{query}»
                    </p>
                    <Button className="mt-3" size="sm" variant="outline" onClick={() => setQuery("")}>
                      Сбросить поиск
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                {visibleReadyPresentations.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/20 p-4 transition-colors hover:border-primary/30 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">Готово</Badge>
                        {isAiPresentation(p.id, p.kind) && (
                          <Badge variant="outline">AI</Badge>
                        )}
                        {p.slideCount != null && (
                          <span className="text-xs text-muted-foreground">{p.slideCount} слайдов</span>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(p.createdAt).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      {isAiPresentation(p.id, p.kind) && (
                        <Button
                          size="sm"
                          variant="default"
                          className="gap-2"
                          onClick={() => openPresentationEditor(p.id)}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Открыть
                        </Button>
                      )}
                      {p.downloadUrl && (
                        PPTX_EXPORT_ENABLED ? (
                          <Button asChild size="sm" variant="outline" className="gap-2">
                            <a href={p.downloadUrl} download={p.fileName}>
                              <Download className="h-4 w-4" />
                              PPTX
                            </a>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2"
                            disabled
                            title="Экспорт PPTX временно недоступен"
                          >
                            <Download className="h-4 w-4" />
                            PPTX
                          </Button>
                        )
                      )}
                      {p.htmlUrl && (
                        <Button asChild size="sm" variant="outline" className="gap-2">
                          <a href={p.htmlUrl} target="_blank" rel="noreferrer">
                            HTML
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </motion.div>
      ) : (
        <motion.div
          key="create"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <AiPresentationWizard
            key={openPresentationId ?? "new"}
            embedded
            initialJobId={openPresentationId}
            onStartNew={clearPresentationEditor}
          />
        </motion.div>
      )}
    </div>
  );
}
