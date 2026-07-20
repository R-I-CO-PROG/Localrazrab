"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { ImageIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListToolbar } from "@/components/ui/list-toolbar";
import { useProjectStore } from "@/store/project-store";
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

export default function VisualizationsPage() {
  const visualizations = useProjectStore((s) => s.visualizations);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSortKey>("date-desc");

  const visibleVisualizations = useMemo(() => {
    const normalized = normalizeSearchQuery(query);
    const filtered = visualizations.filter((viz) =>
      matchesSearch(viz.conceptName, normalized),
    );
    return sortByListKey(filtered, sort, {
      name: (viz) => viz.conceptName,
      date: (viz) => viz.createdAt,
    });
  }, [visualizations, query, sort]);

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight">Визуализации</h1>
        <p className="mt-2 text-muted-foreground">
          Созданные вручную AI-изображения наборов · {visualizations.length}
        </p>
      </motion.div>

      {visualizations.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <ImageIcon className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center max-w-md">
              Здесь появятся визуализации, которые вы создадите вручную.
              Откройте любую концепцию и нажмите «Создать визуализацию».
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link href="/concepts">К проектам</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <ListToolbar
            query={query}
            onQueryChange={setQuery}
            sort={sort}
            onSortChange={setSort}
            sortOptions={VIZ_SORT_OPTIONS}
            placeholder="Поиск по названию концепции…"
            filteredCount={visibleVisualizations.length}
            totalCount={visualizations.length}
          />

          {visibleVisualizations.length === 0 ? (
            <Card className="border-border/50">
              <CardContent className="flex flex-col items-center justify-center py-16">
                <p className="text-muted-foreground">Ничего не найдено по запросу «{query}»</p>
                <Button className="mt-4" variant="outline" onClick={() => setQuery("")}>
                  Сбросить поиск
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {visibleVisualizations.map((viz, i) => (
                <motion.div
                  key={viz.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: Math.min(i * 0.05, 0.3) }}
                >
                  <Link href={`/concepts/detail/${viz.conceptId}`}>
                    <Card className="overflow-hidden border-border/50 group">
                      <div className="relative aspect-square">
                        <Image
                          src={viz.imageUrl}
                          alt={viz.conceptName}
                          fill
                          className="object-cover transition-transform duration-500 group-hover:scale-105"
                          sizes="(max-width: 768px) 100vw, 33vw"
                        />
                      </div>
                      <CardContent className="p-4">
                        <h3 className="font-semibold group-hover:text-primary transition-colors">
                          {viz.conceptName}
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {new Date(viz.createdAt).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                          })}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
