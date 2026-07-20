import type { AgentRun } from "@/lib/suvenir-types";
import type { GenerationMode } from "@/lib/types";
import { formatAgentError } from "@/lib/format-agent-error";

export type AgentDiscoveryStatus = {
  progress: number;
  label: string;
  sublabel: string;
};

export function getAgentDiscoveryStatus(
  run: AgentRun | null | undefined,
  elapsedMs = 0,
  mode: GenerationMode = "creative",
): AgentDiscoveryStatus {
  const isCatalog = mode === "catalog";

  if (!run) {
    return {
      progress: 5,
      label: "Готовимся к работе…",
      sublabel: isCatalog
        ? "Собираем 5 наборов под задачу и бюджет"
        : "Придумываем несколько направлений",
    };
  }
  if (run.status === "failed") {
    return {
      progress: 0,
      label: formatAgentError(run.error),
      sublabel: "Попробуйте ещё раз через минуту",
    };
  }

  if (run.status === "awaiting_idea_selection" || run.status === "idea_selected") {
    return {
      progress: 100,
      label: "Концепции готовы",
      sublabel: "Переходим к результатам…",
    };
  }

  const step = run.currentStep ?? "";

  if (isCatalog) {
    if (run.status === "queued") {
      return {
        progress: Math.min(20, 10 + elapsedMs / 2500),
        label: "Ставим задачу в очередь…",
        sublabel: "Скоро начнём подбор наборов",
      };
    }
    if (step === "catalog_ideation" || run.status === "running") {
      return {
        progress: Math.min(88, 25 + elapsedMs / 3500),
        label: "Подбираем предметы, которые дружат между собой…",
        sublabel: "Учитываем бюджет, цвета и наличие",
      };
    }
    if (step === "catalog_previews") {
      return {
        progress: 95,
        label: "Собираем наборы в понятные карточки…",
        sublabel: "Прикрепляем фото товаров",
      };
    }
  }

  if (run.status === "queued") {
    return {
      progress: Math.min(16, 10 + elapsedMs / 2500),
      label: "Ставим задачу в очередь…",
      sublabel: "Скоро начнём разбирать бриф",
    };
  }

  if (step === "previews") {
    return {
      progress: Math.min(96, 72 + elapsedMs / 3500),
      label: "Рисуем быстрые эскизы идей…",
      sublabel: "Делаем схематичные превью, чтобы идея читалась сразу",
    };
  }

  if (step === "critic" || run.ideatorOutput) {
    return {
      progress: Math.min(92, 55 + elapsedMs / 4000),
      label: "Отбираем самые сильные идеи…",
      sublabel: "Оцениваем уместность, стиль и разнообразие",
    };
  }

  return {
    progress: Math.min(54, 18 + elapsedMs / 5000),
    label: "Придумываем несколько направлений…",
    sublabel: "Разбираем бриф, категорию и стиль",
  };
}
