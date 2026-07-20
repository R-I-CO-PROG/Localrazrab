import { NextRequest, NextResponse } from "next/server";
import { CreditAction } from "@prisma/client";
import { spendCreditsForRequest } from "@/lib/api-credits";
import { getSessionUserId } from "@/lib/auth";
import { refundCredits } from "@/lib/credits";
import {
  renderSuvenirGeneration,
  selectCreativeConcept,
} from "@/lib/suvenir-server";
import type { ConceptGenerationInput } from "@/lib/generation-payload";

export const maxDuration = 600;

export async function POST(req: NextRequest) {
  const spend = await spendCreditsForRequest(CreditAction.VISUALIZATION);
  if (!spend.ok) return spend.response;

  try {
    const body = (await req.json()) as {
      requestId: string;
      input: ConceptGenerationInput;
      chosenIdeaTitle: string;
    };
    if (!body.requestId || !body.chosenIdeaTitle || !body.input) {
      return NextResponse.json({ message: "Missing fields" }, { status: 400 });
    }
    await selectCreativeConcept(body.requestId, body.chosenIdeaTitle);
    const result = await renderSuvenirGeneration(body.requestId, body.input, {
      chosenIdeaTitle: body.chosenIdeaTitle,
    });
    return NextResponse.json({
      ...result,
      creditsUsed: spend.cost,
      creditsRemaining: spend.creditsRemaining,
    });
  } catch (err) {
    const userId = await getSessionUserId();
    if (userId && spend.cost > 0) {
      try {
        await refundCredits({
          userId,
          action: CreditAction.VISUALIZATION,
          amount: spend.cost,
          metadata: { reason: "render_failed" },
        });
      } catch (refundError) {
        console.error("[concepts/render] refund failed", refundError);
      }
    }
    const message = err instanceof Error ? err.message : "Render failed";
    return NextResponse.json({ message }, { status: 500 });
  }
}
