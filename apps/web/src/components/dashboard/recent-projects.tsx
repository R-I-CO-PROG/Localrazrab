"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, conceptCountLabel } from "@/lib/utils";
import type { ProjectSummary } from "@/lib/types";
import { getCategoryLabel } from "@/lib/category-utils";
import { useProjectStore } from "@/store/project-store";

interface RecentProjectsProps {
  projects: ProjectSummary[];
}

export function RecentProjects({ projects }: RecentProjectsProps) {
  const router = useRouter();
  const loadProjectConcepts = useProjectStore((s) => s.loadProjectConcepts);

  const openProject = (projectId: string) => {
    loadProjectConcepts(projectId);
    router.push("/concepts/results");
  };

  if (projects.length === 0) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardContent className="flex flex-col items-center justify-center py-16">
          <p className="text-muted-foreground">Пока нет проектов</p>
          <Button asChild className="mt-4">
            <Link href="/generate">Создать первый проект</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Последние проекты</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/concepts">
            Все проекты
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {projects.slice(0, 5).map((project, i) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <button
                type="button"
                onClick={() => openProject(project.id)}
                className="flex w-full items-center justify-between rounded-xl border border-border/50 p-4 text-left transition-all duration-200 hover:border-primary/30 hover:bg-secondary/30"
              >
                <div className="space-y-1">
                  <p className="font-medium">{project.title}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{getCategoryLabel(project.category)}</Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(project.createdAt).toLocaleDateString("ru-RU")}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold">
                    {formatCurrency(project.setTotalCost ?? project.budget)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {conceptCountLabel(project.conceptsCount)}
                  </p>
                </div>
              </button>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
