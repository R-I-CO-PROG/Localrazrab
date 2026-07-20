"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type ConceptStep = "brief" | "set" | "concept";

const CATALOG_STEPS = [
  { id: "brief" as const, label: "Бриф", hint: "Задача и материалы" },
  { id: "set" as const, label: "Набор", hint: "Товары и подбор" },
  { id: "concept" as const, label: "Фото", hint: "Финальная визуализация" },
];

const CREATIVE_STEPS = [
  { id: "brief" as const, label: "Идея", hint: "Промпт и логотип" },
  { id: "concept" as const, label: "Концепция", hint: "AI-визуал" },
];

export function resolveConceptStep(
  status: string,
  hasProducts: boolean,
  hasBrief: boolean,
  creativeMode = false,
): ConceptStep {
  if (status === "generating" || status === "done" || status === "failed" || status === "ready") {
    return "concept";
  }
  if (creativeMode) return hasBrief ? "concept" : "brief";
  if (hasProducts) return "set";
  if (hasBrief) return "brief";
  return "brief";
}

type Props = {
  activeStep: ConceptStep;
  variant?: "catalog" | "creative";
};

export function ConceptStepper({ activeStep, variant = "catalog" }: Props) {
  const steps = variant === "creative" ? CREATIVE_STEPS : CATALOG_STEPS;
  const activeIndex = steps.findIndex((s) => s.id === activeStep);

  return (
    <nav aria-label="Шаги" className="flex flex-col gap-2 sm:flex-row sm:gap-0">
      {steps.map((step, index) => {
        const done = index < activeIndex;
        const active = index === activeIndex;
        return (
          <div key={step.id} className="flex flex-1 items-center min-w-0">
            <div
              className={cn(
                "flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 transition-colors",
                active && "border-primary/30 bg-primary/10",
                done && "border-green-500/20 bg-green-500/5",
                !active && !done && "border-border/60 bg-card/50",
              )}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                  active && "bg-primary text-primary-foreground",
                  done && "bg-green-600 text-white",
                  !active && !done && "border border-border bg-background text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <div className="min-w-0">
                <p className={cn("truncate text-sm font-semibold", active && "text-primary")}>
                  {step.label}
                </p>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">{step.hint}</p>
              </div>
            </div>
            {index < steps.length - 1 && (
              <div className="mx-1 hidden h-px w-4 shrink-0 bg-border sm:block" aria-hidden />
            )}
          </div>
        );
      })}
    </nav>
  );
}
