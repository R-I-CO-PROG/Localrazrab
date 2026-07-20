import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { selectSlideVariant } from "@/lib/presentation-ai/services/pipeline.service";

const bodySchema = z.object({
  slideId: z.string().min(1),
  variantIndex: z.number().int().min(0),
});

export const maxDuration = 120;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const body = bodySchema.parse(await request.json());
    const updated = await selectSlideVariant(id, body.slideId, body.variantIndex);

    if (!updated) {
      return NextResponse.json({ error: "Слайд или версия не найдены" }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Укажите slideId и variantIndex" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Ошибка переключения версии";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
