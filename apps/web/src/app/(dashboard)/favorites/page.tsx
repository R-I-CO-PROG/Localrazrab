"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectCard } from "@/components/projects/project-card";
import { useProjectStore } from "@/store/project-store";

export default function FavoritesPage() {
  const router = useRouter();
  const {
    projects,
    favoriteProjectIds,
    loadProjectConcepts,
    toggleFavoriteProject,
  } = useProjectStore();

  const favoriteProjects = projects.filter((p) =>
    favoriteProjectIds.includes(p.id)
  );

  const openProject = (projectId: string) => {
    loadProjectConcepts(projectId);
    router.push("/concepts/results");
  };

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight">Избранное</h1>
        <p className="mt-2 text-muted-foreground">
          Сохранённые проекты · {favoriteProjects.length}
        </p>
      </motion.div>

      {favoriteProjects.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-20">
            <Heart className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground text-center max-w-sm">
              Нажмите на сердечко на карточке проекта в разделе «Мои проекты»,
              чтобы добавить его в избранное
            </p>
            <Button asChild className="mt-4" variant="outline">
              <Link href="/concepts">К проектам</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {favoriteProjects.map((project, i) => (
            <ProjectCard
              key={project.id}
              project={project}
              index={i}
              isFavorite={favoriteProjectIds.includes(project.id)}
              onOpen={openProject}
              onToggleFavorite={toggleFavoriteProject}
            />
          ))}
        </div>
      )}
    </div>
  );
}
