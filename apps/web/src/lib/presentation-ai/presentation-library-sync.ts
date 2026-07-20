import type { GeneratedPresentation as AiPresentation } from "@/lib/presentation-ai/types";
import type { GeneratedPresentation as LibraryPresentation } from "@/lib/brand-palette";

export function aiJobToLibraryStatus(
  status: AiPresentation["status"],
): LibraryPresentation["status"] {
  if (status === "completed") return "done";
  if (status === "failed") return "failed";
  return "generating";
}

export function aiJobToLibraryEntry(job: AiPresentation): LibraryPresentation {
  return {
    id: job.id,
    kind: "ai",
    title: job.title,
    prompt: job.brand.description?.trim() || job.concept?.bigIdea?.slice(0, 200) || "",
    visualizationIds: job.visualizationIds ?? [],
    status: aiJobToLibraryStatus(job.status),
    slideCount: job.slides?.length ?? 0,
    downloadUrl: job.outputs.pptxUrl,
    htmlUrl: job.outputs.htmlUrl,
    fileName: job.outputs.pptxUrl
      ? `${job.title.replace(/[^\wа-яА-ЯёЁ\s-]/gi, "").trim() || "presentation"}.pptx`
      : undefined,
    error: job.error,
    createdAt: job.createdAt,
  };
}
