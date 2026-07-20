import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { regenerateSlide } from "@/lib/presentation-ai/services/pipeline.service";

const bodySchema = z.object({
  slideId: z.string().min(1),
  prompt: z.string().max(500).optional(),
  regenerateImage: z.boolean().optional().default(true),
});

export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const updated = await regenerateSlide(id, {
      slideId: body.slideId,
      prompt: body.prompt,
      regenerateImage: body.regenerateImage,
    });

    if (!updated) {
      return NextResponse.json({ error: "Слайд или презентация не найдены" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные параметры перегенерации" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Ошибка перегенерации";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
