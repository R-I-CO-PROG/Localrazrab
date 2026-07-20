"use client";

import { motion } from "framer-motion";
import { LayoutTemplate } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { SYSTEM_TEMPLATES } from "@/lib/system-templates";
import { useProjectStore } from "@/store/project-store";
import { TemplateCard } from "@/components/templates/template-card";
import { CreateTemplateForm } from "@/components/templates/create-template-dialog";

export default function TemplatesPage() {
  const customTemplates = useProjectStore((s) => s.customTemplates);

  return (
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Шаблоны задач</h1>
          <p className="mt-2 text-muted-foreground">
            Системные и пользовательские шаблоны для быстрого старта
          </p>
        </div>
        <CreateTemplateForm />
      </motion.div>

      {customTemplates.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Мои шаблоны</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {customTemplates.map((template, i) => (
              <TemplateCard key={template.id} template={template} index={i} />
            ))}
          </div>
        </section>
      )}

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Системные шаблоны</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {SYSTEM_TEMPLATES.map((template, i) => (
            <TemplateCard key={template.id} template={template} index={i} />
          ))}
        </div>
      </section>

      {customTemplates.length === 0 && (
        <Card className="border-dashed border-border/50">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <LayoutTemplate className="mb-3 h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">
              Создайте свой шаблон — он появится в разделе «Мои шаблоны»
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
