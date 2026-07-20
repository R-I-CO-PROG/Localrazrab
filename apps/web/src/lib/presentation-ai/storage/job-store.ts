import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { GeneratedPresentation, PresentationGenerationInput } from "../types";

export async function saveJob(presentation: GeneratedPresentation): Promise<void> {
  const data = presentation as unknown as Prisma.InputJsonValue;
  await prisma.aiPresentationJob.upsert({
    where: { id: presentation.id },
    create: {
      id: presentation.id,
      userId: presentation.userId ?? undefined,
      title: presentation.title,
      status: presentation.status,
      progress: presentation.progress,
      data,
    },
    update: {
      title: presentation.title,
      status: presentation.status,
      progress: presentation.progress,
      data,
    },
  });
}

export async function loadJob(id: string): Promise<GeneratedPresentation | null> {
  const row = await prisma.aiPresentationJob.findUnique({ where: { id } });
  if (!row) return null;
  return row.data as unknown as GeneratedPresentation;
}

export async function listJobsForUser(userId: string): Promise<GeneratedPresentation[]> {
  const rows = await prisma.aiPresentationJob.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((row) => row.data as unknown as GeneratedPresentation);
}

export async function updateJob(
  id: string,
  patch: Partial<GeneratedPresentation>,
): Promise<GeneratedPresentation | null> {
  const current = await loadJob(id);
  if (!current) return null;

  const updated: GeneratedPresentation = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await saveJob(updated);
  return updated;
}

export function createInitialJob(
  id: string,
  input: PresentationGenerationInput,
): GeneratedPresentation {
  const now = new Date().toISOString();
  return {
    id,
    userId: input.userId ?? null,
    status: "queued",
    progress: 0,
    title: `${input.brand.name} — презентация`,
    brand: input.brand,
    theme: {
      id: input.stylePreset ?? "premium_dark_tech",
      name: input.stylePreset ?? "premium_dark_tech",
      colors: {
        background: "#020818",
        backgroundSecondary: "#0C2848",
        primary: "#005BFF",
        accent: "#00B7FF",
        text: "#FFFFFF",
        mutedText: "#94A3B8",
        border: "rgba(0,183,255,0.35)",
        card: "rgba(12,40,72,0.72)",
      },
      typography: {
        headingFont: "Arial Black, sans-serif",
        bodyFont: "Arial, sans-serif",
        headingWeight: 800,
        bodyWeight: 400,
      },
      effects: {
        glow: true,
        glassmorphism: true,
        noise: true,
        gradients: true,
        reflections: true,
      },
      layout: { aspectRatio: "16:9", safeMargin: 48, gridColumns: 12 },
    },
    slides: [],
    assets: [],
    outputs: {},
    products: input.products,
    visualizationIds: input.visualizationIds,
    quality: input.quality ?? "standard",
    language: input.language ?? "ru",
    aiCalls: 0,
    createdAt: now,
    updatedAt: now,
  };
}
