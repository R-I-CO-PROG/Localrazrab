import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { loadJob, updateJob } from "@/lib/presentation-ai/storage/job-store";
import { renderHtmlDeck } from "@/lib/presentation-ai/renderer/html-deck";
import { generatePremiumPptxBuffer } from "@/lib/presentation-ai/renderer/slide-compositor";
import { renderSlidesToPdf } from "@/lib/presentation-ai/renderer/html-to-pdf";
import type { OutputFormat } from "@/lib/presentation-ai/types";

const bodySchema = z.object({
  formats: z.array(z.enum(["pdf", "pptx", "html"])).optional(),
});

function uploadsDir() {
  return process.env.UPLOADS_DIR || join(process.cwd(), "../../uploads");
}

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const job = await loadJob(id);

    if (!job) {
      return NextResponse.json({ error: "Презентация не найдена" }, { status: 404 });
    }

    if (job.status !== "completed") {
      return NextResponse.json({ error: "Презентация ещё генерируется" }, { status: 409 });
    }

    const formats: OutputFormat[] = body.formats ?? ["pptx", "html"];
    const dir = join(uploadsDir(), "presentations", "ai", id);
    await mkdir(dir, { recursive: true });
    const safeName = job.title.replace(/[^\wа-яА-Я\d_-]+/gi, "_").slice(0, 60);
    const outputs = { ...job.outputs };

    if (formats.includes("html")) {
      const html = renderHtmlDeck({ presentation: job, logoUrl: job.brand.logoUrl });
      const htmlName = `${safeName}.html`;
      await writeFile(join(dir, htmlName), html, "utf-8");
      outputs.htmlUrl = `/uploads/presentations/ai/${id}/${htmlName}`;
    }

    if (formats.includes("pptx")) {
      const buffer = await generatePremiumPptxBuffer({
        title: job.title,
        slides: job.slides,
        theme: job.theme,
        logoUrl: job.brand.logoUrl,
        brandName: job.brand.name,
        brandWebsite: job.brand.website,
      });
      const pptxName = `${safeName}.pptx`;
      await writeFile(join(dir, pptxName), buffer);
      outputs.pptxUrl = `/uploads/presentations/ai/${id}/${pptxName}`;
    }

    if (formats.includes("pdf")) {
      try {
        const pdfBuffer = await renderSlidesToPdf(job.slides, job.theme);
        const pdfName = `${safeName}.pdf`;
        await writeFile(join(dir, pdfName), pdfBuffer);
        outputs.pdfUrl = `/uploads/presentations/ai/${id}/${pdfName}`;
      } catch (error) {
        console.error("[presentations/ai/export] pdf generation failed", error);
        outputs.pdfUrl = outputs.pptxUrl ?? outputs.htmlUrl;
      }
    }

    await updateJob(id, { outputs });
    return NextResponse.json({ outputs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ошибка экспорта";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
