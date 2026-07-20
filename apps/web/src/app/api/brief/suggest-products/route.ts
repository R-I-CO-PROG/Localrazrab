import { NextRequest, NextResponse } from "next/server";

import { suggestProductsFromBrief } from "@/lib/suvenir-server";

import type { ConceptGenerationInput } from "@/lib/generation-payload";

import { parseRequestBody } from "@/lib/parse-request-body";

import { requireAiAuth } from "@/lib/require-ai-auth";



export const maxDuration = 120;



export async function POST(req: NextRequest) {

  const denied = await requireAiAuth();

  if (denied) return denied;

  try {

    const { payload: body, logo: logoFile } = await parseRequestBody<

      ConceptGenerationInput & { requestId?: string }

    >(req);

    const result = await suggestProductsFromBrief(body, logoFile, body.requestId);

    return NextResponse.json(result);

  } catch (err) {

    const message = err instanceof Error ? err.message : "Suggest failed";

    return NextResponse.json({ message }, { status: 500 });

  }

}

