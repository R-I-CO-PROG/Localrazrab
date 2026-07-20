import { PROJECT_CATEGORIES } from "@/lib/types";

const GENERIC_TITLES = new Set([
  ...PROJECT_CATEGORIES.map((c) => c.label),
  "Новая концепция",
]);

export function isGenericProjectTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) return true;
  return GENERIC_TITLES.has(trimmed);
}

function cleanBriefExcerpt(description: string): string {
  const firstLine = description.split(/\n+/)[0] ?? "";
  return firstLine
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-•*]\s*/, "");
}

function formatProjectDate(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export function buildProjectTitle(input: {
  description?: string;
  category?: string;
  quantity?: number;
  createdAt?: string;
  conceptName?: string;
}): string {
  const category = (input.category || "Проект").trim();
  const excerpt = cleanBriefExcerpt(input.description ?? "");
  const datePart = formatProjectDate(input.createdAt);

  if (input.conceptName && !isGenericProjectTitle(input.conceptName)) {
    return `${category} · ${input.conceptName}`;
  }

  if (excerpt.length >= 8) {
    const short = excerpt.length > 52 ? `${excerpt.slice(0, 49)}…` : excerpt;
    return `${category} · ${short}`;
  }

  const qty = input.quantity && input.quantity > 0 ? `${input.quantity} шт.` : null;
  return [category, qty, datePart].filter(Boolean).join(" · ");
}

export function enrichProjectTitleIfGeneric<
  T extends {
    title: string;
    category?: string;
    quantity?: number;
    createdAt?: string;
    briefExcerpt?: string;
  },
>(project: T, description?: string): T {
  if (!isGenericProjectTitle(project.title)) return project;

  const title = buildProjectTitle({
    description: description ?? project.briefExcerpt ?? "",
    category: project.category,
    quantity: project.quantity,
    createdAt: project.createdAt,
  });

  if (title === project.title) return project;
  return { ...project, title, briefExcerpt: project.briefExcerpt ?? cleanBriefExcerpt(description ?? "").slice(0, 160) };
}
