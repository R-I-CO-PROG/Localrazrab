"use client";

import { motion } from "framer-motion";
import { FolderKanban, Sparkles, Wallet, Coins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatNumber } from "@/lib/utils";
import type { DashboardStats } from "@/lib/types";

interface StatsCardsProps {
  stats: DashboardStats;
}

const statConfig = [
  {
    key: "totalProjects" as const,
    label: "Всего проектов",
    icon: FolderKanban,
    format: (v: number) => formatNumber(v),
  },
  {
    key: "totalConcepts" as const,
    label: "Сгенерировано концепций",
    icon: Sparkles,
    format: (v: number) => formatNumber(v),
  },
  {
    key: "averageBudget" as const,
    label: "Средний бюджет",
    icon: Wallet,
    format: (v: number) => formatCurrency(v),
  },
  {
    key: "creditsUsed" as const,
    label: "Использовано кредитов",
    icon: Coins,
    format: (v: number) => formatNumber(v),
  },
];

export function StatsCards({ stats }: StatsCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {statConfig.map((stat, i) => {
        const Icon = stat.icon;
        return (
          <motion.div
            key={stat.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.4 }}
          >
            <Card className="group relative overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-glow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className="mt-2 text-3xl font-bold tracking-tight">
                      {stat.format(stats[stat.key])}
                    </p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
