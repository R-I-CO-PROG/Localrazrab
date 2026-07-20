"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Trash2, Sparkles, User } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TaskTemplate } from "@/lib/types";
import { useProjectStore } from "@/store/project-store";
import { notify } from "@/lib/notify";

interface TemplateCardProps {
  template: TaskTemplate;
  index?: number;
}

export function TemplateCard({ template, index = 0 }: TemplateCardProps) {
  const { applyTemplate, deleteCustomTemplate } = useProjectStore();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className="group relative h-full border-border/50 transition-all hover:border-primary/30">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              {template.isSystem ? (
                <Sparkles className="h-4 w-4 text-primary" />
              ) : (
                <User className="h-4 w-4 text-muted-foreground" />
              )}
              <Badge variant={template.isSystem ? "default" : "secondary"} className="text-[10px]">
                {template.isSystem ? "Системный" : "Мой"}
              </Badge>
            </div>
            <Badge variant="outline">
              {template.budget.toLocaleString("ru-RU")} ₽
            </Badge>
          </div>
          <CardTitle className="text-lg">{template.name}</CardTitle>
          <CardDescription className="line-clamp-2">{template.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-1">
            {template.allowedItems.slice(0, 3).map((item) => (
              <Badge key={item} variant="outline" className="text-[10px]">
                {item}
              </Badge>
            ))}
          </div>
          <Button
            className="w-full"
            variant="secondary"
            asChild
            onClick={() => applyTemplate(template)}
          >
            <Link href="/generate">
              Использовать
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
        {!template.isSystem && (
          <button
            type="button"
            onClick={() => {
              notify.confirm("Удалить шаблон?", {
                onConfirm: () => {
                  deleteCustomTemplate(template.id);
                  notify.success("Шаблон удалён");
                },
              });
            }}
            className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-all hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </Card>
    </motion.div>
  );
}
