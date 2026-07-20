"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatsCards } from "@/components/dashboard/stats-cards";
import { RecentProjects } from "@/components/dashboard/recent-projects";
import { useProjectStore } from "@/store/project-store";

export default function DashboardPage() {
  const stats = useProjectStore((s) => s.stats);
  const projects = useProjectStore((s) => s.projects);

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Добро пожаловать.{" "}
            <span className="gradient-text">МЕРЦАЙ.</span>
          </h1>
          <p className="mt-2 text-muted-foreground">
            Создавайте концепции корпоративного мерча с помощью искусственного интеллекта
          </p>
        </div>
        <Button asChild size="lg">
          <Link href="/generate">
            <Sparkles className="h-5 w-5" />
            Новая генерация
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </motion.div>

      <StatsCards stats={stats} />
      <RecentProjects projects={projects} />
    </div>
  );
}
