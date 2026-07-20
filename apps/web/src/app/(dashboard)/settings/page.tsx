"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { SettingsProfileCard } from "@/components/settings/settings-profile-card";
import { AdminSettingsLink } from "@/components/admin/admin-settings-link";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useAuthStatus } from "@/components/auth/auth-status-context";
import { useDbUser } from "@/hooks/use-db-user";
import { PLANS } from "@/lib/constants";
import { useProjectStore } from "@/store/project-store";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { BlacklistPanel } from "@/components/blacklist/blacklist-panel";
import { Check, Zap } from "lucide-react";

export default function SettingsPage() {
  const stats = useProjectStore((s) => s.stats);
  const { authConfigured, authenticated } = useAuthStatus();
  const dbUser = useDbUser(authConfigured && authenticated);
  const creditsRemaining = dbUser?.credits ?? stats.creditsRemaining;

  return (
    <div className="space-y-8 max-w-4xl">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-3xl font-bold tracking-tight">Настройки</h1>
        <p className="mt-2 text-muted-foreground">
          Управление аккаунтом и подпиской
        </p>
      </motion.div>

      <SettingsProfileCard />

      <BlacklistPanel />

      <AdminSettingsLink />

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Внешний вид</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div>
            <p className="font-medium">Тема оформления</p>
            <p className="text-sm text-muted-foreground">Тёмная тема по умолчанию</p>
          </div>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Кредиты</CardTitle>
          <CardDescription>Использование кредитов в текущем периоде</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-secondary/50 p-4">
              <p className="text-sm text-muted-foreground">Осталось</p>
              <p className="text-2xl font-bold text-primary">
                {formatNumber(creditsRemaining)}
              </p>
            </div>
            <div className="rounded-xl bg-secondary/50 p-4">
              <p className="text-sm text-muted-foreground">Использовано</p>
              <p className="text-2xl font-bold">
                {formatNumber(stats.creditsUsed)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">Тарифные планы</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {PLANS.map((plan) => (
            <Card
              key={plan.id}
              className={`border-border/50 relative ${
                "popular" in plan && plan.popular
                  ? "border-primary/50 shadow-glow-sm"
                  : ""
              }`}
            >
              {"popular" in plan && plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="shadow-glow-sm">
                    <Zap className="h-3 w-3 mr-1" />
                    Популярный
                  </Badge>
                </div>
              )}
              <CardHeader>
                <CardTitle>{plan.name}</CardTitle>
                <div className="mt-2">
                  {plan.price ? (
                    <span className="text-3xl font-bold">
                      {formatCurrency(plan.price)}
                      <span className="text-sm font-normal text-muted-foreground">/мес</span>
                    </span>
                  ) : (
                    <span className="text-2xl font-bold">По запросу</span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Separator className="my-4" />
                <Button
                  className="w-full"
                  variant={"popular" in plan && plan.popular ? "default" : "outline"}
                >
                  {plan.id === "ENTERPRISE" ? "Связаться" : "Выбрать план"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
