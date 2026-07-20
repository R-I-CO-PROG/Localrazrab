import type { LogicPanelId } from "@/lib/logic/types";

export const LOGIC_NAV: { id: LogicPanelId; icon: string; label: string }[] = [
  { id: "overview", icon: "◎", label: "Обзор" },
  { id: "catalog", icon: "📦", label: "Каталог" },
  { id: "journeys", icon: "→", label: "Сценарии" },
  { id: "pages", icon: "▣", label: "Страницы и кнопки" },
  { id: "api", icon: "⬡", label: "API" },
  { id: "queues", icon: "⚙", label: "Очереди" },
  { id: "agents", icon: "🤖", label: "Агенты" },
  { id: "image", icon: "🖼", label: "Image pipeline" },
  { id: "prompts", icon: "✎", label: "Промпты" },
  { id: "data", icon: "▤", label: "Модель данных" },
  { id: "env", icon: "⚙", label: "Environment" },
  { id: "map", icon: "◈", label: "Карта связей" },
];

export function methodClass(method?: string) {
  switch (method?.toUpperCase()) {
    case "GET":
      return "bg-primary/15 text-primary";
    case "POST":
      return "bg-sky-500/15 text-sky-400";
    case "PATCH":
      return "bg-amber-500/15 text-amber-400";
    case "DELETE":
      return "bg-destructive/15 text-destructive";
    default:
      return "bg-secondary text-muted-foreground";
  }
}
