import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { spendCreditsForRequest } from "@/lib/api-credits";
import { creditActionForExportFormat } from "@/lib/credit-costs";
import { APP_NAME } from "@/lib/constants";

const exportSchema = z.object({
  conceptId: z.string(),
  format: z.enum(["pdf", "pptx", "docx"]),
  concept: z.object({
    name: z.string(),
    description: z.string(),
    totalCost: z.number(),
    tags: z.array(z.string()),
    items: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        price: z.number(),
      })
    ),
  }),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { format, concept, conceptId } = exportSchema.parse(body);
    const action = creditActionForExportFormat(format);
    const spend = await spendCreditsForRequest(action, { format, conceptId });
    if (!spend.ok) return spend.response;

    const content = generateExportContent(concept, format);

    return NextResponse.json({
      success: true,
      format,
      filename: `${concept.name.replace(/\s+/g, "_")}.${format}`,
      content,
      creditsUsed: spend.cost,
      creditsRemaining: spend.creditsRemaining,
      message: `Экспорт в ${format.toUpperCase()} готов к скачиванию`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
    }
    console.error("[export]", error);
    return NextResponse.json({ error: "Ошибка экспорта" }, { status: 500 });
  }
}

function generateExportContent(
  concept: z.infer<typeof exportSchema>["concept"],
  format: string
): string {
  const lines = [
    `КОНЦЕПЦИЯ: ${concept.name}`,
    `Формат: ${format.toUpperCase()}`,
    "",
    "ОПИСАНИЕ",
    concept.description,
    "",
    `Предварительная стоимость: ${concept.totalCost} ₽`,
    `Теги: ${concept.tags.join(", ")}`,
    "",
    "СОСТАВ НАБОРА",
    ...concept.items.map(
      (item, i) =>
        `${i + 1}. ${item.name} — ${item.price} ₽\n   ${item.description}`
    ),
    "",
    `— ${APP_NAME}`,
  ];
  return lines.join("\n");
}
