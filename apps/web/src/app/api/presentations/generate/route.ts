import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CreditAction } from "@prisma/client";
import { spendCreditsForRequest } from "@/lib/api-credits";
import { getSessionUserId } from "@/lib/auth";
import { refundCredits } from "@/lib/credits";
import { isOpenRouterEnabled } from "@/lib/openrouter-client";
import type { BrandPaletteSettings } from "@/lib/brand-palette";
import { visualizationsToPresentationInput } from "@/lib/presentation-ai/adapters/visualizations-adapter";
import { executePresentationPipeline } from "@/lib/presentation-ai/services/pipeline.service";
import { resolvePresentationInputImages } from "@/lib/presentation-ai/services/resolve-reference-images";
import type { PresentationVisualizationInput } from "@/lib/presentation/presentation-types";

export const maxDuration = 600;

const visualizationSchema = z.object({
  id: z.string(),
  conceptName: z.string(),
  imageUrl: z.string(),
  description: z.string().optional(),
  isCatalog: z.boolean().optional(),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        description: z.string().optional(),
        price: z.number().optional(),
        imageUrl: z.string().optional(),
        article: z.string().optional(),
        supplier: z.string().optional(),
      }),
    )
    .optional(),
});

const bodySchema = z.object({
  title: z.string().min(1),
  prompt: z.string().min(8),
  projectId: z.string().optional(),
  visualizationIds: z.array(z.string()).min(1),
  visualizations: z.array(visualizationSchema).min(1),
  brand: z
    .object({
      detectedColors: z.array(z.string()),
      activeColors: z.array(z.string()),
      detectedStyle: z.string(),
      activeStyle: z.string(),
      manualOverride: z.boolean(),
    })
    .optional(),
  logoDataUrl: z.string().optional(),
});

function toAbsoluteAssetUrl(url: string, origin: string): string {
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) {
    return url;
  }
  if (url.startsWith("/")) return `${origin}${url}`;
  return `${origin}/${url}`;
}

function fileNameFromUrl(url: string): string {
  const parts = url.split("/");
  return parts[parts.length - 1] ?? "presentation.pptx";
}

export async function POST(request: NextRequest) {
  let spend: Awaited<ReturnType<typeof spendCreditsForRequest>> | null = null;

  try {
    const body = bodySchema.parse(await request.json());

    spend = await spendCreditsForRequest("PPTX_EXPORT", {
      projectId: body.projectId,
      visualizationIds: body.visualizationIds,
    });
    if (!spend.ok) return spend.response;

    if (!isOpenRouterEnabled()) {
      return NextResponse.json(
        { error: "Генерация презентаций недоступна: не настроен OpenRouter API" },
        { status: 503 },
      );
    }

    const origin = request.nextUrl.origin;
    const visualizations: PresentationVisualizationInput[] = body.visualizations.map((v) => ({
      ...v,
      imageUrl: toAbsoluteAssetUrl(v.imageUrl, origin),
      items: v.items?.map((item) => ({
        ...item,
        imageUrl: item.imageUrl ? toAbsoluteAssetUrl(item.imageUrl, origin) : undefined,
      })),
    }));

    const presentationInput = await resolvePresentationInputImages(
      visualizationsToPresentationInput({
        title: body.title,
        prompt: body.prompt,
        visualizations,
        brand: body.brand as BrandPaletteSettings | undefined,
        logoDataUrl: body.logoDataUrl,
      }),
    );

    if (presentationInput.products.length === 0) {
      return NextResponse.json(
        { error: "Не удалось извлечь товары из выбранных визуализаций" },
        { status: 400 },
      );
    }

    if (presentationInput.products.every((p) => !(p.images?.length ?? 0))) {
      console.warn(
        "[presentations/generate] no catalog product images resolved — check concept items / previewProductImageUrls",
      );
    }

    const requestUserId = await getSessionUserId();
    const result = await executePresentationPipeline({ ...presentationInput, userId: requestUserId });

    const downloadUrl = result.outputs.pptxUrl ?? result.outputs.htmlUrl;
    if (!downloadUrl) {
      throw new Error("Не удалось экспортировать презентацию");
    }

    return NextResponse.json({
      success: true,
      presentationId: result.id,
      status: "done",
      downloadUrl,
      htmlUrl: result.outputs.htmlUrl,
      fileName: fileNameFromUrl(downloadUrl),
      slideCount: result.slides.length,
      aiGenerated: true,
      quality: result.quality,
      creditsUsed: spend.cost,
      creditsRemaining: spend.creditsRemaining,
    });
  } catch (error) {
    const userId = await getSessionUserId();
    if (userId && spend?.ok && spend.cost > 0) {
      try {
        await refundCredits({
          userId,
          action: CreditAction.PPTX_EXPORT,
          amount: spend.cost,
          metadata: { reason: "presentation_generation_failed" },
        });
      } catch (refundError) {
        console.error("[presentations/generate] refund failed", refundError);
      }
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Некорректные данные для презентации" }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : "Не удалось создать презентацию";
    console.error("[presentations/generate]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
