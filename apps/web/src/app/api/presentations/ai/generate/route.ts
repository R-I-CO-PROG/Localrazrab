import { NextRequest, NextResponse } from "next/server";
import { presentationGenerationInputSchema } from "@/lib/presentation-ai/schemas";
import { startPresentationJob } from "@/lib/presentation-ai/services/pipeline.service";
import { isOpenRouterEnabled } from "@/lib/openrouter-client";
import { getSessionUserId } from "@/lib/auth";

export const maxDuration = 600;

export async function POST(request: NextRequest) {
  try {
    const body = presentationGenerationInputSchema.parse(await request.json());

    if (!isOpenRouterEnabled()) {
      return NextResponse.json(
        {
          error:
            "Для генерации презентаций нужен OpenRouter (OPENROUTER_API_KEY). Черновик без AI недоступен в этом режиме.",
        },
        { status: 503 },
      );
    }

    if (!body.brand.name?.trim()) {
      return NextResponse.json({ error: "Укажите название бренда" }, { status: 400 });
    }

    if (body.products.length === 0) {
      return NextResponse.json({ error: "Добавьте хотя бы один товар" }, { status: 400 });
    }

    const userId = await getSessionUserId();
    const job = await startPresentationJob({ ...body, userId });

    return NextResponse.json({
      presentationId: job.id,
      jobId: job.id,
      status: job.status,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Некорректные данные запроса" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Не удалось создать задачу";
    console.error("[presentations/ai/generate]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
