import { NextRequest, NextResponse } from "next/server";
import { loadJob } from "@/lib/presentation-ai/storage/job-store";
import { renderSingleSlideHtml } from "@/lib/presentation-ai/renderer/html-deck";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; slideId: string }> },
) {
  const { id, slideId } = await context.params;
  const job = await loadJob(id);
  if (!job) {
    return NextResponse.json({ error: "Презентация не найдена" }, { status: 404 });
  }
  const slide = job.slides.find((s) => s.id === slideId);
  if (!slide) {
    return NextResponse.json({ error: "Слайд не найден" }, { status: 404 });
  }
  const html = renderSingleSlideHtml(slide, job.theme);
  return new NextResponse(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
