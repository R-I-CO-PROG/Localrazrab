import { NextRequest, NextResponse } from "next/server";
import { CreditAction } from "@prisma/client";
import { spendCreditsForRequest, type SpendCreditsResult } from "@/lib/api-credits";
import { getSessionUserId } from "@/lib/auth";
import { refundCredits } from "@/lib/credits";
import {
  prepareSuvenirRequest,
} from "@/lib/suvenir-server";
import type { ConceptGenerationInput } from "@/lib/generation-payload";
import { parseRequestBody } from "@/lib/parse-request-body";

export const maxDuration = 600;

export async function POST(req: NextRequest) {
  let spendResult: Extract<SpendCreditsResult, { ok: true }> | null = null;
  try {
    const spend = await spendCreditsForRequest(CreditAction.CONCEPT_GENERATION);
    if (!spend.ok) return spend.response;
    spendResult = spend;

    const { payload: input, logo: logoFile } =
      await parseRequestBody<ConceptGenerationInput>(req);

    if (input.generationMode === "creative") {
      const { requestId, project } = await prepareSuvenirRequest(
        input,
        logoFile,
        input.requestId,
      );
      return NextResponse.json({
        phase: "creative",
        requestId,
        project,
        creditsUsed: spend.cost,
        creditsRemaining: spend.creditsRemaining,
      });
    }

    const { requestId, project } = await prepareSuvenirRequest(
      input,
      logoFile,
      input.requestId,
    );
    return NextResponse.json({
      phase: "catalog",
      requestId,
      project,
      creditsUsed: spend.cost,
      creditsRemaining: spend.creditsRemaining,
    });
  } catch (err) {
    const userId = await getSessionUserId();
    if (userId && spendResult && spendResult.cost > 0) {
      try {
        await refundCredits({
          userId,
          action: CreditAction.CONCEPT_GENERATION,
          amount: spendResult.cost,
          metadata: { reason: "generation_failed" },
        });
      } catch (refundError) {
        console.error("[concepts/generate] refund failed", refundError);
      }
    }

    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : "Generation failed";
    console.error("[concepts/generate]", message, err);
    const status = /required|invalid|не более|поврежд|формат|Logo upload|must not be greater|must not be less|Only draft|Forbidden|cannot be edited|Unknown argument|column|Unable to fit|Bad Request|fetch failed/i.test(
      message,
    )
      ? 400
      : 500;
    return NextResponse.json({ message, error: message }, { status });
  }
}
